import type { AppConfig } from '../../src/config/config';
import {
  CAPTCHA_FAILURES_PER_IP,
  LOGIN_FAILURES_PER_IP,
  LOGIN_FAILURES_PER_USERNAME,
  LOGIN_FAILURE_WINDOW_MS,
  LoginAttemptLimiter,
} from '../../src/auth/login-attempt-limiter';

/**
 * Limite des échecs de connexion : une école entière partage une adresse IP, seuls les échecs comptent.
 * La tentative est réservée avant argon2, pour qu'une rafale parallèle ne passe pas la limite.
 */
describe('LoginAttemptLimiter', () => {
  let now = 0;
  const limiter = (loginRateLimit = 5) => new LoginAttemptLimiter({ loginRateLimit } as AppConfig, () => now);
  const fill = (target: LoginAttemptLimiter, count: number, ip: (i: number) => string, username: (i: number) => string) => {
    for (let i = 0; i < count; i += 1) expect(target.reserve(ip(i), username(i)).allowed).toBe(true);
  };

  beforeEach(() => {
    now = 1_000_000;
  });

  it('bloque un identifiant après trop d’échecs, quelle que soit l’adresse IP', () => {
    const target = limiter();
    fill(target, LOGIN_FAILURES_PER_USERNAME, (i) => `10.0.0.${i}`, () => 'admin');
    expect(target.reserve('10.9.9.9', 'admin').allowed).toBe(false);
    expect(target.reserve('10.9.9.9', 'autre').allowed).toBe(true);
  });

  it('bloque une adresse IP qui essaie un mot de passe sur beaucoup de comptes', () => {
    const target = limiter();
    fill(target, LOGIN_FAILURES_PER_IP, () => '10.0.0.1', (i) => `compte${i}`);
    expect(target.reserve('10.0.0.1', 'nouveau').allowed).toBe(false);
    expect(target.reserve('10.0.0.2', 'nouveau').allowed).toBe(true);
  });

  it('une arrivée de 50 employés derrière la même adresse IP passe, car les réussites ne comptent pas', () => {
    const target = limiter();
    for (let round = 0; round < 3; round += 1) {
      for (let i = 0; i < 50; i += 1) {
        expect(target.reserve('10.0.0.1', `employe${i}`).allowed).toBe(true);
      }
      for (let i = 0; i < 50; i += 1) target.succeed('10.0.0.1', `employe${i}`);
    }
  });

  it('une réussite efface les échecs de l’identifiant', () => {
    const target = limiter();
    fill(target, LOGIN_FAILURES_PER_USERNAME - 1, () => '10.0.0.1', () => 'admin');
    target.reserve('10.0.0.1', 'admin');
    target.succeed('10.0.0.1', 'admin');
    fill(target, LOGIN_FAILURES_PER_USERNAME, () => '10.0.0.1', () => 'admin');
  });

  it('la limite repart après la fenêtre', () => {
    const target = limiter();
    fill(target, LOGIN_FAILURES_PER_USERNAME, () => '10.0.0.1', () => 'admin');
    now += LOGIN_FAILURE_WINDOW_MS + 1;
    expect(target.reserve('10.0.0.1', 'admin').allowed).toBe(true);
  });

  it('ne signale un blocage qu’une fois par fenêtre, pour ne pas inonder le journal', () => {
    const target = limiter();
    fill(target, LOGIN_FAILURES_PER_USERNAME, () => '10.0.0.1', () => 'admin');
    expect(target.reserve('10.0.0.1', 'admin')).toEqual({ allowed: false, firstBlock: true });
    expect(target.reserve('10.0.0.1', 'admin')).toEqual({ allowed: false, firstBlock: false });
  });

  it('borne sa mémoire malgré des identifiants tous différents', () => {
    const target = limiter();
    for (let i = 0; i < 25_000; i += 1) target.reserve(`10.${i % 250}.${i % 249}.${i % 251}`, `compte${i}`);
    expect(target.trackedKeys()).toBeLessThanOrEqual(10_000);
  });

  it('les tests de bout en bout relèvent la limite comme pour la limite par couple', () => {
    const target = limiter(1000);
    fill(target, 1000, () => '127.0.0.1', () => 'admin');
    expect(target.reserve('127.0.0.1', 'admin').allowed).toBe(false);
  });

  describe('refus du CAPTCHA, par adresse IP', () => {
    const fillCaptcha = (target: LoginAttemptLimiter, ip: string, count = CAPTCHA_FAILURES_PER_IP) => {
      for (let i = 0; i < count; i += 1) expect(target.reserveCaptcha(ip).allowed).toBe(true);
    };

    it('coupe une adresse IP après trop de refus, et le signale une fois', () => {
      const target = limiter();
      fillCaptcha(target, '10.0.0.1');
      expect(target.reserveCaptcha('10.0.0.1')).toEqual({ allowed: false, firstBlock: true });
      expect(target.reserveCaptcha('10.0.0.1')).toEqual({ allowed: false, firstBlock: false });
      expect(target.reserveCaptcha('10.0.0.2').allowed).toBe(true);
      now += LOGIN_FAILURE_WINDOW_MS + 1;
      expect(target.reserveCaptcha('10.0.0.1').allowed).toBe(true);
    });

    it('n’entame pas la marge des mots de passe, ni l’inverse : des jetons expirés ne bloquent pas une école', () => {
      const target = limiter();
      fillCaptcha(target, '10.0.0.1');
      expect(target.reserve('10.0.0.1', 'enseignante').allowed).toBe(true);

      fill(target, LOGIN_FAILURES_PER_IP, () => '10.0.0.5', (i) => `compte${i}`);
      expect(target.reserveCaptcha('10.0.0.5').allowed).toBe(true);
    });

    it('rendre la place efface la réservation, sans jamais descendre sous zéro', () => {
      const target = limiter();
      for (let i = 0; i < CAPTCHA_FAILURES_PER_IP * 2; i += 1) {
        expect(target.reserveCaptcha('10.0.0.1').allowed).toBe(true);
        target.releaseCaptcha('10.0.0.1');
      }
      target.releaseCaptcha('10.0.0.1');
      fillCaptcha(target, '10.0.0.1');
      expect(target.reserveCaptcha('10.0.0.1').allowed).toBe(false);
    });

    it('une panne n’est signalée qu’une fois par adresse et par fenêtre', () => {
      const target = limiter();
      expect(target.firstOutage('10.0.0.1')).toBe(true);
      expect(target.firstOutage('10.0.0.1')).toBe(false);
      expect(target.firstOutage('10.0.0.2')).toBe(true);
      now += LOGIN_FAILURE_WINDOW_MS + 1;
      expect(target.firstOutage('10.0.0.1')).toBe(true);
    });
  });
});
