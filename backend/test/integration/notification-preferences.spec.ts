import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { loadConfig } from '../../src/config/config';
import { APP_CONFIG } from '../../src/config/config.module';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * 014, T043 (US3, FR-009, FR-018, NC-6, NC-9, contracts/http-api.md) : préférences de notification sur le
 * compte. Valeurs par défaut sans ligne, modification partielle champ par champ, son des urgences avec son
 * indicateur « jamais réglé », validation stricte. Fonctionne même si le push est désactivé.
 */
describe('Préférences de notification (US3)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let surveillant: string;
  const cookie: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const get = (who: string) => api().get('/api/notifications/preferences').set('Cookie', cookie[who]);
  const patch = (who: string, body: unknown) =>
    api().patch('/api/notifications/preferences').set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).send(body as object);

  const DEFAULTS = {
    categories: { urgent: true, coverage: true, unfilled: true, attendance: true },
    urgentSound: true,
    urgentSoundSet: false,
  };

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    // Push désactivé : les préférences (dont le son des urgences) restent utilisables.
    app = await createTestApp([], [{ provide: APP_CONFIG, useValue: { ...loadConfig(), push: null } }]);
    cookie.surveillant = await loginAs(app, 'surveillant');
    cookie.second = await loginAs(app, 'surveillant');
    cookie.enseignante = await loginAs(app, 'enseignante');
    surveillant = await userId(prisma, 'surveillant');
  });

  beforeEach(() => prisma.notificationPreference.deleteMany());

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('sans réglage : toutes les catégories actives, son actif, jamais réglé', async () => {
    const res = await get('surveillant');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(DEFAULTS);
    expect(await prisma.notificationPreference.count()).toBe(0);
  });

  it('PATCH d’une catégorie : réponse complète, les autres champs inchangés', async () => {
    const res = await patch('surveillant', { categories: { coverage: false } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...DEFAULTS, categories: { ...DEFAULTS.categories, coverage: false } });
    expect((await get('surveillant')).body).toEqual(res.body);
    expect((await get('enseignante')).body).toEqual(DEFAULTS);
  });

  it('deux appareils du même compte modifient des champs différents : les deux valeurs restent (NC-9)', async () => {
    await patch('surveillant', { categories: { coverage: false } });
    await patch('second', { categories: { attendance: false } });
    expect((await get('surveillant')).body.categories).toEqual({ urgent: true, coverage: false, unfilled: true, attendance: false });

    // Même champ : la dernière valeur enregistrée l'emporte.
    await patch('second', { categories: { coverage: true } });
    expect((await get('surveillant')).body.categories.coverage).toBe(true);
  });

  it('son des urgences : réglé sur le compte, indicateur « réglé » (NC-6)', async () => {
    const res = await patch('surveillant', { urgentSound: false });
    expect(res.body).toMatchObject({ urgentSound: false, urgentSoundSet: true });
    const row = await prisma.notificationPreference.findUniqueOrThrow({ where: { userId: surveillant } });
    expect(row.urgentSound).toBe(false);

    // Une catégorie modifiée seule ne règle pas le son.
    await prisma.notificationPreference.deleteMany();
    expect((await patch('surveillant', { categories: { urgent: false } })).body).toMatchObject({ urgentSound: true, urgentSoundSet: false });
  });

  it.each([
    ['corps vide', {}],
    ['catégories vides', { categories: {} }],
    ['champ inconnu', { push: true }],
    ['catégorie inconnue', { categories: { messages: false } }],
    ['valeur non booléenne', { categories: { coverage: 'non' } }],
    ['son non booléen', { urgentSound: 0 }],
    ['identifiant d’un autre utilisateur', { userId: 'x', categories: { coverage: false } }],
  ])('refuse %s (400), rien n’est enregistré', async (_label, body) => {
    const res = await patch('surveillant', body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.notificationPreference.count()).toBe(0);
  });

  it('sans session : 401', async () => {
    expect((await api().get('/api/notifications/preferences')).status).toBe(401);
    expect((await api().patch('/api/notifications/preferences').set('Origin', TEST_ORIGIN).send({ urgentSound: false })).status).toBe(401);
  });
});
