import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import webpush from 'web-push';
import { loadConfig, type AppConfig } from '../../src/config/config';
import { APP_CONFIG } from '../../src/config/config.module';
import { PUSH_SENDER, type PushSender } from '../../src/push/web-push.sender';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { minutesFrom } from '../utils/coverage-fixtures';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * 014, T067 (US6, FR-005, NFR-004, SC-005) : le push est un canal en plus, jamais une condition. Avec un
 * service de push en panne (exception) ou muet (promesse jamais résolue), les actions réussissent et créent
 * exactement les mêmes notifications que lorsque le push est désactivé.
 */

const vapid = webpush.generateVAPIDKeys();
const PUSH: AppConfig['push'] = { publicKey: vapid.publicKey, privateKey: vapid.privateKey, subject: 'mailto:test@ecole.example' };

const failing: PushSender = { send: async () => Promise.reject(new Error('service de push en panne')) };
const silent: PushSender = { send: () => new Promise(() => undefined) };

/** Scénario métier complet ; renvoie les notifications créées (destinataire, type), triées. */
async function scenario(app: INestApplication, prisma: PrismaClient): Promise<string[]> {
  const api = () => request(app.getHttpServer());
  const cookie: Record<string, string> = {};
  for (const who of ['enseignante', 'reprographie', 'admin', 'superadmin']) cookie[who] = await loginAs(app, who);
  const post = (who: string, path: string, body: Record<string, unknown>) =>
    api().post(path).set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).send(body);
  const names = new Map((await prisma.user.findMany({ select: { id: true, username: true } })).map((u) => [u.id, u.username]));

  // Plage d'envoi ouverte et appareils abonnés : le push est tenté pour chaque notification autorisée.
  await api()
    .put('/api/admin/settings')
    .set('Cookie', cookie.superadmin)
    .set('Origin', TEST_ORIGIN)
    .send({ pushWindowDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], pushWindowStart: '00:00', pushWindowEnd: '23:59' })
    .expect(200);
  for (const who of ['enseignante', 'reprographie', 'surveillant', 'superadmin']) {
    await prisma.pushSubscription.create({
      data: { userId: await userId(prisma, who), endpoint: `https://fcm.googleapis.com/fcm/send/${who}`, p256dh: 'BKey', auth: 'auth', deviceLabel: 'Android · Chrome' },
    });
  }

  const started = Date.now();
  const created = await post('enseignante', '/api/requests', {
    clientId: randomUUID(),
    title: 'Photocopies du contrôle',
    description: 'Trente exemplaires.',
    categoryId: await categoryId(prisma, CATEGORIES.photocopies),
    recipientId: await userId(prisma, 'reprographie'),
    priority: 'URGENT',
  });
  expect(created.status).toBe(201);
  const accepted = await post('reprographie', `/api/requests/${created.body.id}/actions`, { action: 'ACCEPT', version: created.body.version });
  expect(accepted.status).toBe(200);
  const message = await post('enseignante', `/api/requests/${created.body.id}/messages`, { clientId: randomUUID(), text: 'Merci !' });
  expect(message.status).toBe(201);
  const violet = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '1ère année Violet' } })).id;
  const coverage = await post('admin', '/api/coverage', {
    clientId: randomUUID(),
    classId: violet,
    type: 'ABSENCE',
    assigneeId: await userId(prisma, 'surveillant'),
    startAt: minutesFrom(new Date(), 10).toISOString(),
    endAt: minutesFrom(new Date(), 70).toISOString(),
  });
  expect(coverage.status).toBe(201);
  // Les réponses ne dépendent pas du service de push (non attendu) : bien moins que les 10 s d'un envoi bloqué.
  expect(Date.now() - started).toBeLessThan(10_000);

  const notifications = await prisma.notification.findMany({ select: { userId: true, type: true } });
  return notifications.map((n) => `${names.get(n.userId)}:${n.type}`).sort();
}

async function run(push: AppConfig['push'], sender?: PushSender): Promise<string[]> {
  const prisma = new PrismaClient();
  await resetDatabase(prisma);
  await seedDemo(prisma);
  const app = await createTestApp(
    [],
    [{ provide: APP_CONFIG, useValue: { ...loadConfig(), push } }, ...(sender ? [{ provide: PUSH_SENDER, useValue: sender }] : [])],
  );
  try {
    return await scenario(app, prisma);
  } finally {
    // Laisse les envois en échec se terminer avant de fermer (aucune exception ne doit remonter).
    await new Promise((resolve) => setTimeout(resolve, 100));
    await app.close();
    await prisma.$disconnect();
  }
}

describe('Sans push, l’application fonctionne comme aujourd’hui (US6)', () => {
  let reference: string[];
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);

  beforeAll(async () => {
    process.on('unhandledRejection', onUnhandled);
    reference = await run(null);
  });

  afterAll(() => {
    process.off('unhandledRejection', onUnhandled);
  });

  it('le scénario crée des notifications (référence, push désactivé)', () => {
    expect(reference).toEqual(expect.arrayContaining(['reprographie:URGENT', 'surveillant:ASSIGNED']));
    expect(reference.some((n) => n.endsWith(':MESSAGE_NEW'))).toBe(true);
  });

  it('service de push en panne : mêmes notifications, aucune exception non traitée', async () => {
    expect(await run(PUSH, failing)).toEqual(reference);
    expect(unhandled).toEqual([]);
  });

  it('service de push muet (jamais de réponse) : les actions ne l’attendent pas, mêmes notifications', async () => {
    expect(await run(PUSH, silent)).toEqual(reference);
  });
});
