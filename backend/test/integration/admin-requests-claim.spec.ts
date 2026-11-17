import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createSecondAdmin } from '../utils/second-admin';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** T014 — 018, US1 : prise en charge atomique (FR-003, SC-001), research R1. */
describe('Prise en charge d’une demande', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let enseignante: string;
  let reprographie: string;
  let admin: string;
  let admin2: string;
  let superadmin: string;
  let adminId: string;
  let admin2Id: string;
  let circuitB: string;

  const api = () => request(app.getHttpServer());
  const post = (cookie: string, path: string, body: Record<string, unknown> = {}) =>
    api().post(path).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  const claim = (cookie: string, id: string, version: number) => post(cookie, `/api/admin/requests/${id}/claim`, { version });

  async function submit(): Promise<{ id: string; version: number }> {
    const res = await post(enseignante, '/api/requests', {
      clientId: randomUUID(),
      title: 'Réparer le vidéoprojecteur',
      description: 'Salle 12',
      categoryId: circuitB,
      priority: 'NORMAL',
    });
    expect(res.status).toBe(201);
    return res.body;
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    admin2Id = await createSecondAdmin(prisma);
    app = await createTestApp();
    enseignante = await loginAs(app, 'enseignante');
    reprographie = await loginAs(app, 'reprographie');
    admin = await loginAs(app, 'admin');
    admin2 = await loginAs(app, 'admin2');
    superadmin = await loginAs(app, 'superadmin');
    adminId = await userId(prisma, 'admin');
    circuitB = await categoryId(prisma, CATEGORIES.circuitB);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('réussit : responsable, date, version, une ligne d’historique « CLAIMED », une entrée d’audit, statut inchangé', async () => {
    const { id, version } = await submit();
    const res = await claim(admin, id, version);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id,
      status: 'PENDING_ADMIN_VALIDATION',
      version: version + 1,
      adminOwner: { id: adminId, displayName: expect.any(String) },
      ownership: { canClaim: false },
    });
    expect(res.body.adminOwnedAt).toBeTruthy();
    expect(res.body.allowedActions.sort()).toEqual(['APPROVE', 'CHANGE_PRIORITY', 'REJECT']);

    const row = await prisma.request.findUniqueOrThrow({ where: { id } });
    expect(row.adminOwnerId).toBe(adminId);
    expect(row.adminOwnedAt).not.toBeNull();
    expect(row.assigneeId).toBeNull();
    expect(row.assignedAt).toBeNull();

    await expect(prisma.requestAssignment.findMany({ where: { requestId: id } })).resolves.toEqual([
      expect.objectContaining({ operation: 'CLAIMED', adminId, previousAdminId: null, actorId: adminId, reason: null, transferId: null }),
    ]);
    const audit = await prisma.auditLog.findMany({ where: { action: 'REQUEST_MANAGED', targetId: id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: adminId, details: { action: 'CLAIM', after: { adminOwnerId: adminId } } });
  });

  it('demande déjà prise : 409 explicite, rien ne change', async () => {
    const { id, version } = await submit();
    const first = await claim(admin, id, version);
    for (const v of [version, first.body.version]) {
      const res = await claim(admin2, id, v);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('REQUEST_ALREADY_CLAIMED');
      expect(res.body.error.message).toMatch(/collègue/i);
    }
    // Le responsable qui reclique (double clic) reçoit la même réponse, sans seconde ligne d'historique.
    expect((await claim(admin, id, first.body.version)).status).toBe(409);
    expect((await prisma.request.findUniqueOrThrow({ where: { id } })).adminOwnerId).toBe(adminId);
    await expect(prisma.requestAssignment.count({ where: { requestId: id } })).resolves.toBe(1);
  });

  it('deux prises en charge simultanées : une seule réussit, une seule ligne d’historique (SC-001)', async () => {
    for (let round = 0; round < 15; round += 1) {
      const { id, version } = await submit();
      const results = await Promise.all([claim(admin, id, version), claim(admin2, id, version)]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 409]);
      const loser = results.find((r) => r.status === 409)!;
      expect(loser.body.error.code).toBe('REQUEST_ALREADY_CLAIMED');
      const winner = results.find((r) => r.status === 200)!;

      const row = await prisma.request.findUniqueOrThrow({ where: { id } });
      expect(row.adminOwnerId).toBe(winner.body.adminOwner.id);
      expect([adminId, admin2Id]).toContain(row.adminOwnerId);
      expect(row.version).toBe(version + 1);
      const history = await prisma.requestAssignment.findMany({ where: { requestId: id } });
      expect(history).toHaveLength(1);
      expect(history[0].adminId).toBe(row.adminOwnerId);
      await expect(prisma.auditLog.count({ where: { action: 'REQUEST_MANAGED', targetId: id } })).resolves.toBe(1);
    }
  });

  it('version périmée sur une demande encore libre : 409 STATE_CHANGED', async () => {
    const { id, version } = await submit();
    const res = await claim(admin, id, version + 5);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STATE_CHANGED');
    expect((await prisma.request.findUniqueOrThrow({ where: { id } })).adminOwnerId).toBeNull();
  });

  it('demande qui n’attend plus la validation : refusée', async () => {
    const { id, version } = await submit();
    const cancelled = await post(enseignante, `/api/requests/${id}/actions`, { action: 'CANCEL', version });
    const res = await claim(admin, id, cancelled.body.version);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('corps invalide : 400', async () => {
    const { id } = await submit();
    expect((await claim(admin, id, -1)).status).toBe(400);
    expect((await post(admin, `/api/admin/requests/${id}/claim`, {})).status).toBe(400);
    expect((await post(admin, `/api/admin/requests/${id}/claim`, { version: 0, adminId: admin2Id })).status).toBe(400);
  });

  it('refus : super administrateur (403), admin hors catégorie et demande inconnue (404), employé (403) — tous journalisés', async () => {
    const { id, version } = await submit();
    const denied = () => prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } });
    let before = await denied();

    const bySuper = await claim(superadmin, id, version);
    expect(bySuper.status).toBe(403);
    expect(await denied()).toBe(before + 1);

    before = await denied();
    await prisma.categoryManager.delete({ where: { categoryId_userId: { categoryId: circuitB, userId: admin2Id } } });
    expect((await claim(admin2, id, version)).status).toBe(404);
    await prisma.categoryManager.create({ data: { categoryId: circuitB, userId: admin2Id } });
    expect((await claim(admin, randomUUID(), 0)).status).toBe(404);
    expect((await claim(admin, 'pas-un-uuid', 0)).status).toBe(404);
    expect(await denied()).toBe(before + 3);

    before = await denied();
    expect((await claim(reprographie, id, version)).status).toBe(403);
    expect((await claim(enseignante, id, version)).status).toBe(403);
    expect(await denied()).toBe(before + 2);

    expect((await prisma.request.findUniqueOrThrow({ where: { id } })).adminOwnerId).toBeNull();
    await expect(prisma.requestAssignment.count({ where: { requestId: id } })).resolves.toBe(0);
  });

  it('sans en-tête Origin : refusé par la garde CSRF', async () => {
    const { id, version } = await submit();
    const res = await api().post(`/api/admin/requests/${id}/claim`).set('Cookie', admin).send({ version });
    expect(res.status).toBe(403);
  });
});
