import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createECDH, randomBytes } from 'node:crypto';
import request from 'supertest';
import webpush from 'web-push';
import { loadConfig } from '../../src/config/config';
import { APP_CONFIG } from '../../src/config/config.module';
import { PUSH_SENDER } from '../../src/push/web-push.sender';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * 014, T028 (US2, FR-001, FR-003, FR-011, FR-013, FR-016, FR-019, NFR-001, NC-3, NC-8a,
 * contracts/http-api.md) : configuration publique, enregistrement d'un appareil (création, mise à jour,
 * transfert), validation et limites. Aucune réponse ne contient l'adresse d'envoi ni les clés.
 */

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const HOUR_MS = 3_600_000;

let counter = 0;
function browserSubscription(endpoint = `https://fcm.googleapis.com/fcm/send/dev-${++counter}`) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { endpoint, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
}

describe('Abonnement des appareils (US2)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookie: Record<string, string> = {};
  const id: Record<string, string> = {};
  const vapid = webpush.generateVAPIDKeys();

  const api = () => request(app.getHttpServer());
  const put = (who: string, body: unknown, userAgent = ANDROID) =>
    api().put('/api/push/subscriptions').set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).set('User-Agent', userAgent).send(body as object);
  const list = (who: string) => api().get('/api/push/subscriptions').set('Cookie', cookie[who]);

  /** Aucune réponse ne doit laisser sortir l'adresse d'envoi ou les clés. */
  function expectNoSecrets(body: unknown, subscription: ReturnType<typeof browserSubscription>) {
    const text = JSON.stringify(body);
    for (const secret of [subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, 'endpoint', 'p256dh']) {
      expect(text).not.toContain(secret);
    }
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp(
      [],
      [
        {
          provide: APP_CONFIG,
          useValue: { ...loadConfig(), push: { publicKey: vapid.publicKey, privateKey: vapid.privateKey, subject: 'mailto:test@ecole.example' } },
        },
        { provide: PUSH_SENDER, useValue: { send: jest.fn(async () => ({ statusCode: 201 })) } },
      ],
    );
    for (const who of ['surveillant', 'remplacant', 'enseignante']) {
      cookie[who] = await loginAs(app, who);
      id[who] = await userId(prisma, who);
    }
  });

  beforeEach(() => prisma.pushSubscription.deleteMany());

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('GET /api/push/config : activé, avec la seule clé publique', async () => {
    const res = await api().get('/api/push/config').set('Cookie', cookie.surveillant);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: true, publicKey: vapid.publicKey });
    expect(JSON.stringify(res.body)).not.toContain(vapid.privateKey);
  });

  it('PUT : crée l’abonnement de l’appareil (201), libellé calculé par le serveur', async () => {
    const sub = browserSubscription();
    const res = await put('surveillant', sub);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), deviceLabel: 'Android · Chrome', created: true });
    expectNoSecrets(res.body, sub);

    const row = await prisma.pushSubscription.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({ userId: id.surveillant, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth });
    const session = await prisma.session.findFirstOrThrow({ where: { userId: id.surveillant }, orderBy: { createdAt: 'desc' } });
    expect(row.sessionId).toBe(session.id);
  });

  it('PUT du même appareil : 200, un seul abonnement (FR-016), session mise à jour', async () => {
    const sub = browserSubscription();
    const first = await put('surveillant', sub);
    await prisma.pushSubscription.update({ where: { id: first.body.id }, data: { sessionId: 'ancienne-session' } });

    const again = await put('surveillant', sub);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ id: first.body.id, deviceLabel: 'Android · Chrome', created: false });
    expect(await prisma.pushSubscription.count({ where: { endpoint: sub.endpoint } })).toBe(1);
    expect((await prisma.pushSubscription.findUniqueOrThrow({ where: { id: first.body.id } })).sessionId).not.toBe('ancienne-session');
  });

  it('dernière utilisation : réécrite au plus une fois par 24 h (NC-3)', async () => {
    const sub = browserSubscription();
    const { body } = await put('surveillant', sub);
    const recent = new Date(Date.now() - 23 * HOUR_MS);
    await prisma.pushSubscription.update({ where: { id: body.id }, data: { lastUsedAt: recent } });
    await put('surveillant', sub);
    expect((await prisma.pushSubscription.findUniqueOrThrow({ where: { id: body.id } })).lastUsedAt.getTime()).toBe(recent.getTime());

    const old = new Date(Date.now() - 25 * HOUR_MS);
    await prisma.pushSubscription.update({ where: { id: body.id }, data: { lastUsedAt: old } });
    const before = Date.now();
    await put('surveillant', sub);
    expect((await prisma.pushSubscription.findUniqueOrThrow({ where: { id: body.id } })).lastUsedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('même navigateur, autre compte : l’abonnement lui est transféré (NC-8a)', async () => {
    const sub = browserSubscription();
    const first = await put('surveillant', sub);
    const transferred = await put('remplacant', sub, IPHONE);
    expect(transferred.status).toBe(200);
    expect(transferred.body).toEqual({ id: first.body.id, deviceLabel: 'iPhone · Safari', created: false });

    expect((await prisma.pushSubscription.findUniqueOrThrow({ where: { id: first.body.id } })).userId).toBe(id.remplacant);
    expect((await list('surveillant')).body).toEqual([]);
    expect((await list('remplacant')).body).toHaveLength(1);
  });

  it('GET /api/push/subscriptions : ses appareils seulement, l’appareil courant signalé', async () => {
    const mine = await put('surveillant', browserSubscription());
    await prisma.pushSubscription.create({
      data: { userId: id.surveillant, sessionId: 'autre-session', endpoint: 'https://web.push.apple.com/autre', p256dh: 'BKey', auth: 'auth', deviceLabel: 'iPhone · Safari' },
    });
    await put('enseignante', browserSubscription());

    const res = await list('surveillant');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body).toEqual(
      expect.arrayContaining([
        { id: mine.body.id, deviceLabel: 'Android · Chrome', createdAt: expect.any(String), lastUsedAt: expect.any(String), current: true },
        expect.objectContaining({ deviceLabel: 'iPhone · Safari', current: false }),
      ]),
    );
    expect(JSON.stringify(res.body)).not.toMatch(/endpoint|p256dh|auth"|https:/);
  });

  it.each([
    ['http', { endpoint: 'http://fcm.googleapis.com/fcm/send/x' }, 'endpoint'],
    ['hôte inconnu', { endpoint: 'https://evil.example/fcm/send/x' }, 'endpoint'],
    ['hôte ressemblant', { endpoint: 'https://fcm.googleapis.com.evil.example/x' }, 'endpoint'],
    ['port', { endpoint: 'https://fcm.googleapis.com:8443/fcm/send/x' }, 'endpoint'],
    ['clés invalides', { keys: { p256dh: 'abc', auth: 'abc' } }, 'keys'],
  ])('refuse un abonnement invalide (%s) : 400 sur le champ concerné', async (_label, change, field) => {
    const res = await put('surveillant', { ...browserSubscription(), ...change });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).toContain(field);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('refuse un champ inconnu (400)', async () => {
    const res = await put('surveillant', { ...browserSubscription(), userId: id.enseignante });
    expect(res.status).toBe(400);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('11e appareil : 409 PUSH_DEVICE_LIMIT ; l’appareil déjà connu reste accepté', async () => {
    const subs = Array.from({ length: 10 }, () => browserSubscription());
    for (const sub of subs) expect((await put('surveillant', sub)).status).toBe(201);
    const refused = await put('surveillant', browserSubscription());
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('PUSH_DEVICE_LIMIT');
    expect((await put('surveillant', subs[0])).status).toBe(200);
  });

  it('DELETE /api/push/subscriptions/current : retire l’abonnement de la session courante seulement (204)', async () => {
    const current = await put('surveillant', browserSubscription());
    await prisma.pushSubscription.create({
      data: { userId: id.surveillant, sessionId: 'autre-session', endpoint: 'https://web.push.apple.com/garde', p256dh: 'BKey', auth: 'auth', deviceLabel: 'iPhone · Safari' },
    });
    await put('enseignante', browserSubscription());

    const del = () => api().delete('/api/push/subscriptions/current').set('Cookie', cookie.surveillant).set('Origin', TEST_ORIGIN);
    expect((await del()).status).toBe(204);
    expect(await prisma.pushSubscription.findUnique({ where: { id: current.body.id } })).toBeNull();
    expect(await prisma.pushSubscription.count({ where: { userId: id.surveillant } })).toBe(1);
    expect(await prisma.pushSubscription.count({ where: { userId: id.enseignante } })).toBe(1);
    // Sans abonnement pour cette session : 204 quand même.
    expect((await del()).status).toBe(204);
  });

  it('sans session : 401', async () => {
    const res = await api().put('/api/push/subscriptions').set('Origin', TEST_ORIGIN).send(browserSubscription());
    expect(res.status).toBe(401);
    expect((await api().get('/api/push/config')).status).toBe(401);
  });
});

describe('Push désactivé par l’établissement (FR-013)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let cookie: string;

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp([], [{ provide: APP_CONFIG, useValue: { ...loadConfig(), push: null } }]);
    cookie = await loginAs(app, 'surveillant');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('configuration : désactivé, sans clé', async () => {
    const res = await request(app.getHttpServer()).get('/api/push/config').set('Cookie', cookie);
    expect(res.body).toEqual({ enabled: false, publicKey: null });
  });

  it('PUT : 409 PUSH_DISABLED, rien n’est enregistré', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/push/subscriptions')
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .send(browserSubscription());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PUSH_DISABLED');
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('GET /api/push/subscriptions fonctionne quand même (retrait des anciens appareils)', async () => {
    const res = await request(app.getHttpServer()).get('/api/push/subscriptions').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
