import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import request from 'supertest';
import { AuthService } from '../../src/auth/auth.service';
import { loadConfig, type AppConfig } from '../../src/config/config';
import { APP_CONFIG } from '../../src/config/config.module';
import { signBody } from '../../src/integrations/domain/n8n-protocol';
import { OutboxDispatcher } from '../../src/integrations/outbox-dispatcher.service';
import { loginAs, SEED_PASSWORD, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * 015 — n8n : événement outbox écrit à l'approbation, envoi signé et fiable (panne, reprise, tentatives
 * limitées, doublons), données minimales pour n8n, comptes rendus de livraison idempotents. Une panne
 * de n8n ou d'un canal externe ne retire jamais l'accès du parent.
 */
const audio = join(__dirname, '..', 'fixtures', 'audio', 'sample.webm');
const SECRET = 'n'.repeat(40);

interface Received {
  headers: IncomingHttpHeaders;
  body: string;
}

describe('Communication aux parents : intégration n8n (015)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let config: AppConfig;
  let fakeN8n: Server;
  let fakeUrl: string;
  let fakeStatus = 200;
  const received: Received[] = [];
  let superadmin: string;
  let enseignante: string;
  let parent: string;
  let studentId: string;
  let guardianId: string;

  const api = () => request(app.getHttpServer());
  const integration = (method: 'get' | 'post', path: string, token: string | null = SECRET) => {
    const req = api()[method](`/api/integrations/n8n/${path}`);
    return token === null ? req : req.set('Authorization', `Bearer ${token}`);
  };
  const dispatcher = () => app.get(OutboxDispatcher);
  const outbox = (communicationId: string) =>
    prisma.outboxEvent.findUniqueOrThrow({
      where: {
        type_aggregateId: { type: 'PARENT_COMMUNICATION_APPROVED', aggregateId: communicationId },
      },
    });
  /** Rend l'événement immédiatement éligible (la reprise attend sinon son délai). */
  const due = (communicationId: string) =>
    prisma.outboxEvent.updateMany({
      where: { aggregateId: communicationId },
      data: { nextAttemptAt: new Date(Date.now() - 1_000) },
    });

  async function approved(text = 'Message approuvé'): Promise<string> {
    const voice = await api()
      .post('/api/files')
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .field('kind', 'VOICE')
      .attach('file', audio);
    const draft = await api()
      .post('/api/parent-communications')
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({ studentId, guardianId, text, voiceFileId: voice.body.id });
    const sent = await api()
      .post(`/api/parent-communications/${draft.body.id}/submit`)
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({ version: draft.body.version });
    const decided = await api()
      .post(`/api/admin/parent-communications/${sent.body.id}/decision`)
      .set('Cookie', superadmin)
      .set('Origin', TEST_ORIGIN)
      .send({ action: 'APPROVE', revision: 1, version: sent.body.version });
    expect(decided.status).toBe(200);
    return decided.body.id as string;
  }

  beforeAll(async () => {
    fakeN8n = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        res.writeHead(fakeStatus).end();
      });
    });
    await new Promise<void>((resolve) => fakeN8n.listen(0, '127.0.0.1', resolve));
    fakeUrl = `http://127.0.0.1:${(fakeN8n.address() as AddressInfo).port}/webhook/ljj`;

    await resetDatabase(prisma);
    await seedDemo(prisma);
    config = {
      ...loadConfig(),
      n8n: { webhookUrl: fakeUrl, secret: SECRET, timeoutMs: 2_000 },
      parentCommunicationChannels: ['EMAIL', 'WHATSAPP'],
    };
    app = await createTestApp([], [{ provide: APP_CONFIG, useValue: config }]);
    superadmin = await loginAs(app, 'superadmin');
    enseignante = await loginAs(app, 'enseignante');

    const violet = (
      await prisma.schoolClass.findUniqueOrThrow({ where: { name: '1ère année Violet' } })
    ).id;
    await prisma.teacherClass.create({
      data: { teacherId: await userId(prisma, 'enseignante'), classId: violet },
    });
    studentId = (
      await prisma.student.create({
        data: {
          firstName: 'Lina',
          lastName: 'Ben Salah',
          classId: violet,
          parentPhone: '+21620000001',
          mealService: 'CANTINE',
        },
      })
    ).id;
    const passwordHash = await app.get(AuthService).hashPassword(SEED_PASSWORD);
    const parentUser = await prisma.user.create({
      data: {
        username: 'parent.lina',
        displayName: 'Sonia Ben Salah',
        role: 'PARENT',
        passwordHash,
        mustChangePassword: false,
      },
    });
    guardianId = (
      await prisma.guardian.create({
        data: {
          firstName: 'Sonia',
          lastName: 'Ben Salah',
          email: 'sonia@example.org',
          phone: '+21620000001',
          userId: parentUser.id,
          students: { create: [{ studentId }] },
        },
      })
    ).id;
    parent = await loginAs(app, 'parent.lina');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await new Promise<void>((resolve) => fakeN8n.close(() => resolve()));
  });

  beforeEach(() => {
    received.length = 0;
    fakeStatus = 200;
    config.n8n = { webhookUrl: fakeUrl, secret: SECRET, timeoutMs: 2_000 };
    config.parentCommunicationChannels = ['EMAIL', 'WHATSAPP'];
  });

  it('n8n arrêté : approbation et lecture parent fonctionnent ; l’événement attend une nouvelle tentative', async () => {
    config.n8n = { webhookUrl: 'http://127.0.0.1:9/webhook/ljj', secret: SECRET, timeoutMs: 1_000 };
    const id = await approved();
    expect(
      await prisma.parentCommunicationDelivery.findMany({
        where: { communicationId: id },
        select: { channel: true, status: true },
        orderBy: { channel: 'asc' },
      }),
    ).toEqual([
      { channel: 'EMAIL', status: 'PENDING' },
      { channel: 'WHATSAPP', status: 'PENDING' },
    ]);

    await dispatcher().runOnce();
    const event = await outbox(id);
    expect(event).toMatchObject({ status: 'PENDING', attempts: 1, lastError: expect.any(String) });
    expect(event.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect((await api().get(`/api/parent/messages/${id}`).set('Cookie', parent)).status).toBe(200);
  });

  it('reprise : n8n revenu, l’événement en attente part une seule fois, signé, sans contenu', async () => {
    const id = await approved('Remarque confidentielle à ne jamais transmettre');
    await dispatcher().runOnce();
    expect(received).toHaveLength(1);
    const [call] = received;
    const body = JSON.parse(call!.body) as {
      eventId: string;
      type: string;
      communicationId: string;
    };
    expect(body).toMatchObject({
      type: 'PARENT_COMMUNICATION_APPROVED',
      communicationId: id,
      eventId: (await outbox(id)).id,
    });
    expect(call!.headers['x-ljj-event-id']).toBe(body.eventId);
    expect(call!.headers['x-ljj-signature']).toBe(
      signBody(SECRET, String(call!.headers['x-ljj-timestamp']), call!.body),
    );
    expect(call!.body).not.toMatch(/confidentielle|sonia|Ben Salah|\+216/i);
    expect(await outbox(id)).toMatchObject({ status: 'SENT', sentAt: expect.any(Date) });

    // Reprise après panne : l'événement de l'essai précédent (n8n arrêté) part lui aussi, une seule fois.
    await prisma.outboxEvent.updateMany({
      where: { status: 'PENDING' },
      data: { nextAttemptAt: new Date(Date.now() - 1_000) },
    });
    received.length = 0;
    await dispatcher().runOnce();
    const pendingBefore = received.length;
    await dispatcher().runOnce();
    expect(received).toHaveLength(pendingBefore);
    expect(await prisma.outboxEvent.count({ where: { status: 'PENDING' } })).toBe(0);
  });

  it('tentatives limitées : après 8 échecs, l’événement passe à FAILED et n’est plus envoyé', async () => {
    fakeStatus = 500;
    const id = await approved();
    for (let i = 0; i < 8; i++) {
      await due(id);
      await dispatcher().runOnce();
    }
    expect(await outbox(id)).toMatchObject({
      status: 'FAILED',
      attempts: 8,
      lastError: expect.stringContaining('500'),
    });
    received.length = 0;
    await due(id);
    await dispatcher().runOnce();
    expect(received).toHaveLength(0);
    expect((await api().get(`/api/parent/messages/${id}`).set('Cookie', parent)).status).toBe(200);
  });

  it('sans n8n configuré : aucun envoi, les événements attendent', async () => {
    config.n8n = null;
    const id = await approved();
    await dispatcher().runOnce();
    expect(received).toHaveLength(0);
    expect(await outbox(id)).toMatchObject({ status: 'PENDING', attempts: 0 });
  });

  it('données pour n8n : jeton exigé, informations minimales, communication approuvée seulement', async () => {
    const id = await approved('Texte à ne pas transmettre');
    expect((await integration('get', `parent-communications/${id}`, null)).status).toBe(401);
    expect((await integration('get', `parent-communications/${id}`, 'x'.repeat(40))).status).toBe(
      401,
    );
    const res = await integration('get', `parent-communications/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      communicationId: id,
      recipient: {
        firstName: 'Sonia',
        lastName: 'Ben Salah',
        email: 'sonia@example.org',
        phone: '+21620000001',
      },
      student: { firstName: 'Lina' },
      teacher: { displayName: expect.any(String) },
      channels: ['EMAIL', 'WHATSAPP'],
      link: `${config.appOrigin}/messages-ecole/${id}`,
      approvedAt: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toMatch(/Texte à ne pas transmettre|voice|storagePath/);

    // Canal WhatsApp désactivé : le téléphone n'est plus transmis.
    config.parentCommunicationChannels = ['EMAIL'];
    const emailOnly = await integration('get', `parent-communications/${id}`);
    expect(emailOnly.body).toMatchObject({
      channels: ['EMAIL'],
      recipient: { email: 'sonia@example.org' },
    });
    expect(emailOnly.body.recipient).not.toHaveProperty('phone');

    const pending = await prisma.parentCommunication.findFirst({
      where: { status: { not: 'APPROVED' } },
    });
    if (pending)
      expect((await integration('get', `parent-communications/${pending.id}`)).status).toBe(404);
  });

  it('comptes rendus : liés à un événement envoyé, idempotents ; un échec externe ne retire rien au parent', async () => {
    const id = await approved();
    await dispatcher().runOnce();
    const eventId = (await outbox(id)).id;
    const report = (body: object, token: string | null = SECRET) =>
      integration('post', 'deliveries', token).send({ eventId, communicationId: id, ...body });

    expect(
      (await report({ channel: 'EMAIL', status: 'FAILED', error: 'SMTP 550' }, null)).status,
    ).toBe(401);
    expect((await report({ channel: 'EMAIL', status: 'PROCESSING' })).status).toBe(200);
    const failed = await report({
      channel: 'EMAIL',
      status: 'FAILED',
      error: 'SMTP 550 boîte inexistante',
    });
    expect(failed.status).toBe(200);
    expect(
      (await report({ channel: 'EMAIL', status: 'FAILED', error: 'SMTP 550 boîte inexistante' }))
        .status,
    ).toBe(200);
    expect(
      await prisma.parentCommunicationDelivery.findUniqueOrThrow({
        where: { communicationId_channel: { communicationId: id, channel: 'EMAIL' } },
      }),
    ).toMatchObject({
      status: 'FAILED',
      attempts: 1,
      lastError: 'SMTP 550 boîte inexistante',
    });

    expect(
      (await report({ channel: 'WHATSAPP', status: 'DELIVERED', providerMessageId: 'wamid.123' }))
        .status,
    ).toBe(200);
    expect((await report({ channel: 'WHATSAPP', status: 'FAILED', error: 'tardif' })).status).toBe(
      200,
    );
    expect(
      await prisma.parentCommunicationDelivery.findUniqueOrThrow({
        where: { communicationId_channel: { communicationId: id, channel: 'WHATSAPP' } },
      }),
    ).toMatchObject({
      status: 'DELIVERED',
      providerMessageId: 'wamid.123',
    });

    // Événement inconnu ou d'une autre communication, canal non activé : refusés.
    expect(
      (
        await integration('post', 'deliveries').send({
          eventId: '00000000-0000-4000-8000-000000000000',
          communicationId: id,
          channel: 'EMAIL',
          status: 'SENT',
        })
      ).status,
    ).toBe(404);
    config.parentCommunicationChannels = ['EMAIL'];
    expect((await report({ channel: 'WHATSAPP', status: 'SENT' })).status).toBe(422);

    expect(
      await prisma.auditLog.count({
        where: { action: 'PARENT_COMMUNICATION_DELIVERY', targetId: id },
      }),
    ).toBeGreaterThanOrEqual(3);
    expect((await api().get(`/api/parent/messages/${id}`).set('Cookie', parent)).status).toBe(200);
    // La validation voit l'état des livraisons.
    const detail = await api()
      .get(`/api/admin/parent-communications/${id}`)
      .set('Cookie', superadmin);
    expect(detail.body.deliveries).toEqual([
      expect.objectContaining({ channel: 'EMAIL', status: 'FAILED' }),
      expect.objectContaining({ channel: 'WHATSAPP', status: 'DELIVERED' }),
    ]);
  });
});
