import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** T090 — US7 : historique complet d'une demande et changement de priorité tracé. */
describe('Historique et priorité', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let enseignante: string;
  let reprographie: string;
  let responsable: string;
  let reprographieId: string;

  const api = () => request(app.getHttpServer());

  async function create(): Promise<{ id: string; version: number }> {
    const res = await api()
      .post('/api/requests')
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({
        clientId: randomUUID(),
        title: 'Photocopies',
        description: 'x',
        categoryId: await categoryId(prisma, CATEGORIES.photocopies),
        recipientId: reprographieId,
        priority: 'NORMAL',
      });
    return res.body;
  }

  function act(cookie: string, id: string, body: Record<string, unknown>) {
    return api().post(`/api/requests/${id}/actions`).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  }

  function changePriority(cookie: string, id: string, body: Record<string, unknown>) {
    return api().patch(`/api/requests/${id}/priority`).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    enseignante = await loginAs(app, 'enseignante');
    reprographie = await loginAs(app, 'reprographie');
    responsable = await loginAs(app, 'responsable');
    reprographieId = await userId(prisma, 'reprographie');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('liste chronologiquement chaque action avec son auteur (ou « Système ») et les noms des employés', async () => {
    const { id, version } = await create();
    const accepted = await act(reprographie, id, { action: 'ACCEPT', version });
    await api()
      .post(`/api/requests/${id}/messages`)
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({ clientId: randomUUID(), text: 'Merci' })
      .expect(201);
    await prisma.requestEvent.create({ data: { requestId: id, actorId: null, type: 'OVERDUE', toValue: { stage: 'COMPLETION' } } });

    const res = await api().get(`/api/requests/${id}/history`).set('Cookie', enseignante);
    expect(res.status).toBe(200);
    expect(res.body.map((e: { type: string }) => e.type)).toEqual([
      'CREATED',
      'STATUS_CHANGED',
      'ASSIGNED',
      'STATUS_CHANGED',
      'MESSAGE_ADDED',
      'OVERDUE',
    ]);
    expect(res.body[0]).toEqual({
      id: expect.any(String),
      type: 'CREATED',
      actor: { id: expect.any(String), displayName: 'Enseignante' },
      fromValue: null,
      toValue: expect.objectContaining({ priority: 'NORMAL' }),
      comment: null,
      createdAt: expect.any(String),
    });
    expect(res.body[2].toValue).toEqual({ assigneeId: reprographieId, assigneeName: 'Reprographie' });
    expect(res.body[3]).toMatchObject({ actor: { displayName: 'Reprographie' }, fromValue: { status: 'SENT' }, toValue: { status: 'ACCEPTED' } });
    expect(res.body[5]).toMatchObject({ actor: null, toValue: { stage: 'COMPLETION' } });
    // Les dates sont croissantes.
    const dates = res.body.map((e: { createdAt: string }) => Date.parse(e.createdAt));
    expect([...dates].sort((x, y) => x - y)).toEqual(dates);
    expect(accepted.status).toBe(200);
  });

  it('refuse l’historique à un non-participant (404)', async () => {
    const { id } = await create();
    const autre = await loginAs(app, 'autre');
    expect((await api().get(`/api/requests/${id}/history`).set('Cookie', autre)).status).toBe(404);
  });

  describe('Changement de priorité', () => {
    it('par la demandeuse tant que la demande n’est pas acceptée, tracé avant/après', async () => {
      const { id, version } = await create();
      const before = await prisma.request.findUniqueOrThrow({ where: { id } });

      const res = await changePriority(enseignante, id, { priority: 'URGENT', version });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ priority: 'URGENT', version: version + 1 });

      const event = await prisma.requestEvent.findFirstOrThrow({ where: { requestId: id, type: 'PRIORITY_CHANGED' } });
      expect(event).toMatchObject({ fromValue: { priority: 'NORMAL' }, toValue: { priority: 'URGENT' } });
      // Les échéances en cours ne sont pas recalculées (instantané des règles, FR-022).
      const after = await prisma.request.findUniqueOrThrow({ where: { id } });
      expect(after.currentDueAt).toEqual(before.currentDueAt);
      expect(after.rulesSnapshot).toEqual(before.rulesSnapshot);
    });

    it('n’est plus permis à la demandeuse après acceptation (403)', async () => {
      const { id, version } = await create();
      const accepted = await act(reprographie, id, { action: 'ACCEPT', version });
      const res = await changePriority(enseignante, id, { priority: 'HIGH', version: accepted.body.version });
      expect(res.status).toBe(403);
    });

    it('par un responsable de la catégorie tant que la demande n’est ni terminée ni finale', async () => {
      const { id, version } = await create();
      const accepted = await act(reprographie, id, { action: 'ACCEPT', version });
      const res = await changePriority(responsable, id, { priority: 'HIGH', version: accepted.body.version });
      expect(res.status).toBe(200);
      expect(res.body.priority).toBe('HIGH');

      const started = await act(reprographie, id, { action: 'START', version: res.body.version });
      const done = await act(reprographie, id, { action: 'COMPLETE', version: started.body.version });
      expect((await changePriority(responsable, id, { priority: 'NORMAL', version: done.body.version })).status).toBe(403);
    });

    it('refuse une version périmée, une priorité inconnue ou une priorité identique', async () => {
      const { id, version } = await create();
      expect((await changePriority(enseignante, id, { priority: 'HIGH', version: version + 5 })).body.error.code).toBe('STATE_CHANGED');
      expect((await changePriority(enseignante, id, { priority: 'EXTREME', version })).status).toBe(400);
      expect((await changePriority(enseignante, id, { priority: 'NORMAL', version })).status).toBe(400);
    });

    it('un employé affecté ne peut pas changer la priorité', async () => {
      const { id, version } = await create();
      expect((await changePriority(reprographie, id, { priority: 'URGENT', version })).status).toBe(403);
    });
  });
});
