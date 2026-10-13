import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { JOB_INTERVAL_MS } from '../../src/scheduler/auto-close.job';
import { OverdueJob } from '../../src/scheduler/overdue.job';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** T080 — US6 : échéances calculées aux transitions, retards détectés par le job (V14, SC-006). */
describe('Délais et retards', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let job: OverdueJob;
  let enseignante: string;
  let reprographie: string;
  let reprographieId: string;
  let responsableId: string;

  const api = () => request(app.getHttpServer());

  async function create(category: string, priority: string, recipient = true): Promise<{ id: string; version: number }> {
    const res = await api()
      .post('/api/requests')
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({
        clientId: randomUUID(),
        title: 'Demande à délai',
        description: 'x',
        categoryId: await categoryId(prisma, category as (typeof CATEGORIES)[keyof typeof CATEGORIES]),
        ...(recipient ? { recipientId: reprographieId } : {}),
        priority,
      });
    expect(res.status).toBe(201);
    return res.body;
  }

  /** Simule l'écoulement du délai de l'étape en cours. */
  async function expire(id: string, minutesAgo = 1): Promise<void> {
    await prisma.request.update({ where: { id }, data: { currentDueAt: new Date(Date.now() - minutesAgo * 60_000) } });
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    job = app.get(OverdueJob);
    enseignante = await loginAs(app, 'enseignante');
    reprographie = await loginAs(app, 'reprographie');
    reprographieId = await userId(prisma, 'reprographie');
    responsableId = await userId(prisma, 'responsable');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('le job tourne assez souvent pour signaler un retard en moins de 30 s', () => {
    expect(JOB_INTERVAL_MS).toBeLessThanOrEqual(15_000);
  });

  it('calcule l’échéance de prise en charge à l’envoi, depuis l’instantané des règles', async () => {
    const before = Date.now();
    const { id } = await create(CATEGORIES.photocopies, 'URGENT'); // prise en charge 1 min (seed)
    const detail = await api().get(`/api/requests/${id}`).set('Cookie', enseignante);
    expect(detail.body.currentStage).toBe('TAKEOVER');
    const due = new Date(detail.body.currentDueAt).getTime();
    expect(due - before).toBeGreaterThanOrEqual(60_000 - 1000);
    expect(due - before).toBeLessThanOrEqual(60_000 + 5000);
    // Seuil d'alerte par défaut : 20 % de la durée avant l'échéance.
    expect(due - new Date(detail.body.warnAt).getTime()).toBe(12_000);
  });

  it('marque le retard une seule fois, notifie responsables et employé, sans rien masquer', async () => {
    const { id } = await create(CATEGORIES.photocopies, 'URGENT');
    await expire(id);

    await job.runOnce();
    await job.runOnce();

    const stored = await prisma.request.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({ overdueStage: 'TAKEOVER', status: 'SENT', version: 0 });
    const events = await prisma.requestEvent.findMany({ where: { requestId: id, type: 'OVERDUE' } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorId: null, toValue: { stage: 'TAKEOVER' } });

    const notified = await prisma.notification.findMany({ where: { requestId: id, type: 'OVERDUE' } });
    expect(notified.map((n) => n.userId).sort()).toEqual([reprographieId, responsableId].sort());

    const detail = await api().get(`/api/requests/${id}`).set('Cookie', enseignante);
    expect(detail.status).toBe(200);
    expect(detail.body.overdueStage).toBe('TAKEOVER');
  });

  it('la fin de l’étape efface le retard en cours ; l’étape suivante peut être en retard à son tour', async () => {
    const { id, version } = await create(CATEGORIES.photocopies, 'URGENT');
    await expire(id);
    await job.runOnce();

    const accepted = await api()
      .post(`/api/requests/${id}/actions`)
      .set('Cookie', reprographie)
      .set('Origin', TEST_ORIGIN)
      .send({ action: 'ACCEPT', version });
    expect(accepted.body).toMatchObject({ currentStage: 'COMPLETION', overdueStage: null });

    await expire(id);
    await job.runOnce();
    const events = await prisma.requestEvent.findMany({ where: { requestId: id, type: 'OVERDUE' }, orderBy: { createdAt: 'asc' } });
    expect(events.map((e) => (e.toValue as { stage: string }).stage)).toEqual(['TAKEOVER', 'COMPLETION']);
    // Le retard de prise en charge reste visible dans l'historique.
    const history = await prisma.requestEvent.count({ where: { requestId: id } });
    expect(history).toBeGreaterThan(3);
  });

  it('« Commencer » conserve l’échéance de réalisation fixée à l’acceptation', async () => {
    const { id, version } = await create(CATEGORIES.photocopies, 'NORMAL');
    const accepted = await api()
      .post(`/api/requests/${id}/actions`)
      .set('Cookie', reprographie)
      .set('Origin', TEST_ORIGIN)
      .send({ action: 'ACCEPT', version });
    const started = await api()
      .post(`/api/requests/${id}/actions`)
      .set('Cookie', reprographie)
      .set('Origin', TEST_ORIGIN)
      .send({ action: 'START', version: accepted.body.version });
    expect(started.body).toMatchObject({
      status: 'IN_PROGRESS',
      currentStage: 'COMPLETION',
      currentDueAt: accepted.body.currentDueAt,
      warnAt: accepted.body.warnAt,
    });
  });

  it('en circuit B, un retard de validation est signalé aux responsables', async () => {
    const { id } = await create(CATEGORIES.circuitB, 'NORMAL', false);
    const stored = await prisma.request.findUniqueOrThrow({ where: { id } });
    expect(stored.currentStage).toBe('VALIDATION');
    await expire(id);
    await job.runOnce();
    const notified = await prisma.notification.findMany({ where: { requestId: id, type: 'OVERDUE' } });
    expect(notified.map((n) => n.userId)).toEqual([responsableId]);
  });

  it('rattrape les échéances passées pendant un arrêt du service', async () => {
    const { id } = await create(CATEGORIES.photocopies, 'NORMAL');
    await expire(id, 24 * 60);
    expect(await job.runOnce()).toBeGreaterThanOrEqual(1);
    await expect(prisma.request.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({ overdueStage: 'TAKEOVER' });
  });

  it('ignore les demandes sans délai suivi ou déjà terminées', async () => {
    const { id, version } = await create(CATEGORIES.photocopies, 'NORMAL');
    await api()
      .post(`/api/requests/${id}/actions`)
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({ action: 'CANCEL', version })
      .expect(200);
    const stored = await prisma.request.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({ currentStage: null, currentDueAt: null });
    await job.runOnce();
    await expect(prisma.requestEvent.count({ where: { requestId: id, type: 'OVERDUE' } })).resolves.toBe(0);
  });
});
