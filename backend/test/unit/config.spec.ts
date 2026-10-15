import { ConfigError, loadConfig } from '../../src/config/config';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/app',
  SESSION_SECRET: 'x'.repeat(32),
  FILES_DIR: './data/files',
  APP_ORIGIN: 'https://demandes.ecole.fr/',
};

describe('loadConfig', () => {
  it('charge une configuration valide avec les valeurs par défaut', () => {
    const config = loadConfig(valid);
    expect(config.appOrigin).toBe('https://demandes.ecole.fr');
    expect(config.port).toBe(3002);
    expect(config.ffmpegPath).toBe('ffmpeg');
  });

  it.each(['DATABASE_URL', 'SESSION_SECRET', 'FILES_DIR', 'APP_ORIGIN'])(
    'refuse de démarrer sans %s',
    (key) => {
      expect(() => loadConfig({ ...valid, [key]: '' })).toThrow(ConfigError);
    },
  );

  it('rend le cookie Secure par défaut, et toujours en production', () => {
    expect(loadConfig(valid).cookieSecure).toBe(true);
    expect(loadConfig({ ...valid, COOKIE_SECURE: 'false' }).cookieSecure).toBe(false);
    expect(loadConfig({ ...valid, COOKIE_SECURE: 'false', NODE_ENV: 'production' }).cookieSecure).toBe(true);
  });

  it('limite les connexions à 5 par minute, réglable hors production uniquement', () => {
    expect(loadConfig(valid).loginRateLimit).toBe(5);
    expect(loadConfig({ ...valid, LOGIN_RATE_LIMIT: '1000' }).loginRateLimit).toBe(1000);
    expect(loadConfig({ ...valid, LOGIN_RATE_LIMIT: '1000', NODE_ENV: 'production' }).loginRateLimit).toBe(5);
  });

  it('active les jobs planifiés sauf si JOBS_ENABLED=false', () => {
    expect(loadConfig(valid).jobsEnabled).toBe(true);
    expect(loadConfig({ ...valid, JOBS_ENABLED: 'false' }).jobsEnabled).toBe(false);
  });

  it('refuse un secret de session trop court', () => {
    expect(() => loadConfig({ ...valid, SESSION_SECRET: 'court' })).toThrow(/32 caractères/);
  });

  it('refuse une origine invalide', () => {
    expect(() => loadConfig({ ...valid, APP_ORIGIN: 'pas une url' })).toThrow(ConfigError);
  });
});

describe('loadConfig — TRUST_PROXY (FR-004)', () => {
  const trustProxy = (value?: string) => loadConfig(value === undefined ? valid : { ...valid, TRUST_PROXY: value }).trustProxy;

  it('vaut loopback par défaut', () => {
    expect(trustProxy()).toBe('loopback');
  });

  it('accepte true, false et un nombre de proxys', () => {
    expect(trustProxy('true')).toBe(true);
    expect(trustProxy('false')).toBe(false);
    expect(trustProxy('2')).toBe(2);
  });

  it.each([
    ['uniquelocal', 'uniquelocal'],
    ['loopback, 10.0.0.0/8', 'loopback,10.0.0.0/8'],
    ['::1', '::1'],
    [' linklocal ', 'linklocal'],
  ])('accepte la liste « %s »', (value, expected) => {
    expect(trustProxy(value)).toBe(expected);
  });

  it.each(["n'importe quoi", '-1', '10.0.0.0/99', 'loopback,'])('refuse « %s » au démarrage', (value) => {
    expect(() => trustProxy(value)).toThrow(ConfigError);
    expect(() => trustProxy(value)).toThrow(/^TRUST_PROXY invalide/);
  });
});
