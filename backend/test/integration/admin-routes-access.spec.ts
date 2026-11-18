import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { ADMIN_ALLOWED } from '../utils/admin-route-access';
import { loginAs, seedDemo } from '../utils/auth-helpers';
import { allRoutes, type Verb } from '../utils/routes';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** Routes de tous les contrôleurs dont le préfixe est « admin » (relevées sur les métadonnées Nest, test/utils/routes.ts). */
function adminRoutes(app: INestApplication): Array<{ verb: Verb; path: string }> {
  return allRoutes(app)
    .filter((r) => r.prefix === 'admin')
    .map(({ verb, path }) => ({ verb, path }));
}

const key = ({ verb, path }: { verb: Verb; path: string }) => `${verb.toUpperCase()} ${path}`;

/**
 * Les routes /admin/* sont réservées au super administrateur, sauf ADMIN_ALLOWED, ouvertes aussi à l'admin (011) ;
 * un employé est refusé partout, sans exception.
 */
describe('Accès aux routes /admin/*', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let routes: ReturnType<typeof adminRoutes>;
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    routes = adminRoutes(app);
    for (const username of ['admin', 'enseignante', 'superadmin']) cookies[username] = await loginAs(app, username);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('relève un nombre plausible de routes (le test ne doit pas devenir vide sans prévenir)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(30);
  });

  it('chaque route ouverte à l’admin existe (la liste ne peut pas vieillir sans prévenir)', () => {
    const existing = new Set(routes.map(key));
    expect(ADMIN_ALLOWED.filter((r) => !existing.has(r))).toEqual([]);
  });

  it('refuse toutes les routes /admin/* à « enseignante » (403)', async () => {
    const failures: string[] = [];
    for (const { verb, path } of routes) {
      const res = await request(app.getHttpServer())[verb](path).set('Cookie', cookies.enseignante).set('Origin', TEST_ORIGIN).send({});
      if (res.status !== 403) failures.push(`${verb.toUpperCase()} ${path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('refuse à « admin » toutes les routes /admin/* qui ne lui sont pas ouvertes (403)', async () => {
    const failures: string[] = [];
    for (const route of routes.filter((r) => !ADMIN_ALLOWED.includes(key(r)))) {
      const res = await request(app.getHttpServer())[route.verb](route.path).set('Cookie', cookies.admin).set('Origin', TEST_ORIGIN).send({});
      if (res.status !== 403) failures.push(`${key(route)} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('laisse passer « admin » sur les routes qui lui sont ouvertes (jamais 401 ni 403)', async () => {
    const failures: string[] = [];
    // Toutes les routes ouvertes sont rejouées : les écritures reçoivent un corps vide (400) ou un identifiant
    // inconnu (404), sans effet de bord.
    for (const route of routes.filter((r) => ADMIN_ALLOWED.includes(key(r)))) {
      const res = await request(app.getHttpServer())[route.verb](route.path).set('Cookie', cookies.admin).set('Origin', TEST_ORIGIN).send({});
      if (res.status === 401 || res.status === 403) failures.push(`${key(route)} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('refuse toutes les routes /admin/* sans session (401)', async () => {
    const failures: string[] = [];
    for (const { verb, path } of routes) {
      const res = await request(app.getHttpServer())[verb](path).set('Origin', TEST_ORIGIN).send({});
      if (res.status !== 401) failures.push(`${verb.toUpperCase()} ${path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('le super administrateur passe la garde (jamais 401 ni 403)', async () => {
    const failures: string[] = [];
    // Seules les lectures (GET) sont rejouées : pas d'effet de bord.
    for (const { verb, path } of routes.filter((r) => r.verb === 'get')) {
      const res = await request(app.getHttpServer())[verb](path).set('Cookie', cookies.superadmin);
      if (res.status === 401 || res.status === 403) failures.push(`GET ${path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });
});
