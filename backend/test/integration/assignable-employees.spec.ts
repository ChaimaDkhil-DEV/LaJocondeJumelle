import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, sessionCookie, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Régression : un employé créé par le super administrateur n'apparaissait pas dans la liste
 * d'affectation, faute d'être destinataire d'une catégorie (aucun moyen de l'y rattacher à la création).
 */
describe('Employés affectables créés par le super administrateur', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let superadmin: string;
  let responsable: string;
  let enseignante: string;
  let circuitB: string;
  let photocopies: string;
  let reprographieId: string;

  const api = () => request(app.getHttpServer());
  const post = (cookie: string, url: string, body: Record<string, unknown> = {}) =>
    api().post(url).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  const patch = (cookie: string, url: string, body: Record<string, unknown>) =>
    api().patch(url).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);

  async function createEmployee(username: string, recipientCategoryIds?: string[]) {
    const res = await post(superadmin, '/api/admin/users', {
      username,
      displayName: `Employé ${username}`,
      jobTitle: 'Maintenance',
      role: 'EMPLOYEE',
      ...(recipientCategoryIds ? { recipientCategoryIds } : {}),
    });
    expect(res.status).toBe(201);
    return res.body as { user: { id: string; recipientCategories: Array<{ id: string; name: string }> }; temporaryPassword: string };
  }

  /** Première connexion du compte créé : mot de passe provisoire remplacé. */
  async function firstLogin(username: string, temporaryPassword: string): Promise<string> {
    const login = await post('', '/api/auth/login', { username, password: temporaryPassword });
    const cookie = sessionCookie(login.headers['set-cookie']);
    expect((await post(cookie, '/api/auth/password', { currentPassword: temporaryPassword, newPassword: 'Nouveau-MotDePasse-2026!' })).status).toBeLessThan(300);
    const relogin = await post('', '/api/auth/login', { username, password: 'Nouveau-MotDePasse-2026!' });
    return sessionCookie(relogin.headers['set-cookie']);
  }

  async function submitCircuitB(): Promise<{ id: string; version: number }> {
    const res = await post(enseignante, '/api/requests', {
      clientId: randomUUID(),
      title: 'Climatisation en panne',
      description: 'Salle 4',
      categoryId: circuitB,
      priority: 'NORMAL',
    });
    expect(res.status).toBe(201);
    return res.body;
  }

  const assigneeIds = async (requestId: string, cookie = responsable): Promise<string[]> => {
    const res = await api().get(`/api/requests/${requestId}/assignees`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    return res.body.map((a: { id: string }) => a.id);
  };

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    superadmin = await loginAs(app, 'superadmin');
    responsable = await loginAs(app, 'responsable');
    enseignante = await loginAs(app, 'enseignante');
    circuitB = await categoryId(prisma, CATEGORIES.circuitB);
    photocopies = await categoryId(prisma, CATEGORIES.photocopies);
    reprographieId = await userId(prisma, 'reprographie');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('un employé créé avec une catégorie apparaît dans la liste d’affectation du responsable, sans champ sensible', async () => {
    const created = await createEmployee('technicien.a', [circuitB]);
    expect(created.user.recipientCategories).toEqual([{ id: circuitB, name: CATEGORIES.circuitB }]);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'USER_CREATED', targetId: created.user.id } });
    expect(audit.details).toMatchObject({ after: { recipientCategoryIds: [circuitB] } });

    const { id } = await submitCircuitB();
    const res = await api().get(`/api/requests/${id}/assignees`).set('Cookie', responsable);
    expect(res.status).toBe(200);
    expect(res.body).toContainEqual({ id: created.user.id, displayName: 'Employé technicien.a', jobTitle: 'Maintenance' });
    for (const entry of res.body) expect(Object.keys(entry).sort()).toEqual(['displayName', 'id', 'jobTitle']);
    expect(JSON.stringify(res.body)).not.toMatch(/argon2|password|temporaryPassword|username/i);
  });

  it('un employé créé sans catégorie n’est pas affectable ; il le devient dès son rattachement, sans redémarrage', async () => {
    const created = await createEmployee('technicien.b');
    expect(created.user.recipientCategories).toEqual([]);
    const { id } = await submitCircuitB();
    expect(await assigneeIds(id)).not.toContain(created.user.id);

    const updated = await patch(superadmin, `/api/admin/users/${created.user.id}`, { recipientCategoryIds: [circuitB, photocopies] });
    expect(updated.status).toBe(200);
    expect(updated.body.recipientCategories.map((c: { id: string }) => c.id).sort()).toEqual([circuitB, photocopies].sort());
    expect(await assigneeIds(id)).toContain(created.user.id);

    const list = await api().get('/api/admin/users').set('Cookie', superadmin);
    expect(list.body.find((u: { id: string }) => u.id === created.user.id).recipientCategories).toHaveLength(2);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'USER_UPDATED', targetId: created.user.id } });
    expect(audit.details).toMatchObject({ before: { recipientCategoryIds: [] }, after: { recipientCategoryIds: [circuitB, photocopies].sort() } });

    // Le retrait d'une catégorie le retire aussitôt de la liste.
    await patch(superadmin, `/api/admin/users/${created.user.id}`, { recipientCategoryIds: [photocopies] }).expect(200);
    expect(await assigneeIds(id)).not.toContain(created.user.id);
  });

  it('un employé désactivé n’apparaît pas, puis réapparaît à sa réactivation', async () => {
    const created = await createEmployee('technicien.c', [circuitB]);
    const { id, version } = await submitCircuitB();
    expect(await assigneeIds(id)).toContain(created.user.id);

    await patch(superadmin, `/api/admin/users/${created.user.id}`, { active: false }).expect(200);
    expect(await assigneeIds(id)).not.toContain(created.user.id);
    const approve = await post(responsable, `/api/requests/${id}/actions`, { action: 'APPROVE', version, assigneeId: created.user.id });
    expect(approve.body.error?.code).toBe('RECIPIENT_NOT_ALLOWED');

    await patch(superadmin, `/api/admin/users/${created.user.id}`, { active: true }).expect(200);
    expect(await assigneeIds(id)).toContain(created.user.id);
  });

  it('refuse la liste à un employé simple (demandeur : 403, autre employé : 404)', async () => {
    const created = await createEmployee('technicien.d', [circuitB]);
    const employee = await firstLogin('technicien.d', created.temporaryPassword);
    const { id } = await submitCircuitB();
    expect((await api().get(`/api/requests/${id}/assignees`).set('Cookie', enseignante)).status).toBe(403);
    expect((await api().get(`/api/requests/${id}/assignees`).set('Cookie', employee)).status).toBe(404);
  });

  it('l’employé créé reçoit l’affectation, la notification, et voit la demande dans sa liste', async () => {
    const created = await createEmployee('technicien.e', [circuitB]);
    const employee = await firstLogin('technicien.e', created.temporaryPassword);
    const { id, version } = await submitCircuitB();

    const approved = await post(responsable, `/api/requests/${id}/actions`, { action: 'APPROVE', version, assigneeId: created.user.id });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ status: 'SENT', assignee: { id: created.user.id } });

    await expect(prisma.notification.count({ where: { requestId: id, userId: created.user.id } })).resolves.toBe(1);
    const notifications = await api().get('/api/notifications').set('Cookie', employee);
    expect(JSON.stringify(notifications.body)).toContain(id);

    const assigned = await api().get('/api/requests?scope=assigned').set('Cookie', employee);
    expect(assigned.status).toBe(200);
    expect(assigned.body.items.map((r: { id: string }) => r.id)).toContain(id);
    expect((await api().get(`/api/requests/${id}`).set('Cookie', employee)).status).toBe(200);
  });

  it('la réaffectation vers un employé fraîchement créé fonctionne', async () => {
    const created = await createEmployee('technicien.f', [circuitB]);
    const { id, version } = await submitCircuitB();
    const approved = await post(responsable, `/api/requests/${id}/actions`, { action: 'APPROVE', version, assigneeId: reprographieId });
    const reassigned = await post(responsable, `/api/requests/${id}/actions`, {
      action: 'REASSIGN',
      version: approved.body.version,
      assigneeId: created.user.id,
    });
    expect(reassigned.status).toBe(200);
    expect(reassigned.body.assignee.id).toBe(created.user.id);
    await expect(prisma.notification.count({ where: { requestId: id, userId: created.user.id } })).resolves.toBe(1);
  });

  it.each([
    ['une catégorie inconnue', { recipientCategoryIds: [randomUUID()] }],
    ['un identifiant de catégorie invalide', { recipientCategoryIds: ['pas-un-uuid'] }],
  ])('refuse la création avec %s', async (_label, extra) => {
    const res = await post(superadmin, '/api/admin/users', { username: `x${randomUUID().slice(0, 8)}`, displayName: 'X', role: 'EMPLOYEE', ...extra });
    expect(res.status).toBe(400);
  });

  it('refuse de retirer l’employé désigné pour l’affectation automatique', async () => {
    const created = await createEmployee('technicien.g', [circuitB]);
    await prisma.category.update({ where: { id: circuitB }, data: { assignmentMode: 'AUTO', autoAssigneeId: created.user.id } });
    try {
      const res = await patch(superadmin, `/api/admin/users/${created.user.id}`, { recipientCategoryIds: [] });
      expect(res.status).toBe(400);
      await expect(prisma.categoryRecipient.count({ where: { userId: created.user.id } })).resolves.toBe(1);
    } finally {
      await prisma.category.update({ where: { id: circuitB }, data: { assignmentMode: 'MANUAL', autoAssigneeId: null } });
    }
  });
});
