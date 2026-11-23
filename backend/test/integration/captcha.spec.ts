import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
import request from 'supertest';
import { CAPTCHA_FAILURES_PER_IP, LOGIN_FAILURES_PER_USERNAME } from '../../src/auth/login-attempt-limiter';
import { loadConfig, type TurnstileConfig } from '../../src/config/config';
import { APP_CONFIG } from '../../src/config/config.module';
import { createTestApp, sessionCookie, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * CAPTCHA Cloudflare Turnstile sur la connexion, seul point d'entrée public de l'application. Siteverify est simulé
 * (jamais de réseau ni de clé de production dans les tests automatisés) ; les clés sont fictives ou celles de test.
 */
describe('CAPTCHA de la connexion (Cloudflare Turnstile)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const PASSWORD = 'Mot-de-passe-solide-2026';
  const KEYS: TurnstileConfig = { siteKey: '0x4AAAAAAAsite-fictive', secretKey: '0x4AAAAAAAsecret-fictif', testKeys: false };
  const HOSTNAME = new URL(TEST_ORIGIN).hostname;

  const siteverify = jest.fn<Promise<Response>, [string, RequestInit]>();
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const accepted = () => reply({ success: true, 'error-codes': [], hostname: HOSTNAME, action: 'login' });
  const refused = (code: string, status = 200) => reply({ success: false, 'error-codes': [code] }, status);

  let tokens = 0;
  const freshToken = () => `jeton-fictif-${(tokens += 1)}`;
  let ips = 0;
  const freshIp = () => `10.1.${Math.floor((ips += 1) / 250)}.${(ips % 250) + 1}`;

  async function start(turnstile: TurnstileConfig | null): Promise<void> {
    app = await createTestApp([], [{ provide: APP_CONFIG, useValue: { ...loadConfig(), turnstile } }]);
  }
  function login(body: Record<string, unknown>, ip = freshIp()) {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', ip)
      .send({ username: 'enseignante', password: PASSWORD, ...body });
  }
  const denials = (reason: string) => prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', details: { path: ['reason'], equals: reason } } });
  const sessions = () => prisma.session.count();

  beforeEach(async () => {
    await resetDatabase(prisma);
    await prisma.user.create({ data: { username: 'enseignante', displayName: 'Enseignante', role: 'EMPLOYEE', passwordHash: await hash(PASSWORD), mustChangePassword: false } });
    siteverify.mockReset();
    jest.spyOn(globalThis, 'fetch').mockImplementation(siteverify as unknown as typeof fetch);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });
  afterAll(() => prisma.$disconnect());

  describe('activé', () => {
    beforeEach(() => start(KEYS));

    it('jeton valide : la connexion aboutit, comme sans CAPTCHA', async () => {
      siteverify.mockResolvedValueOnce(accepted());
      const token = freshToken();
      const res = await login({ captchaToken: token });
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ displayName: 'Enseignante' });
      const cookie = sessionCookie(res.headers['set-cookie']);
      expect(JSON.parse(String(siteverify.mock.calls[0]![1].body))).toEqual({ secret: KEYS.secretKey, response: token });

      // Après connexion : aucune autre vérification n'est demandée, la session suffit.
      const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie);
      expect(me.status).toBe(200);
      const out = await request(app.getHttpServer()).post('/api/auth/logout').set('Origin', TEST_ORIGIN).set('Cookie', cookie);
      expect(out.status).toBe(204);
      expect(siteverify).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['absent', undefined],
      ['vide', ''],
      ['null', null],
      ['qui n’est pas du texte', { jeton: 'x' }],
      ['trop long (plus de 2 048 caractères)', 'x'.repeat(2_049)],
    ])('appel direct de l’API, jeton %s : refusé sans appeler Cloudflare ni vérifier le mot de passe', async (_label, captchaToken) => {
      const res = await login(captchaToken === undefined ? {} : { captchaToken });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CAPTCHA_REQUIRED');
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(siteverify).not.toHaveBeenCalled();
      expect(await sessions()).toBe(0);
      expect(await prisma.auditLog.count({ where: { action: 'LOGIN_FAILURE' } })).toBe(0);
      expect(await denials('CAPTCHA_REQUIRED')).toBe(1);
    });

    it.each([
      ['invalide', 'invalid-input-response', 'CAPTCHA_INVALID'],
      ['expiré', 'timeout-or-duplicate', 'CAPTCHA_EXPIRED'],
    ])('jeton %s : refusé, même avec le bon mot de passe', async (_label, code, expected) => {
      siteverify.mockResolvedValueOnce(refused(code));
      const res = await login({ captchaToken: freshToken() });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(expected);
      expect(await sessions()).toBe(0);
      expect(await denials(expected)).toBe(1);
    });

    it('jeton réutilisé : refusé, même si Cloudflare l’accepterait encore', async () => {
      siteverify.mockImplementation(async () => accepted());
      const captchaToken = freshToken();
      expect((await login({ captchaToken })).status).toBe(200);
      const again = await login({ captchaToken });
      expect(again.status).toBe(403);
      expect(again.body.error.code).toBe('CAPTCHA_EXPIRED');
      expect(await sessions()).toBe(1);
    });

    it('jeton émis pour un autre site ou une autre action : refusé', async () => {
      siteverify.mockResolvedValueOnce(reply({ success: true, hostname: 'site-pirate.example', action: 'login' }));
      expect((await login({ captchaToken: freshToken() })).body.error.code).toBe('CAPTCHA_INVALID');
      siteverify.mockResolvedValueOnce(reply({ success: true, hostname: HOSTNAME, action: 'autre' }));
      expect((await login({ captchaToken: freshToken() })).body.error.code).toBe('CAPTCHA_INVALID');
      expect(await sessions()).toBe(0);
    });

    it.each([
      ['réseau coupé', () => Promise.reject(new TypeError('fetch failed'))],
      ['délai dépassé', () => Promise.reject(new DOMException('timeout', 'TimeoutError'))],
      ['erreur 500', () => Promise.resolve(reply({}, 500))],
      ['clé secrète refusée', () => Promise.resolve(refused('invalid-input-secret', 400))],
    ])('Cloudflare indisponible (%s) : refus sûr (503), aucune session', async (_label, answer) => {
      siteverify.mockImplementationOnce(answer);
      const res = await login({ captchaToken: freshToken() });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('CAPTCHA_UNAVAILABLE');
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(await sessions()).toBe(0);
    });

    it('une panne de Cloudflare ne bloque pas l’école ensuite, et n’est journalisée qu’une fois par adresse', async () => {
      const ip = freshIp();
      siteverify.mockImplementation(() => Promise.reject(new TypeError('fetch failed')));
      for (let i = 0; i < CAPTCHA_FAILURES_PER_IP + 5; i += 1) {
        const res = await login({ username: `compte-${i}`, captchaToken: freshToken() }, ip);
        expect(res.body.error.code).toBe('CAPTCHA_UNAVAILABLE');
      }
      expect(await denials('CAPTCHA_UNAVAILABLE')).toBe(1);
      siteverify.mockImplementation(async () => accepted());
      expect((await login({ captchaToken: freshToken() }, ip)).status).toBe(200);
    }, 60_000);

    it('limite par adresse IP : une rafale de jetons invalides est coupée avant d’appeler Cloudflare, et journalisée une fois', async () => {
      const ip = freshIp();
      siteverify.mockImplementation(async () => refused('invalid-input-response'));
      for (let i = 0; i < CAPTCHA_FAILURES_PER_IP; i += 1) await login({ username: `compte-${i}`, captchaToken: freshToken() }, ip);
      expect(siteverify).toHaveBeenCalledTimes(CAPTCHA_FAILURES_PER_IP);
      for (let i = 0; i < 3; i += 1) {
        const res = await login({ username: `autre-${i}`, captchaToken: freshToken() }, ip);
        expect(res.status).toBe(429);
        expect(res.body.error.code).toBe('RATE_LIMITED');
      }
      expect(siteverify).toHaveBeenCalledTimes(CAPTCHA_FAILURES_PER_IP);
      expect(await denials('RATE_LIMITED')).toBe(1);
      // Une autre adresse n'est pas touchée.
      siteverify.mockImplementation(async () => accepted());
      expect((await login({ captchaToken: freshToken() })).status).toBe(200);
    }, 60_000);

    it('sans CAPTCHA valide, un robot ne peut plus verrouiller le compte d’une personne', async () => {
      siteverify.mockImplementation(async () => refused('invalid-input-response'));
      for (let i = 0; i < LOGIN_FAILURES_PER_USERNAME + 2; i += 1) await login({ password: 'faux', captchaToken: freshToken() });
      siteverify.mockImplementation(async () => accepted());
      expect((await login({ captchaToken: freshToken() })).status).toBe(200);
    });

    it('le CAPTCHA ne remplace pas l’authentification ni la limite par compte', async () => {
      siteverify.mockImplementation(async () => accepted());
      const ip = freshIp();
      for (let i = 0; i < 5; i += 1) {
        const res = await login({ password: 'faux', captchaToken: freshToken() }, ip);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      }
      const calls = siteverify.mock.calls.length;
      const blocked = await login({ captchaToken: freshToken() }, ip);
      expect(blocked.status).toBe(429);
      // Le limiteur existant répond avant tout appel à Cloudflare.
      expect(siteverify).toHaveBeenCalledTimes(calls);
    });

    it('la protection CSRF passe toujours avant : une autre origine est refusée sans appeler Cloudflare', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Origin', 'https://site-pirate.example')
        .send({ username: 'enseignante', password: PASSWORD, captchaToken: freshToken() });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(siteverify).not.toHaveBeenCalled();
    });

    it('ni le jeton ni la clé secrète n’apparaissent dans les réponses ou le journal d’audit', async () => {
      siteverify.mockResolvedValueOnce(refused('invalid-input-response'));
      const captchaToken = freshToken();
      const res = await login({ captchaToken });
      const audit = JSON.stringify(await prisma.auditLog.findMany());
      for (const secret of [captchaToken, KEYS.secretKey]) {
        expect(res.text).not.toContain(secret);
        expect(audit).not.toContain(secret);
      }
    });

    it('GET /api/auth/captcha, sans session : la clé publique, et rien d’autre', async () => {
      const res = await request(app.getHttpServer()).get('/api/auth/captcha');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ siteKey: KEYS.siteKey });
      expect(res.text).not.toContain(KEYS.secretKey);
    });
  });

  describe('désactivé (aucune clé)', () => {
    beforeEach(() => start(null));

    it('la connexion fonctionne comme avant, avec ou sans jeton, sans appeler Cloudflare', async () => {
      expect((await login({})).status).toBe(200);
      expect((await login({ captchaToken: freshToken() })).status).toBe(200);
      expect(siteverify).not.toHaveBeenCalled();
    });

    it('GET /api/auth/captcha : aucune clé', async () => {
      const res = await request(app.getHttpServer()).get('/api/auth/captcha');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ siteKey: null });
    });
  });
});
