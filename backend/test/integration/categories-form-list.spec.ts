import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { loginAs, seedDemo } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Une catégorie de demande de travail créée par le super administrateur est proposée aussitôt dans
 * le formulaire « Nouvelle demande » (GET /api/categories) ; une catégorie de garde ne l'est jamais
 * (elle se choisit dans Gardes › Nouvelle garde).
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

  it('liste aussitôt la nouvelle catégorie de travail pour tous les rôles autorisés, jamais une garde', async () => {
    const id = await createCategory({ name: 'Surveillance', circuit: 'B_ADMIN_VALIDATION', creatorRoles: ['EMPLOYEE', 'ADMIN'], closureMode: 'REQUESTER' });
    await createCategory({ name: 'Garde surveillance', kind: 'COVERAGE', circuit: 'A_DIRECT', creatorRoles: ['ADMIN'], closureMode: 'MANAGER' });

    for (const cookie of Object.values(cookies)) {
      const names = await formNames(cookie);
      expect(names).toContain('Surveillance');
      expect(names).not.toContain('Garde surveillance');
    }
    const [created] = (await api().get('/api/categories').set('Cookie', cookies.enseignante)).body.filter((c: { id: string }) => c.id === id);
    expect(created).toEqual({ id, name: 'Surveillance', circuit: 'B_ADMIN_VALIDATION', routingMode: 'VIA_ADMIN', photoRequired: false });
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
