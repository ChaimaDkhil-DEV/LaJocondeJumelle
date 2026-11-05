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

/** Les routes /admin/* sont réservées au super administrateur : refus pour tous les autres rôles, sans exception. */
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

  it.each(['admin', 'enseignante'])('refuse toutes les routes /admin/* à « %s » (403)', async (username) => {
    const failures: string[] = [];
    for (const { verb, path } of routes) {
      const res = await request(app.getHttpServer())[verb](path).set('Cookie', cookies[username]).set('Origin', TEST_ORIGIN).send({});
      if (res.status !== 403) failures.push(`${verb.toUpperCase()} ${path} → ${res.status}`);
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
