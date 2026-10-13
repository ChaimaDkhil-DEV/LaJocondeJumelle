import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { verify } from 'argon2';
import request from 'supertest';
import { loginAs, seedDemo, SEED_PASSWORD, userId } from '../utils/auth-helpers';
import { createTestApp, sessionCookie, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** T099 — US8 : gestion des comptes par le super administrateur. */
describe('Administration des comptes', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let superadmin: string;
  let responsable: string;
  let superadminId: string;

  const api = () => request(app.getHttpServer());
  const post = (cookie: string, url: string, body: Record<string, unknown> = {}) =>
    api().post(url).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  const patch = (cookie: string, url: string, body: Record<string, unknown>) =>
    api().patch(url).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    superadmin = await loginAs(app, 'superadmin');
    responsable = await loginAs(app, 'responsable');
    superadminId = await userId(prisma, 'superadmin');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('liste les comptes sans jamais exposer les hachés', async () => {
    const res = await api().get('/api/admin/users').set('Cookie', superadmin);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(5);
    expect(res.body[0]).toEqual({
      id: expect.any(String),
      username: expect.any(String),
      displayName: expect.any(String),
      jobTitle: expect.anything(),
      role: expect.any(String),
      active: expect.any(Boolean),
      mustChangePassword: expect.any(Boolean),
      createdAt: expect.any(String),
      recipientCategories: expect.any(Array),
    });
    expect(JSON.stringify(res.body)).not.toContain('argon2');
  });

  it('crée un compte : mot de passe provisoire renvoyé une seule fois, à changer, audité', async () => {
    const res = await post(superadmin, '/api/admin/users', {
      username: 'Cuisine.Chef',
      displayName: 'Chef de cuisine',
      jobTitle: 'Cantine',
      role: 'EMPLOYEE',
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: 'cuisine.chef', role: 'EMPLOYEE', mustChangePassword: true, active: true });
    expect(res.body.temporaryPassword).toMatch(/^.{16,}$/);

    const stored = await prisma.user.findUniqueOrThrow({ where: { username: 'cuisine.chef' } });
    await expect(verify(stored.passwordHash, res.body.temporaryPassword)).resolves.toBe(true);
    const list = await api().get('/api/admin/users').set('Cookie', superadmin);
    expect(JSON.stringify(list.body)).not.toContain(res.body.temporaryPassword);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'USER_CREATED', targetId: stored.id } });
    expect(audit).toMatchObject({ actorId: superadminId, details: { after: { username: 'cuisine.chef', role: 'EMPLOYEE' } } });
    expect(JSON.stringify(audit.details)).not.toContain(res.body.temporaryPassword);
  });

  it.each([
    ['un identifiant déjà pris (casse ignorée)', { username: 'ENSEIGNANTE', displayName: 'X', role: 'EMPLOYEE' }, 409],
    ['un identifiant trop court', { username: 'ab', displayName: 'X', role: 'EMPLOYEE' }, 400],
    ['un identifiant avec espaces', { username: 'jean dupont', displayName: 'X', role: 'EMPLOYEE' }, 400],
    ['un rôle inconnu', { username: 'valide', displayName: 'X', role: 'DIRECTEUR' }, 400],
    ['un nom vide', { username: 'valide2', displayName: '  ', role: 'EMPLOYEE' }, 400],
  ])('refuse %s', async (_label, body, status) => {
    expect((await post(superadmin, '/api/admin/users', body)).status).toBe(status);
  });

  it('modifie nom, fonction et rôle, avec un audit avant/après', async () => {
    const id = await userId(prisma, 'reprographie');
    const res = await patch(superadmin, `/api/admin/users/${id}`, { role: 'MANAGER', jobTitle: 'Responsable reprographie' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: 'MANAGER', jobTitle: 'Responsable reprographie' });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'USER_UPDATED', targetId: id } });
    expect(audit.details).toMatchObject({ before: { role: 'EMPLOYEE' }, after: { role: 'MANAGER' } });
    await patch(superadmin, `/api/admin/users/${id}`, { role: 'EMPLOYEE', jobTitle: 'Reprographie' }).expect(200);
  });

  it('désactive un compte : ses sessions sont supprimées et il ne peut plus se connecter', async () => {
    const created = await post(superadmin, '/api/admin/users', { username: 'temporaire', displayName: 'Temporaire', role: 'EMPLOYEE' });
    const login = await post('', '/api/auth/login', { username: 'temporaire', password: created.body.temporaryPassword });
    const cookie = sessionCookie(login.headers['set-cookie']);

    const res = await patch(superadmin, `/api/admin/users/${created.body.user.id}`, { active: false });
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    await expect(prisma.session.count({ where: { userId: created.body.user.id } })).resolves.toBe(0);
    expect((await api().get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
    expect((await post('', '/api/auth/login', { username: 'temporaire', password: created.body.temporaryPassword })).status).toBe(401);
    await expect(prisma.auditLog.count({ where: { action: 'USER_DEACTIVATED', targetId: created.body.user.id } })).resolves.toBe(1);
  });

  it('réinitialise un mot de passe : nouveau mot de passe provisoire, sessions fermées, audité', async () => {
    const id = await userId(prisma, 'enseignante');
    const cookie = await loginAs(app, 'enseignante');
    const res = await post(superadmin, `/api/admin/users/${id}/reset-password`);
    expect(res.status).toBe(200);
    expect(res.body.temporaryPassword).toMatch(/^.{16,}$/);
    expect((await api().get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(stored.mustChangePassword).toBe(true);
    await expect(verify(stored.passwordHash, SEED_PASSWORD)).resolves.toBe(false);
    await expect(prisma.auditLog.count({ where: { action: 'PASSWORD_RESET', targetId: id } })).resolves.toBe(1);
  });

  it('empêche le super administrateur de se désactiver ou de perdre son rôle', async () => {
    expect((await patch(superadmin, `/api/admin/users/${superadminId}`, { active: false })).status).toBe(400);
    expect((await patch(superadmin, `/api/admin/users/${superadminId}`, { role: 'MANAGER' })).status).toBe(400);
  });

  it('refuse toute route d’administration à un non super administrateur (403, journalisé)', async () => {
    const responsableId = await userId(prisma, 'responsable');
    for (const [method, url] of [
      ['get', '/api/admin/users'],
      ['post', '/api/admin/users'],
      ['get', '/api/admin/categories'],
      ['get', '/api/admin/settings'],
      ['get', '/api/admin/audit'],
    ] as const) {
      const res = await api()[method](url).set('Cookie', responsable).set('Origin', TEST_ORIGIN).send({});
      expect(res.status).toBe(403);
    }
    await expect(
      prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId: responsableId, details: { path: ['reason'], equals: 'NOT_SUPER_ADMIN' } } }),
    ).resolves.toBe(5);
  });
});
