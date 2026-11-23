import { Logger } from '@nestjs/common';
import type { AppConfig, TurnstileConfig } from '../../src/config/config';
import { SITEVERIFY_URL, TurnstileService, USED_TOKEN_TTL_MS } from '../../src/auth/turnstile.service';

/**
 * Cloudflare Turnstile : vérification d'un jeton par Siteverify. Le réseau est simulé ; les réponses reprennent celles
 * observées sur l'API réelle avec les clés de test officielles. Règle centrale : tout ce qui n'est pas une validation
 * explicite et conforme est un refus.
 */

const REAL: TurnstileConfig = { siteKey: '0x4AAAAAAAsite-fictive', secretKey: '0x4AAAAAAAsecret-fictif', testKeys: false };
const TEST: TurnstileConfig = { siteKey: '1x00000000000000000000AA', secretKey: '1x0000000000000000000000000000000AA', testKeys: true };
const TOKEN = 'jeton-de-test-abcdef';

const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();
let nowMs = 1_000_000;

function service(turnstile: TurnstileConfig | null = REAL): TurnstileService {
  const config = { turnstile, allowedOrigins: ['https://demandes.ecole.fr'] } as unknown as AppConfig;
  return new TurnstileService(config, () => nowMs);
}
const answer = (body: unknown, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const success = (over: Record<string, unknown> = {}) => answer({ success: true, 'error-codes': [], hostname: 'demandes.ecole.fr', action: 'login', ...over });
const failure = (code: string, status = 200) => answer({ success: false, 'error-codes': [code] }, status);

beforeEach(() => {
  nowMs = 1_000_000;
  fetchMock.mockReset();
  jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);
});
afterEach(() => jest.restoreAllMocks());

describe('TurnstileService.verify', () => {
  it('jeton valide : accepté, après un seul appel à l’API officielle, avec la clé secrète dans le corps', async () => {
    fetchMock.mockResolvedValueOnce(success());
    await expect(service().verify(TOKEN, 'login')).resolves.toBe('VALID');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(url).toBe(SITEVERIFY_URL);
    expect(init.method).toBe('POST');
    // La clé secrète ne suit jamais une redirection, et l'appel est borné dans le temps.
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    // Minimisation : ni identifiant ni adresse IP ne partent chez Cloudflare.
    expect(JSON.parse(String(init.body))).toEqual({ secret: REAL.secretKey, response: TOKEN });
  });

  it.each([
    ['jeton invalide', 'invalid-input-response', 'INVALID'],
    ['jeton mal formé', 'bad-request', 'INVALID'],
    ['jeton absent', 'missing-input-response', 'INVALID'],
    ['jeton expiré ou déjà utilisé', 'timeout-or-duplicate', 'EXPIRED'],
    ['code inconnu', 'code-jamais-vu', 'INVALID'],
  ])('%s (%s) → %s', async (_label, code, expected) => {
    fetchMock.mockResolvedValueOnce(failure(code));
    await expect(service().verify(TOKEN, 'login')).resolves.toBe(expected);
  });

  it.each([
    ['autre site', { hostname: 'site-pirate.example' }],
    ['site absent', { hostname: undefined }],
    ['autre action', { action: 'inscription' }],
    ['action absente', { action: undefined }],
  ])('succès annoncé mais jeton émis pour un contexte différent (%s) : refusé', async (_label, over) => {
    fetchMock.mockResolvedValueOnce(success(over));
    await expect(service().verify(TOKEN, 'login')).resolves.toBe('INVALID');
  });

  it('clés de test (hors production) : Cloudflare répond « example.com » sans action, accepté', async () => {
    fetchMock.mockResolvedValueOnce(answer({ success: true, 'error-codes': [], hostname: 'example.com', metadata: { result_with_testing_key: true } }));
    await expect(service(TEST).verify('XXXX.DUMMY.TOKEN.XXXX', 'login')).resolves.toBe('VALID');
  });

  it('clés de test : le jeton factice, toujours identique, ne compte pas comme réutilisé', async () => {
    fetchMock.mockImplementation(async () => answer({ success: true, 'error-codes': [], hostname: 'example.com' }));
    const turnstile = service(TEST);
    await expect(turnstile.verify('XXXX.DUMMY.TOKEN.XXXX', 'login')).resolves.toBe('VALID');
    await expect(turnstile.verify('XXXX.DUMMY.TOKEN.XXXX', 'login')).resolves.toBe('VALID');
  });

  describe('jeton réutilisé (le rejet de Cloudflare n’est pas immédiat)', () => {
    it('une seconde présentation est refusée sans rappeler Cloudflare', async () => {
      fetchMock.mockImplementation(async () => success());
      const turnstile = service();
      await expect(turnstile.verify(TOKEN, 'login')).resolves.toBe('VALID');
      await expect(turnstile.verify(TOKEN, 'login')).resolves.toBe('EXPIRED');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('présentations simultanées : une seule passe', async () => {
      fetchMock.mockImplementation(async () => success());
      const turnstile = service();
      const results = await Promise.all(Array.from({ length: 5 }, () => turnstile.verify(TOKEN, 'login')));
      expect(results.filter((r) => r === 'VALID')).toHaveLength(1);
      expect(results.filter((r) => r === 'EXPIRED')).toHaveLength(4);
    });

    it('la mémoire est bornée dans le temps : au-delà de la validité d’un jeton, Cloudflare décide', async () => {
      fetchMock.mockImplementation(async () => success());
      const turnstile = service();
      await turnstile.verify(TOKEN, 'login');
      nowMs += USED_TOKEN_TTL_MS + 1;
      fetchMock.mockResolvedValueOnce(failure('timeout-or-duplicate'));
      await expect(turnstile.verify(TOKEN, 'login')).resolves.toBe('EXPIRED');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cloudflare indisponible ou mal configuré : jamais une validation', () => {
    it.each([
      ['réseau coupé', () => Promise.reject(new TypeError('fetch failed'))],
      ['délai dépassé', () => Promise.reject(new DOMException('timeout', 'TimeoutError'))],
      ['erreur 500', () => Promise.resolve(answer('oups', 500))],
      ['erreur 503 qui annonce pourtant un succès', () => Promise.resolve(answer({ success: true, hostname: 'demandes.ecole.fr', action: 'login' }, 503))],
      ['réponse qui n’est pas du JSON', () => Promise.resolve(answer('<html>portail captif</html>'))],
      ['réponse JSON inattendue', () => Promise.resolve(answer('null'))],
      ['« success » qui n’est pas un booléen', () => Promise.resolve(answer({ success: 'true', hostname: 'demandes.ecole.fr', action: 'login' }))],
      ['erreur interne de Cloudflare', () => Promise.resolve(failure('internal-error'))],
      ['clé secrète refusée', () => Promise.resolve(failure('invalid-input-secret', 400))],
      ['clé secrète absente', () => Promise.resolve(failure('missing-input-secret', 400))],
    ])('%s → UNAVAILABLE', async (_label, reply) => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      fetchMock.mockImplementationOnce(reply);
      await expect(service().verify(TOKEN, 'login')).resolves.toBe('UNAVAILABLE');
    });

    it('ni le jeton ni la clé secrète ne sont journalisés', async () => {
      const lines: unknown[] = [];
      for (const level of ['error', 'warn', 'log'] as const) jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => void lines.push(args));
      fetchMock.mockRejectedValueOnce(new Error(`échec avec ${TOKEN} et ${REAL.secretKey}`));
      await service().verify(TOKEN, 'login');
      fetchMock.mockResolvedValueOnce(failure('invalid-input-secret', 400));
      await service().verify(TOKEN, 'login');
      expect(lines.length).toBeGreaterThan(0);
      expect(JSON.stringify(lines)).not.toContain(TOKEN);
      expect(JSON.stringify(lines)).not.toContain(REAL.secretKey);
    });
  });

  it('non configuré : appeler la vérification est une erreur, jamais une validation', async () => {
    await expect(service(null).verify(TOKEN, 'login')).resolves.toBe('UNAVAILABLE');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
