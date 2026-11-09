import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import webpush from 'web-push';
import { loadConfig } from '../../src/config/config';
import { APP_CONFIG } from '../../src/config/config.module';
import { PUSH_SCHEDULER, PushDispatcher, type PushScheduler } from '../../src/push/push-dispatcher.service';
import { PUSH_SENDER, type PushSendResult } from '../../src/push/web-push.sender';
import { loginAs, SEED_PASSWORD, seedDemo, userId } from '../utils/auth-helpers';
import { clearCoverages, minutesFrom } from '../utils/coverage-fixtures';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * 014, T060 (US5, D8, FR-019, FR-020, SC-003, NC-8, contracts/http-api.md) : retrait d'un appareil,
 * suppressions liées à la déconnexion, au changement et à la réinitialisation du mot de passe, à la
 * désactivation ; une tentative déjà programmée ne contourne ni la déconnexion ni le transfert d'appareil.
 */

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
let counter = 0;
function browserSubscription() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/cycle-${++counter}`,
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
  };
}

describe('Cycle de vie des abonnements (US5)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let dispatcher: PushDispatcher;
  const id: Record<string, string> = {};
  // Une session par compte, ouverte une fois : le limiteur refuse plus de 5 connexions par minute et par compte.
  const cookie: Record<string, string> = {};
  const vapid = webpush.generateVAPIDKeys();

  const responses: PushSendResult[] = [];
  const sender = { send: jest.fn(async (): Promise<PushSendResult> => responses.shift() ?? { statusCode: 201 }) };
  const waits: Array<{ ms: number; release: () => void }> = [];
  const scheduler: PushScheduler = { wait: (ms) => new Promise<void>((release) => waits.push({ ms, release })) };

  const api = () => request(app.getHttpServer());
  const withOrigin = (req: request.Test, cookie: string) => req.set('Cookie', cookie).set('Origin', TEST_ORIGIN);
  const subscribe = async (cookie: string) => {
    const res = await withOrigin(api().put('/api/push/subscriptions'), cookie).set('User-Agent', ANDROID).send(browserSubscription());
    if (res.status !== 201) throw new Error(`Abonnement : ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id as string;
  };
  const exists = async (subscriptionId: string) => (await prisma.pushSubscription.findUnique({ where: { id: subscriptionId } })) !== null;

  async function until(condition: () => boolean): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error('Condition non atteinte en 5 s');
      await new Promise((resolve) => setTimeout(resolve, 10));
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
        { provide: PUSH_SENDER, useValue: sender },
        { provide: PUSH_SCHEDULER, useValue: scheduler },
      ],
    );
    dispatcher = app.get(PushDispatcher);
    for (const who of ['superadmin', 'admin', 'surveillant', 'surveillant2', 'remplacant', 'reprographie', 'enseignante']) {
      id[who] = await userId(prisma, who);
    }
    for (const who of ['superadmin', 'admin', 'surveillant', 'enseignante']) cookie[who] = await loginAs(app, who);
    // Plage d'envoi ouverte en permanence (US4) : ces tests ne dépendent pas de l'heure.
    await withOrigin(api().put('/api/admin/settings'), cookie.superadmin)
      .send({ pushWindowDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], pushWindowStart: '00:00', pushWindowEnd: '23:59' })
      .expect(200);
  });

  beforeEach(async () => {
    await dispatcher.settled();
    await clearCoverages(prisma);
    await prisma.pushSubscription.deleteMany();
    responses.length = 0;
    waits.length = 0;
    sender.send.mockClear();
  });

  afterAll(async () => {
    for (const w of waits.splice(0)) w.release();
    await dispatcher.settled();
    await app.close();
    await prisma.$disconnect();
  });

  describe('DELETE /api/push/subscriptions/:id', () => {
    it('retire son propre appareil (204)', async () => {
      const device = await subscribe(cookie.surveillant);
      expect((await withOrigin(api().delete(`/api/push/subscriptions/${device}`), cookie.surveillant)).status).toBe(204);
      expect(await exists(device)).toBe(false);
    });

    it('appareil d’un autre : 404 et refus journalisé, sans adresse d’envoi ; l’appareil reste', async () => {
      const device = await subscribe(cookie.enseignante);
      const row = await prisma.pushSubscription.findUniqueOrThrow({ where: { id: device } });
      const before = await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } });

      const res = await withOrigin(api().delete(`/api/push/subscriptions/${device}`), cookie.surveillant);
      expect(res.status).toBe(404);
      expect(await exists(device)).toBe(true);
      expect(await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } })).toBe(before + 1);
      const denial = await prisma.auditLog.findFirstOrThrow({ where: { action: 'ACCESS_DENIED' }, orderBy: { createdAt: 'desc' } });
      expect(denial.actorId).toBe(id.surveillant);
      expect(JSON.stringify(denial)).not.toContain(row.endpoint);
    });

    it('identifiant inconnu : 404 ; identifiant mal formé : 400', async () => {
      expect((await withOrigin(api().delete(`/api/push/subscriptions/${randomUUID()}`), cookie.surveillant)).status).toBe(404);
      expect((await withOrigin(api().delete('/api/push/subscriptions/pas-un-identifiant'), cookie.surveillant)).status).toBe(400);
    });
  });

  it('déconnexion : retire les appareils de la session fermée seulement (SC-003)', async () => {
    const phone = await loginAs(app, 'surveillant');
    const computer = cookie.surveillant;
    const phoneDevice = await subscribe(phone);
    const computerDevice = await subscribe(computer);

    expect((await withOrigin(api().post('/api/auth/logout'), phone)).status).toBe(204);
    expect(await exists(phoneDevice)).toBe(false);
    expect(await exists(computerDevice)).toBe(true);
  });

  it('changement de son mot de passe : retire les autres appareils, garde celui de la session courante (NC-8b)', async () => {
    const current = await loginAs(app, 'surveillant2');
    const other = await loginAs(app, 'surveillant2');
    const kept = await subscribe(current);
    const removed = await subscribe(other);
    const orphan = await prisma.pushSubscription.create({
      data: { userId: id.surveillant2, sessionId: null, endpoint: 'https://web.push.apple.com/sans-session', p256dh: 'BKey', auth: 'auth', deviceLabel: 'iPhone · Safari' },
    });

    const res = await withOrigin(api().post('/api/auth/password'), current).send({
      currentPassword: SEED_PASSWORD,
      newPassword: 'Nouveau-Mot-De-Passe-2026!',
    });
    expect(res.status).toBe(204);
    expect(await exists(kept)).toBe(true);
    expect(await exists(removed)).toBe(false);
    expect(await exists(orphan.id)).toBe(false);
  });

  it('réinitialisation du mot de passe par l’administration : plus aucun appareil ni session', async () => {
    const remplacant = await loginAs(app, 'remplacant');
    await subscribe(remplacant);
    await subscribe(await loginAs(app, 'remplacant'));

    expect((await withOrigin(api().post(`/api/admin/users/${id.remplacant}/reset-password`), cookie.superadmin)).status).toBe(200);
    expect(await prisma.pushSubscription.count({ where: { userId: id.remplacant } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: id.remplacant } })).toBe(0);
  });

  it('désactivation du compte : plus aucun appareil ni session', async () => {
    await subscribe(await loginAs(app, 'reprographie'));
    const res = await withOrigin(api().patch(`/api/admin/users/${id.reprographie}`), cookie.superadmin).send({ active: false });
    expect(res.status).toBe(200);
    expect(await prisma.pushSubscription.count({ where: { userId: id.reprographie } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: id.reprographie } })).toBe(0);
    await prisma.user.update({ where: { id: id.reprographie }, data: { active: true } });
  });

  describe('tentative en attente (FR-020, SC-003, NC-8a)', () => {
    /** `fresh` : nouvelle session, pour un test qui la ferme. */
    async function assignmentWithFailedFirstAttempt(fresh = false): Promise<string> {
      const surveillant = fresh ? await loginAs(app, 'surveillant') : cookie.surveillant;
      await subscribe(surveillant);
      responses.push({ statusCode: 500 });
      const violet = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '1ère année Violet' } })).id;
      const res = await withOrigin(api().post('/api/coverage'), cookie.admin).send({
        clientId: randomUUID(),
        classId: violet,
        type: 'ABSENCE',
        assigneeId: id.surveillant,
        startAt: minutesFrom(new Date(), 10).toISOString(),
        endAt: minutesFrom(new Date(), 70).toISOString(),
      });
      expect(res.status).toBe(201);
      await until(() => waits.length === 1);
      expect(sender.send).toHaveBeenCalledTimes(1);
      return surveillant;
    }

    const releaseAndSettle = async () => {
      for (const w of waits.splice(0)) w.release();
      await dispatcher.settled();
    };

    it('déconnexion avant la 2e tentative : aucune 2e tentative', async () => {
      const surveillant = await assignmentWithFailedFirstAttempt(true);
      expect((await withOrigin(api().post('/api/auth/logout'), surveillant)).status).toBe(204);
      await releaseAndSettle();
      expect(sender.send).toHaveBeenCalledTimes(1);
    });

    it('même navigateur repris par un collègue avant la 2e tentative : rien n’est envoyé à son nom', async () => {
      await assignmentWithFailedFirstAttempt();
      const device = await prisma.pushSubscription.findFirstOrThrow({ where: { userId: id.surveillant } });
      const transfer = await withOrigin(api().put('/api/push/subscriptions'), cookie.enseignante).send({
        endpoint: device.endpoint,
        keys: { p256dh: device.p256dh, auth: device.auth },
      });
      expect(transfer.status).toBe(200);
      await releaseAndSettle();
      expect(sender.send).toHaveBeenCalledTimes(1);
    });
  });
});
