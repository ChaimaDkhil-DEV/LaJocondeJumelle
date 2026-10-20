import type { INestApplication } from '@nestjs/common';
import { PrismaClient, type Role } from '@prisma/client';
import { hash } from 'argon2';
import request from 'supertest';
import { resetDatabase } from '../utils/test-db';
import {
  createTestApp,
  ProtectedProbeController,
  sessionCookie,
  TEST_ORIGIN,
} from '../utils/test-app';

/** T020 — authentification, sessions, mot de passe imposé, Origin, journalisation des refus. */
describe('Authentification et sessions', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const PASSWORD = 'Mot-de-passe-solide-2026';

  async function createUser(
    username: string,
    extra: { role?: Role; mustChangePassword?: boolean; active?: boolean } = {},
  ) {
    return prisma.user.create({
      data: {
        username,
        displayName: username,
        role: extra.role ?? 'EMPLOYEE',
        passwordHash: await hash(PASSWORD),
        mustChangePassword: extra.mustChangePassword ?? false,
        active: extra.active ?? true,
      },
    });
  }

  function login(username: string, password = PASSWORD, ip = '10.0.0.1') {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', ip)
      .send({ username, password });
  }

  async function loginCookie(username: string): Promise<string> {
    const res = await login(username);
    expect(res.status).toBe(200);
    return sessionCookie(res.headers['set-cookie']);
  }

  beforeEach(async () => {
    await resetDatabase(prisma);
    await prisma.rolePermission.createMany({
      data: [
        { role: 'EMPLOYEE', permission: 'REQUEST_CREATE' },
        { role: 'EMPLOYEE', permission: 'PRIORITY_CHANGE_OWN' },
      ],
    });
    app = await createTestApp([ProtectedProbeController]);
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/auth/login', () => {
    it('ouvre une session : cookie sid HttpOnly, Secure, SameSite=Strict, et audit LOGIN_SUCCESS', async () => {
      const user = await createUser('enseignante');
      const res = await login('Enseignante');

      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({
        id: user.id,
        displayName: 'enseignante',
        role: 'EMPLOYEE',
      });
      expect(res.body.user.passwordHash).toBeUndefined();
      const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith('sid='),
      )!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Secure/i);
      expect(cookie).toMatch(/SameSite=Strict/i);

      const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      expect(cookie).not.toContain(session.id); // seul le haché du jeton est stocké
      await expect(
        prisma.auditLog.count({ where: { action: 'LOGIN_SUCCESS', actorId: user.id } }),
      ).resolves.toBe(1);
    });

    it.each([
      ['mauvais mot de passe', 'enseignante', 'faux-mot-de-passe'],
      ['identifiant inconnu', 'inconnu', PASSWORD],
    ])(
      '%s → 401 avec un message générique et audit LOGIN_FAILURE',
      async (_label, username, password) => {
        await createUser('enseignante');
        const res = await login(username, password);
        expect(res.status).toBe(401);
        expect(res.body.error).toEqual({
          code: 'INVALID_CREDENTIALS',
          message: 'Identifiant ou mot de passe incorrect.',
        });
        expect(res.headers['set-cookie']).toBeUndefined();
        await expect(prisma.auditLog.count({ where: { action: 'LOGIN_FAILURE' } })).resolves.toBe(
          1,
        );
      },
    );

    it('refuse un compte désactivé avec le même message générique', async () => {
      await createUser('ancien', { active: false });
      const res = await login('ancien');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('bloque la 6e tentative en une minute (429) et la journalise', async () => {
      await createUser('enseignante');
      for (let i = 0; i < 5; i += 1) {
        expect((await login('enseignante', 'mauvais')).status).toBe(401);
      }
      const res = await login('enseignante', PASSWORD);
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
      await expect(
        prisma.auditLog.count({
          where: { action: 'ACCESS_DENIED', details: { path: ['reason'], equals: 'RATE_LIMITED' } },
        }),
      ).resolves.toBe(1);
      // Une autre adresse IP n'est pas bloquée.
      expect((await login('enseignante', PASSWORD, '10.0.0.2')).status).toBe(200);
    });

    it('refuse une requête modifiante dont l’Origin est étrangère', async () => {
      await createUser('enseignante');
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Origin', 'https://pirate.example')
        .send({ username: 'enseignante', password: PASSWORD });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('refuse une requête modifiante sans Origin', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'enseignante', password: PASSWORD });
      expect(res.status).toBe(403);
    });

    it('valide le corps de la requête (liste blanche)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .send({ username: 'enseignante', password: PASSWORD, role: 'SUPER_ADMIN' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Routes protégées et sessions', () => {
    it('sans cookie → 401 et audit ACCESS_DENIED (UNAUTHENTICATED, route, IP)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/test-probe')
        .set('X-Forwarded-For', '10.0.0.9');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'ACCESS_DENIED' } });
      expect(entry.details).toMatchObject({
        reason: 'UNAUTHENTICATED',
        route: '/api/test-probe',
        method: 'GET',
      });
      expect(entry.ip).toBe('10.0.0.9');
    });

    it('avec un cookie invalide → 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/test-probe')
        .set('Cookie', 'sid=jeton-invente');
      expect(res.status).toBe(401);
    });

    it('accepte une session valide', async () => {
      await createUser('enseignante');
      const cookie = await loginCookie('enseignante');
      const res = await request(app.getHttpServer()).get('/api/test-probe').set('Cookie', cookie);
      expect(res.status).toBe(200);
    });

    it('expire la session après sessionIdleMinutes d’inactivité', async () => {
      const user = await createUser('enseignante');
      const cookie = await loginCookie('enseignante');
      await prisma.session.updateMany({
        where: { userId: user.id },
        data: { lastSeenAt: new Date(Date.now() - 61 * 60_000) },
      });
      const res = await request(app.getHttpServer()).get('/api/test-probe').set('Cookie', cookie);
      expect(res.status).toBe(401);
      await expect(prisma.session.count({ where: { userId: user.id } })).resolves.toBe(0);
    });

    it('respecte un réglage sessionIdleMinutes modifié', async () => {
      const user = await createUser('enseignante');
      await prisma.setting.create({ data: { key: 'sessionIdleMinutes', value: 5 } });
      const cookie = await loginCookie('enseignante');
      await prisma.session.updateMany({
        where: { userId: user.id },
        data: { lastSeenAt: new Date(Date.now() - 6 * 60_000) },
      });
      expect(
        (await request(app.getHttpServer()).get('/api/test-probe').set('Cookie', cookie)).status,
      ).toBe(401);
    });

    it('expire la session après sessionMaxHours, même active', async () => {
      const user = await createUser('enseignante');
      const cookie = await loginCookie('enseignante');
      await prisma.session.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(
        (await request(app.getHttpServer()).get('/api/test-probe').set('Cookie', cookie)).status,
      ).toBe(401);
    });

    it('un compte désactivé perd immédiatement ses sessions', async () => {
      const user = await createUser('enseignante');
      const cookie = await loginCookie('enseignante');
      await prisma.user.update({ where: { id: user.id }, data: { active: false } });
      expect(
        (await request(app.getHttpServer()).get('/api/test-probe').set('Cookie', cookie)).status,
      ).toBe(401);
      await expect(prisma.session.count({ where: { userId: user.id } })).resolves.toBe(0);
    });
  });

  describe('Mot de passe à changer', () => {
    it('bloque les routes hors /auth/* avec 403 PASSWORD_CHANGE_REQUIRED', async () => {
      await createUser('nouveau', { mustChangePassword: true });
      const cookie = await loginCookie('nouveau');

      const blocked = await request(app.getHttpServer())
        .get('/api/test-probe')
        .set('Cookie', cookie);
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

      const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie);
      expect(me.status).toBe(200);
      expect(me.body.mustChangePassword).toBe(true);
    });

    it('refuse un nouveau mot de passe de moins de 12 caractères', async () => {
      await createUser('nouveau', { mustChangePassword: true });
      const cookie = await loginCookie('nouveau');
      const res = await request(app.getHttpServer())
        .post('/api/auth/password')
        .set('Cookie', cookie)
        .set('Origin', TEST_ORIGIN)
        .send({ currentPassword: PASSWORD, newPassword: 'court' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('refuse un mot de passe actuel incorrect', async () => {
      await createUser('nouveau', { mustChangePassword: true });
      const cookie = await loginCookie('nouveau');
      const res = await request(app.getHttpServer())
        .post('/api/auth/password')
        .set('Cookie', cookie)
        .set('Origin', TEST_ORIGIN)
        .send({
          currentPassword: 'mauvais-mot-de-passe',
          newPassword: 'Nouveau-mot-de-passe-2026',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.details.fields[0].field).toBe('currentPassword');
    });

    it('change le mot de passe, lève l’obligation, ferme les autres sessions et audite', async () => {
      const user = await createUser('nouveau', { mustChangePassword: true });
      const cookie = await loginCookie('nouveau');
      const otherCookie = await loginCookie('nouveau');

      const res = await request(app.getHttpServer())
        .post('/api/auth/password')
        .set('Cookie', cookie)
        .set('Origin', TEST_ORIGIN)
        .send({ currentPassword: PASSWORD, newPassword: 'Nouveau-mot-de-passe-2026' });
      expect(res.status).toBe(204);

      expect(
        (await request(app.getHttpServer()).get('/api/test-probe').set('Cookie', cookie)).status,
      ).toBe(200);
      expect(
        (await request(app.getHttpServer()).get('/api/test-probe').set('Cookie', otherCookie))
          .status,
      ).toBe(401);
      const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(updated.mustChangePassword).toBe(false);
      await expect(
        prisma.auditLog.count({ where: { action: 'PASSWORD_CHANGED', actorId: user.id } }),
      ).resolves.toBe(1);
    });
  });

  describe('GET /api/auth/me et POST /api/auth/logout', () => {
    it('renvoie le profil et les permissions de l’utilisateur', async () => {
      const user = await createUser('enseignante');
      const cookie = await loginCookie('enseignante');
      const res = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: user.id,
        displayName: 'enseignante',
        role: 'EMPLOYEE',
        permissions: ['PRIORITY_CHANGE_OWN', 'REQUEST_CREATE'],
        mustChangePassword: false,
        isTeacher: false,
        isSupervisor: false,
      });
      expect(res.headers['x-server-time']).toBeDefined();
    });

    it('ferme la session, efface le cookie et audite LOGOUT', async () => {
      const user = await createUser('enseignante');
      const cookie = await loginCookie('enseignante');
      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .set('Origin', TEST_ORIGIN);
      expect(res.status).toBe(204);
      expect(String(res.headers['set-cookie'])).toMatch(/sid=;/);
      await expect(prisma.session.count({ where: { userId: user.id } })).resolves.toBe(0);
      await expect(
        prisma.auditLog.count({ where: { action: 'LOGOUT', actorId: user.id } }),
      ).resolves.toBe(1);
      expect(
        (await request(app.getHttpServer()).get('/api/test-probe').set('Cookie', cookie)).status,
      ).toBe(401);
    });
  });
});
