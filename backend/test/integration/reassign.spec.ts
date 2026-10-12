import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** T081 — US6 : réaffectation par un responsable (FR-027, T18). */
describe('Réaffectation', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let enseignante: string;
  let reprographie: string;
  let responsable: string;
  let reprographieId: string;
  let backupId: string;
  let responsableId: string;

  const api = () => request(app.getHttpServer());

  function act(cookie: string, id: string, body: Record<string, unknown>) {
    return api().post(`/api/requests/${id}/actions`).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  }

  async function create(): Promise<{ id: string; version: number }> {
    const res = await api()
      .post('/api/requests')
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({
        clientId: randomUUID(),
        title: 'À réaffecter',
        description: 'x',
        categoryId: await categoryId(prisma, CATEGORIES.photocopies),
        recipientId: reprographieId,
        priority: 'URGENT',
      });
    return res.body;
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    const reference = await prisma.user.findUniqueOrThrow({ where: { username: 'reprographie' } });
    const backup = await prisma.user.create({
      data: { username: 'renfort', displayName: 'Renfort reprographie', role: 'EMPLOYEE', passwordHash: reference.passwordHash, mustChangePassword: false },
    });
    backupId = backup.id;
    await prisma.categoryRecipient.create({ data: { categoryId: await categoryId(prisma, CATEGORIES.photocopies), userId: backupId } });
    app = await createTestApp();
    enseignante = await loginAs(app, 'enseignante');
    reprographie = await loginAs(app, 'reprographie');
    responsable = await loginAs(app, 'responsable');
    reprographieId = await userId(prisma, 'reprographie');
    responsableId = await userId(prisma, 'responsable');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it.each([['SENT', []], ['ACCEPTED', ['ACCEPT']], ['IN_PROGRESS', ['ACCEPT', 'START']]] as const)(
    'depuis %s : repasse « Envoyée » pour le nouvel employé, avec un nouveau délai de prise en charge',
    async (_status, steps) => {
      const created = await create();
      let version = created.version;
      for (const action of steps) version = (await act(reprographie, created.id, { action, version })).body.version;

      const detail = await api().get(`/api/requests/${created.id}`).set('Cookie', responsable);
      expect(detail.body.allowedActions).toContain('REASSIGN');

      const res = await act(responsable, created.id, { action: 'REASSIGN', version, assigneeId: backupId });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'SENT', assignee: { id: backupId }, currentStage: 'TAKEOVER', overdueStage: null });

      const event = await prisma.requestEvent.findFirstOrThrow({ where: { requestId: created.id, type: 'REASSIGNED' } });
      expect(event).toMatchObject({ actorId: responsableId, fromValue: { assigneeId: reprographieId }, toValue: { assigneeId: backupId } });
      await expect(
        prisma.notification.count({ where: { requestId: created.id, userId: backupId, type: 'URGENT' } }),
      ).resolves.toBe(1);

      // L'ancien employé perd l'accès (minimisation) ; ses actions restent dans l'historique.
      expect((await api().get(`/api/requests/${created.id}`).set('Cookie', reprographie)).status).toBe(404);
    },
  );

  it('refuse un employé hors des destinataires de la catégorie', async () => {
    const { id, version } = await create();
    const res = await act(responsable, id, { action: 'REASSIGN', version, assigneeId: await userId(prisma, 'enseignante') });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('RECIPIENT_NOT_ALLOWED');
  });

  it('est refusée à un employé et à la demandeuse (403)', async () => {
    const { id, version } = await create();
    expect((await act(reprographie, id, { action: 'REASSIGN', version, assigneeId: backupId })).status).toBe(403);
    expect((await act(enseignante, id, { action: 'REASSIGN', version, assigneeId: backupId })).status).toBe(403);
  });

  it('est refusée à un responsable privé de la permission REQUEST_REASSIGN', async () => {
    const { id, version } = await create();
    await prisma.rolePermission.delete({ where: { role_permission: { role: 'MANAGER', permission: 'REQUEST_REASSIGN' } } });
    try {
      const fresh = await loginAs(app, 'responsable');
      const detail = await api().get(`/api/requests/${id}`).set('Cookie', fresh);
      expect(detail.body.allowedActions).not.toContain('REASSIGN');
      expect((await act(fresh, id, { action: 'REASSIGN', version, assigneeId: backupId })).status).toBe(403);
    } finally {
      await prisma.rolePermission.create({ data: { role: 'MANAGER', permission: 'REQUEST_REASSIGN' } });
    }
  });
});
