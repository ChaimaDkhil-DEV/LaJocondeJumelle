import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { join } from 'node:path';
import request from 'supertest';
import { AuthService } from '../../src/auth/auth.service';
import { loadConfig, type AppConfig } from '../../src/config/config';
import { APP_CONFIG } from '../../src/config/config.module';
import { OutboxDispatcher } from '../../src/integrations/outbox-dispatcher.service';
import { loginAs, SEED_PASSWORD, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * 015 (T044) : chaîne réelle API → n8n → API, seulement si N8N_LIVE_WEBHOOK_URL désigne un n8n qui exécute
 * deploy/n8n/ljj-parent-communication.workflow.json (publié), avec LJJ_SHARED_SECRET = N8N_LIVE_SECRET et
 * LJJ_API_URL joignant cette API sur N8N_LIVE_API_PORT (par exemple http://host.docker.internal:18080).
 * Sans ces variables, la suite est ignorée : les tests ordinaires ne dépendent d'aucun service.
 * Les canaux (SMTP, WhatsApp) sont ceux configurés dans n8n : réels, ou des serveurs factices.
 */
const WEBHOOK = process.env.N8N_LIVE_WEBHOOK_URL;
const SECRET = process.env.N8N_LIVE_SECRET ?? '';
const PORT = Number(process.env.N8N_LIVE_API_PORT ?? 18080);
const audio = join(__dirname, '..', 'fixtures', 'audio', 'sample.webm');

(WEBHOOK ? describe : describe.skip)('n8n réel (opt-in, N8N_LIVE_WEBHOOK_URL)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let superadmin: string;
  let studentId: string;
  let guardianId: string;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    const config: AppConfig = {
      ...loadConfig(),
      n8n: { webhookUrl: WEBHOOK!, secret: SECRET, timeoutMs: 10_000 },
      parentCommunicationChannels: ['EMAIL', 'WHATSAPP'],
    };
    app = await createTestApp([], [{ provide: APP_CONFIG, useValue: config }]);
    await app.listen(PORT, '0.0.0.0');
    superadmin = await loginAs(app, 'superadmin');
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
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('publication → événement signé accepté par n8n → données minimales lues → livraisons rapportées', async () => {
    // 017 : message de l'administration au parent, publié (envoi direct du super administrateur).
    const voice = await api()
      .post('/api/files')
      .set('Cookie', superadmin)
      .set('Origin', TEST_ORIGIN)
      .field('kind', 'VOICE')
      .attach('file', audio);
    const published = await api()
      .post('/api/admin/communications/conversations')
      .set('Cookie', superadmin)
      .set('Origin', TEST_ORIGIN)
      .send({ type: 'PARENT', studentId, guardianId, text: 'Remarque jamais transmise à n8n', voiceFileId: voice.body.id });
    expect(published.status).toBe(201);
    const id = published.body.messages[0].id as string;

    await app.get(OutboxDispatcher).runOnce();
    expect(await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: id } })).toMatchObject(
      { status: 'SENT', attempts: 1 },
    );

    const deadline = Date.now() + 60_000;
    let deliveries: Array<{
      channel: string;
      status: string;
      providerMessageId: string | null;
      lastError: string | null;
    }> = [];
    while (Date.now() < deadline) {
      deliveries = await prisma.parentCommunicationDelivery.findMany({
        where: { communicationId: id },
        select: { channel: true, status: true, providerMessageId: true, lastError: true },
        orderBy: { channel: 'asc' },
      });
      if (deliveries.every((d) => d.status !== 'PENDING')) break;
      await new Promise((r) => setTimeout(r, 1_000));
    }
    console.log('[n8n réel] livraisons :', JSON.stringify(deliveries));
    expect(deliveries.map((d) => d.channel)).toEqual(['EMAIL', 'WHATSAPP']);
    for (const d of deliveries) expect(['SENT', 'DELIVERED', 'FAILED']).toContain(d.status);
    if (process.env.N8N_LIVE_EXPECT_SENT)
      for (const d of deliveries)
        expect(d).toMatchObject({ status: 'SENT', providerMessageId: expect.any(String) });

    const audit = await prisma.auditLog.findMany({
      where: { action: 'PARENT_COMMUNICATION_DELIVERY', targetId: id },
      select: { details: true },
    });
    expect(audit.map((a) => (a.details as { event: string }).event).sort()).toEqual([
      'DATA_READ',
      'REPORT',
      'REPORT',
    ]);
  }, 90_000);
});
