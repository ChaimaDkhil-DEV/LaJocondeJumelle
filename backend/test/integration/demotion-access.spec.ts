import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** Un admin rétrogradé en employé perd tout de suite ses droits de responsable de catégorie. */
describe('Rétrogradation d’un responsable de catégorie', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let direction: string;
  let enseignante: string;
  let exAdmin: string;
  let exAdminId: string;
  let requestId: string;
  let version: number;
  let managedCategoryId: string;

  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    direction = await loginAs(app, 'superadmin');
    enseignante = await loginAs(app, 'enseignante');
    exAdmin = await loginAs(app, 'admin');
    exAdminId = await userId(prisma, 'admin');
    managedCategoryId = await categoryId(prisma, CATEGORIES.circuitB);

    const created = await api()
      .post('/api/requests')
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({ clientId: randomUUID(), title: 'À valider', description: 'x', categoryId: managedCategoryId, priority: 'NORMAL' });
    expect(created.status).toBe(201);
    requestId = created.body.id;
    version = created.body.version;

    // Avant la rétrogradation, l'admin accède bien à la demande : le test prouve une perte de droits.
    expect((await api().get(`/api/requests/${requestId}`).set('Cookie', exAdmin)).status).toBe(200);

    const demoted = await api()
      .patch(`/api/admin/users/${exAdminId}`)
      .set('Cookie', direction)
      .set('Origin', TEST_ORIGIN)
      .send({ role: 'EMPLOYEE' });
    expect(demoted.status).toBe(200);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('retire le compte des responsables de ses catégories et le trace', async () => {
    expect(await prisma.categoryManager.count({ where: { userId: exAdminId } })).toBe(0);
    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'USER_UPDATED', targetId: exAdminId }, orderBy: { createdAt: 'desc' } });
    const details = entry.details as { before: { managedCategoryIds: string[] }; after: { managedCategoryIds: string[] } };
    expect(details.before.managedCategoryIds).toContain(managedCategoryId);
    expect(details.after.managedCategoryIds).toEqual([]);
  });

  it('ne lui donne plus accès à la demande, à ses messages ni à sa liste', async () => {
    expect((await api().get(`/api/requests/${requestId}`).set('Cookie', exAdmin)).status).toBe(404);
    expect((await api().get(`/api/requests/${requestId}/messages`).set('Cookie', exAdmin)).status).toBe(404);
    const managed = await api().get('/api/requests?scope=managed').set('Cookie', exAdmin);
    expect(managed.status).toBe(200);
    expect(managed.body.items).toEqual([]);
  });

  it('ne lui permet plus de décider', async () => {
    const res = await api()
      .post(`/api/requests/${requestId}/actions`)
      .set('Cookie', exAdmin)
      .set('Origin', TEST_ORIGIN)
      .send({ action: 'REJECT', reason: 'x', version });
    expect(res.status).toBe(404);
    expect((await prisma.request.findUniqueOrThrow({ where: { id: requestId } })).status).toBe('PENDING_ADMIN_VALIDATION');
  });

  it('une ligne de responsable restée en base ne donne aucun droit à un employé', async () => {
    await prisma.categoryManager.create({ data: { categoryId: managedCategoryId, userId: exAdminId } });
    expect((await api().get(`/api/requests/${requestId}`).set('Cookie', exAdmin)).status).toBe(404);
    const managed = await api().get('/api/requests?scope=managed').set('Cookie', exAdmin);
    expect(managed.body.items).toEqual([]);
    await prisma.categoryManager.deleteMany({ where: { userId: exAdminId } });
  });

  it('un changement de rôle sans rétrogradation ne retire aucune catégorie', async () => {
    const other = await prisma.user.create({
      data: { username: 'second-admin', displayName: 'Second', role: 'ADMIN', passwordHash: 'x' },
    });
    await prisma.categoryManager.create({ data: { categoryId: managedCategoryId, userId: other.id } });
    const res = await api()
      .patch(`/api/admin/users/${other.id}`)
      .set('Cookie', direction)
      .set('Origin', TEST_ORIGIN)
      .send({ jobTitle: 'Surveillante' });
    expect(res.status).toBe(200);
    expect(await prisma.categoryManager.count({ where: { userId: other.id } })).toBe(1);
  });
});
