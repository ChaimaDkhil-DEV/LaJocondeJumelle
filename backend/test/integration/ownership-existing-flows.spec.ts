import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createSecondAdmin } from '../utils/second-admin';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * T015 — 018, US1 : le circuit B existant avec un responsable. D4 (agir sur une demande libre vaut prise
 * en charge), FR-005 (une demande prise n'est modifiable que par son responsable), FR-007 (historique).
 */
describe('Responsable administratif et circuit B existant', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let enseignante: string;
  let admin: string;
  let admin2: string;
  let superadmin: string;
  let adminId: string;
  let admin2Id: string;
  let superadminId: string;
  let reprographieId: string;
  let circuitB: string;

  const api = () => request(app.getHttpServer());
  const get = (cookie: string, path: string) => api().get(path).set('Cookie', cookie);
  const send = (verb: 'post' | 'patch', cookie: string, path: string, body: Record<string, unknown> = {}) =>
    api()[verb](path).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  const act = (cookie: string, id: string, body: Record<string, unknown>) => send('post', cookie, `/api/requests/${id}/actions`, body);
  const owner = async (id: string) => (await prisma.request.findUniqueOrThrow({ where: { id } })).adminOwnerId;
  const history = (id: string) => prisma.requestAssignment.findMany({ where: { requestId: id }, orderBy: { seq: 'asc' } });
  const denied = () => prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } });

  async function submit(priority = 'NORMAL'): Promise<{ id: string; version: number }> {
    const res = await send('post', enseignante, '/api/requests', {
      clientId: randomUUID(),
      title: 'Réparer le vidéoprojecteur',
      description: 'Salle 12',
      categoryId: circuitB,
      priority,
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
    admin = await loginAs(app, 'admin');
    admin2 = await loginAs(app, 'admin2');
    superadmin = await loginAs(app, 'superadmin');
    adminId = await userId(prisma, 'admin');
    superadminId = await userId(prisma, 'superadmin');
    reprographieId = await userId(prisma, 'reprographie');
    circuitB = await categoryId(prisma, CATEGORIES.circuitB);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('D4 : approuver une demande libre, sans « Prendre en charge », rend l’admin responsable dans la même opération', async () => {
    const { id, version } = await submit();
    const approved = await act(admin2, id, { action: 'APPROVE', version, assigneeId: reprographieId });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ status: 'SENT', assignee: { id: reprographieId }, adminOwner: { id: admin2Id } });
    expect(approved.body.version).toBe(version + 1);
    expect(await history(id)).toEqual([expect.objectContaining({ operation: 'CLAIMED', adminId: admin2Id, actorId: admin2Id, previousAdminId: null })]);
  });

  it('D4 : refuser une demande libre rend aussi l’admin responsable (elle figure dans ses demandes terminées)', async () => {
    const { id, version } = await submit();
    const rejected = await act(admin, id, { action: 'REJECT', version, reason: 'Hors périmètre.' });
    expect(rejected.status).toBe(200);
    expect(await owner(id)).toBe(adminId);
    expect(await history(id)).toHaveLength(1);
    const finished = await get(admin, '/api/admin/requests/mine?scope=finished');
    expect(finished.body.items.map((r: { id: string }) => r.id)).toContain(id);
  });

  it('D4 : une action refusée (motif manquant) ne prend pas la demande', async () => {
    const { id, version } = await submit();
    expect((await act(admin, id, { action: 'REJECT', version })).status).toBe(422);
    expect(await owner(id)).toBeNull();
    expect(await history(id)).toEqual([]);
  });

  it('le super administrateur agit comme avant, sans jamais devenir responsable', async () => {
    const { id, version } = await submit();
    const approved = await act(superadmin, id, { action: 'APPROVE', version, assigneeId: reprographieId });
    expect(approved.status).toBe(200);
    expect(approved.body.adminOwner).toBeNull();
    expect(await history(id)).toEqual([]);
    // Demande déjà validée et restée libre : le premier admin qui agit en devient responsable.
    const reassigned = await act(admin, id, { action: 'REASSIGN', version: approved.body.version, assigneeId: reprographieId });
    expect(reassigned.status).toBe(200);
    expect(await owner(id)).toBe(adminId);
  });

  it('le super administrateur agit aussi sur une demande prise, sans changer son responsable', async () => {
    const { id, version } = await submit();
    const claimed = await send('post', admin, `/api/admin/requests/${id}/claim`, { version });
    const approved = await act(superadmin, id, { action: 'APPROVE', version: claimed.body.version, assigneeId: reprographieId });
    expect(approved.status).toBe(200);
    expect(approved.body.adminOwner).toMatchObject({ id: adminId });
    expect(await history(id)).toHaveLength(1);
    expect(superadminId).not.toBe(await owner(id));
  });

  it('demande prise : un collègue la lit, voit le responsable, mais ne peut ni agir, ni écrire, ni changer la priorité (403 journalisés)', async () => {
    const { id, version } = await submit();
    const claimed = await send('post', admin, `/api/admin/requests/${id}/claim`, { version });
    const v = claimed.body.version;

    const view = await get(admin2, `/api/requests/${id}`);
    expect(view.status).toBe(200);
    expect(view.body).toMatchObject({ adminOwner: { id: adminId }, allowedActions: [], canWriteInThread: false, ownership: { canClaim: false } });
    expect((await get(admin2, `/api/requests/${id}/history`)).status).toBe(200);
    const listed = await get(admin2, '/api/requests?scope=managed');
    expect(listed.body.items.map((r: { id: string }) => r.id)).toContain(id);

    const before = await denied();
    const approve = await act(admin2, id, { action: 'APPROVE', version: v, assigneeId: reprographieId });
    expect(approve.status).toBe(403);
    expect((await act(admin2, id, { action: 'REJECT', version: v, reason: 'Non.' })).status).toBe(403);
    expect((await send('patch', admin2, `/api/requests/${id}/priority`, { priority: 'URGENT', version: v })).status).toBe(403);
    expect((await send('post', admin2, `/api/requests/${id}/messages`, { clientId: randomUUID(), text: 'Je m’en occupe.' })).status).toBe(403);
    expect(await denied()).toBeGreaterThanOrEqual(before + 2);

    const row = await prisma.request.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: 'PENDING_ADMIN_VALIDATION', adminOwnerId: adminId, priority: 'NORMAL', version: v });
    await expect(prisma.message.count({ where: { requestId: id, kind: { not: 'SYSTEM' } } })).resolves.toBe(0);

    // Le responsable, lui, continue normalement.
    expect((await send('post', admin, `/api/requests/${id}/messages`, { clientId: randomUUID(), text: 'Je regarde.' })).status).toBe(201);
    expect((await act(admin, id, { action: 'APPROVE', version: v, assigneeId: reprographieId })).status).toBe(200);
  });

  it('écrire dans le fil ou changer la priorité d’une demande libre ne la prend pas', async () => {
    const { id, version } = await submit();
    expect((await send('post', admin2, `/api/requests/${id}/messages`, { clientId: randomUUID(), text: 'Quelle salle ?' })).status).toBe(201);
    const changed = await send('patch', admin2, `/api/requests/${id}/priority`, { priority: 'URGENT', version });
    expect(changed.status).toBe(200);
    expect(await owner(id)).toBeNull();
    expect(await history(id)).toEqual([]);
  });

  it('demande prise : les notifications d’administration vont au responsable seul', async () => {
    const { id, version } = await submit();
    const claimed = await send('post', admin, `/api/admin/requests/${id}/claim`, { version });
    await prisma.notification.deleteMany({ where: { requestId: id } });
    const cancelled = await act(enseignante, id, { action: 'CANCEL', version: claimed.body.version });
    expect(cancelled.status).toBe(200);
    const notified = await prisma.notification.findMany({ where: { requestId: id, type: 'CANCELLED' } });
    expect(notified.map((n) => n.userId)).toEqual([adminId]);
  });

  it('demande libre : les notifications d’administration vont à tous les admins de la catégorie, comme avant', async () => {
    const { id, version } = await submit();
    await prisma.notification.deleteMany({ where: { requestId: id } });
    await act(enseignante, id, { action: 'CANCEL', version });
    const notified = await prisma.notification.findMany({ where: { requestId: id, type: 'CANCELLED' } });
    expect(notified.map((n) => n.userId).sort()).toEqual([adminId, admin2Id].sort());
  });

  it('historique d’une demande : lisible par les admins de la catégorie et le super administrateur, pas par la demandeuse', async () => {
    const { id, version } = await submit();
    await send('post', admin, `/api/admin/requests/${id}/claim`, { version });
    for (const cookie of [admin, admin2, superadmin]) {
      const res = await get(cookie, `/api/admin/requests/${id}/assignments`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        expect.objectContaining({
          operation: 'CLAIMED',
          admin: { id: adminId, displayName: expect.any(String), jobTitle: expect.anything() },
          previousAdmin: null,
          actor: expect.objectContaining({ id: adminId }),
          reason: null,
          request: expect.objectContaining({ id, title: 'Réparer le vidéoprojecteur' }),
        }),
      ]);
    }
    expect((await get(enseignante, `/api/admin/requests/${id}/assignments`)).status).toBe(403);
    expect((await get(admin, `/api/admin/requests/${randomUUID()}/assignments`)).status).toBe(404);
  });

  it('« mon historique » : les opérations qui concernent l’admin connecté, les plus récentes d’abord', async () => {
    const mine = await get(admin, '/api/admin/assignments/mine');
    expect(mine.status).toBe(200);
    expect(mine.body.items.length).toBeGreaterThanOrEqual(3);
    for (const row of mine.body.items) expect([row.admin.id, row.previousAdmin?.id]).toContain(adminId);
    const dates = mine.body.items.map((r: { createdAt: string }) => r.createdAt);
    expect(dates).toEqual([...dates].sort().reverse());
    const others = await get(admin2, '/api/admin/assignments/mine');
    for (const row of others.body.items) expect([row.admin.id, row.previousAdmin?.id]).toContain(admin2Id);
  });

  it('l’historique des responsables est en ajout seul', async () => {
    const row = await prisma.requestAssignment.findFirstOrThrow();
    await expect(prisma.requestAssignment.update({ where: { id: row.id }, data: { reason: 'réécrit' } })).rejects.toThrow();
    await expect(prisma.requestAssignment.delete({ where: { id: row.id } })).rejects.toThrow();
  });
});
