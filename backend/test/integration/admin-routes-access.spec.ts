import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { loginAs, seedDemo } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

const UUID = '00000000-0000-4000-8000-000000000000';
type Verb = 'get' | 'post' | 'put' | 'patch' | 'delete';
const VERBS: Partial<Record<RequestMethod, Verb>> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.DELETE]: 'delete',
};

const join = (...parts: string[]) => '/' + parts.flatMap((p) => p.split('/')).filter(Boolean).join('/');

/** Routes de tous les contrôleurs dont le préfixe est « admin » (relevées sur les métadonnées Nest). */
function adminRoutes(app: INestApplication): Array<{ verb: Verb; path: string }> {
  const routes: Array<{ verb: Verb; path: string }> = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const type = wrapper.metatype as (new (...args: never[]) => object) | null;
      if (!type) continue;
      const prefix = Reflect.getMetadata(PATH_METADATA, type) as string | string[] | undefined;
      const base = Array.isArray(prefix) ? prefix[0] : prefix;
      if (!base || base.split('/')[0] !== 'admin') continue;
      for (const name of Object.getOwnPropertyNames(type.prototype)) {
        const handler = (type.prototype as Record<string, unknown>)[name];
        if (typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        const verb = method === undefined ? undefined : VERBS[method];
        if (!verb) continue;
        const sub = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        routes.push({ verb, path: join('api', base, sub ?? '').replace(/:[A-Za-z]+/g, UUID) });
      }
    }
  }
  return routes;
}

/**
 * Routes /admin/* ouvertes à l'admin (011, contracts/http-api.md) : données de référence et liste des employés.
 * Toute autre route /admin/*, y compris une route ajoutée plus tard, reste réservée au super administrateur.
 */
const ADMIN_ALLOWED: readonly string[] = [
  'GET /api/admin/floors',
  'POST /api/admin/floors',
  `PATCH /api/admin/floors/${UUID}`,
  'GET /api/admin/levels',
  'POST /api/admin/levels',
  `PATCH /api/admin/levels/${UUID}`,
  'GET /api/admin/students',
  'POST /api/admin/students',
  `PATCH /api/admin/students/${UUID}`,
  'POST /api/admin/students/import',
  'GET /api/admin/coverage/classes',
  'POST /api/admin/coverage/classes',
  `PATCH /api/admin/coverage/classes/${UUID}`,
  `GET /api/admin/coverage/classes/${UUID}/qr`,
  `POST /api/admin/coverage/classes/${UUID}/qr/revoke`,
  'GET /api/admin/employees',
  // Communication avec les parents (015) : représentants et classes des enseignants.
  'GET /api/admin/guardians',
  'POST /api/admin/guardians',
  `PATCH /api/admin/guardians/${UUID}`,
  `POST /api/admin/guardians/${UUID}/account`,
  'GET /api/admin/teacher-classes',
  `PUT /api/admin/teacher-classes/${UUID}`,
  // Validation des communications aux parents : permission PARENT_COMMUNICATION_VALIDATE, accordée par
  // défaut au rôle ADMIN (la surveillante générale) et retirable dans les réglages.
  'GET /api/admin/parent-communications',
  'GET /api/admin/parent-communications/discussions',
  `GET /api/admin/parent-communications/${UUID}/discussion`,
  `GET /api/admin/parent-communications/${UUID}`,
  `POST /api/admin/parent-communications/${UUID}/decision`,
];
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
