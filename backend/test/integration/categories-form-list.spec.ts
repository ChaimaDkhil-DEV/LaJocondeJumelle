import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { loginAs, seedDemo } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Une catégorie de demande de travail créée par le super administrateur est proposée aussitôt dans
 * le formulaire « Nouvelle demande » (GET /api/categories). Une catégorie de garde active y est aussi
 * listée, aux seuls utilisateurs qui peuvent créer une affectation (module Gardes), quel que soit
 * REQUEST_CREATE : le formulaire renvoie alors vers Gardes › Nouvelle affectation, sans rien créer.
 */
describe('Catégories proposées dans le formulaire de demande', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let superadmin: string;
  let cookies: Record<'enseignante' | 'admin' | 'superadmin', string>;

  const api = () => request(app.getHttpServer());

  async function formNames(cookie: string): Promise<string[]> {
    const res = await api().get('/api/categories').set('Cookie', cookie);
    expect(res.status).toBe(200);
    return (res.body as Array<{ name: string }>).map((c) => c.name);
  }

  async function createCategory(body: Record<string, unknown>): Promise<string> {
    const res = await api().post('/api/admin/categories').set('Cookie', superadmin).set('Origin', TEST_ORIGIN).send(body);
    expect(res.status).toBe(201);
    return res.body.id;
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    superadmin = await loginAs(app, 'superadmin');
    cookies = { enseignante: await loginAs(app, 'enseignante'), admin: await loginAs(app, 'admin'), superadmin };
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('liste aussitôt la nouvelle catégorie de travail pour tous les rôles autorisés ; une garde, pour l’accès Gardes seulement', async () => {
    const id = await createCategory({ name: 'Surveillance', circuit: 'B_ADMIN_VALIDATION', creatorRoles: ['EMPLOYEE', 'ADMIN'], closureMode: 'REQUESTER' });
    const coverageId = await createCategory({ name: 'Garde surveillance', kind: 'COVERAGE', circuit: 'A_DIRECT', creatorRoles: ['ADMIN'], closureMode: 'MANAGER' });

    for (const cookie of Object.values(cookies)) expect(await formNames(cookie)).toContain('Surveillance');
    for (const cookie of [cookies.admin, cookies.superadmin]) expect(await formNames(cookie)).toContain('Garde surveillance');
    expect(await formNames(cookies.enseignante)).not.toContain('Garde surveillance');

    const [created] = (await api().get('/api/categories').set('Cookie', cookies.enseignante)).body.filter((c: { id: string }) => c.id === id);
    expect(created).toEqual({ id, name: 'Surveillance', circuit: 'B_ADMIN_VALIDATION', routingMode: 'VIA_ADMIN', photoRequired: false, kind: 'WORK' });
    const [coverage] = (await api().get('/api/categories').set('Cookie', cookies.admin)).body.filter((c: { id: string }) => c.id === coverageId);
    expect(coverage).toEqual({ id: coverageId, name: 'Garde surveillance', circuit: 'A_DIRECT', routingMode: 'DIRECT', photoRequired: false, kind: 'COVERAGE' });
  });

  it('une garde inactive n’est jamais listée', async () => {
    const id = await createCategory({ name: 'Garde désactivée', kind: 'COVERAGE', circuit: 'A_DIRECT', creatorRoles: ['ADMIN'], closureMode: 'MANAGER' });
    const patch = await api().patch(`/api/admin/categories/${id}`).set('Cookie', superadmin).set('Origin', TEST_ORIGIN).send({ active: false });
    expect(patch.status).toBe(200);
    for (const cookie of Object.values(cookies)) expect(await formNames(cookie)).not.toContain('Garde désactivée');
  });

  it('visibilité d’une garde : accès Gardes sans REQUEST_CREATE → listée ; REQUEST_CREATE sans accès Gardes → non listée', async () => {
    const removed = await prisma.rolePermission.deleteMany({ where: { role: 'ADMIN', permission: 'REQUEST_CREATE' } });
    expect(removed.count).toBe(1);
    try {
      const names = await formNames(cookies.admin);
      expect(names).toContain('Garde de classe');
      // Sans REQUEST_CREATE, aucune catégorie de travail n'est proposée à l'admin.
      expect(names).not.toContain('Photocopies');
    } finally {
      await prisma.rolePermission.create({ data: { role: 'ADMIN', permission: 'REQUEST_CREATE' } });
    }
    // L'enseignante (employée) a REQUEST_CREATE mais pas l'accès Gardes.
    expect(await prisma.rolePermission.count({ where: { role: 'EMPLOYEE', permission: 'REQUEST_CREATE' } })).toBe(1);
    const names = await formNames(cookies.enseignante);
    expect(names).toContain('Photocopies');
    expect(names).not.toContain('Garde de classe');
  });

  it('les destinataires d’une garde restent refusés (404), même pour un admin', async () => {
    const coverage = await prisma.category.findUniqueOrThrow({ where: { name: 'Garde de classe' } });
    for (const cookie of [cookies.admin, cookies.superadmin, cookies.enseignante]) {
      expect((await api().get(`/api/categories/${coverage.id}/recipients`).set('Cookie', cookie)).status).toBe(404);
    }
  });

  it('respecte les rôles autorisés et l’activation', async () => {
    const id = await createCategory({ name: 'Réservée aux responsables', circuit: 'A_DIRECT', creatorRoles: ['ADMIN'], closureMode: 'REQUESTER' });
    expect(await formNames(cookies.enseignante)).not.toContain('Réservée aux responsables');
    expect(await formNames(cookies.admin)).toContain('Réservée aux responsables');

    const patch = (active: boolean) => api().patch(`/api/admin/categories/${id}`).set('Cookie', superadmin).set('Origin', TEST_ORIGIN).send({ active });
    expect((await patch(false)).status).toBe(200);
    expect(await formNames(cookies.admin)).not.toContain('Réservée aux responsables');
    expect((await patch(true)).status).toBe(200);
    expect(await formNames(cookies.admin)).toContain('Réservée aux responsables');
  });
});
