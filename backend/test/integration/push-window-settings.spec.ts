import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { loginAs, seedDemo } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * 014, T052 (US4, FR-010, NC-10, contracts/http-api.md) : plage d'envoi des notifications push, réglée
 * par le super administrateur seul parmi les réglages de l'établissement ; chaque modification auditée ;
 * fin strictement après le début ; lisible par tout utilisateur connecté pour la mention de « Mon profil ».
 */
describe('Plage d’envoi des notifications push (US4)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookie: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const put = (who: string, body: unknown) =>
    api().put('/api/admin/settings').set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).send(body as object);

  const DEFAULT_WINDOW = { pushWindowDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'], pushWindowStart: '07:30', pushWindowEnd: '18:30' };

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    for (const who of ['superadmin', 'admin', 'enseignante']) cookie[who] = await loginAs(app, who);
  });

  beforeEach(async () => {
    await put('superadmin', DEFAULT_WINDOW);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('valeurs par défaut : lundi à vendredi, 07:30 à 18:30', async () => {
    const res = await api().get('/api/admin/settings').set('Cookie', cookie.superadmin);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(DEFAULT_WINDOW);
  });

  it('modification par le super administrateur : une entrée d’audit par réglage changé, avant et après', async () => {
    const before = await prisma.auditLog.count({ where: { action: 'SETTING_CHANGED' } });
    const res = await put('superadmin', { pushWindowDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], pushWindowStart: '06:45' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pushWindowDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], pushWindowStart: '06:45', pushWindowEnd: '18:30' });

    expect(await prisma.auditLog.count({ where: { action: 'SETTING_CHANGED' } })).toBe(before + 2);
    const start = await prisma.auditLog.findFirstOrThrow({ where: { action: 'SETTING_CHANGED', targetId: 'pushWindowStart' }, orderBy: { createdAt: 'desc' } });
    expect(start.details).toMatchObject({ before: { value: '07:30' }, after: { value: '06:45' } });
  });

  it.each([
    ['fin avant le début', { pushWindowStart: '18:00', pushWindowEnd: '07:00' }],
    ['fin égale au début', { pushWindowStart: '08:00', pushWindowEnd: '08:00' }],
    ['fin avant le début enregistré', { pushWindowEnd: '07:00' }],
  ])('refuse %s : 400 sur pushWindowEnd, avec le message prévu', async (_label, body) => {
    const res = await put('superadmin', body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fields).toEqual([{ field: 'pushWindowEnd', messages: ['L’heure de fin doit être après l’heure de début.'] }]);
    const current = await api().get('/api/admin/settings').set('Cookie', cookie.superadmin);
    expect(current.body).toMatchObject(DEFAULT_WINDOW);
  });

  it.each([
    ['aucun jour', { pushWindowDays: [] }],
    ['jour inconnu', { pushWindowDays: ['MON', 'LUNDI'] }],
    ['jour en double', { pushWindowDays: ['MON', 'MON'] }],
    ['numéro de jour', { pushWindowDays: [1, 2] }],
    ['heure mal formée', { pushWindowStart: '7h30' }],
  ])('refuse %s (400)', async (_label, body) => {
    expect((await put('superadmin', body)).status).toBe(400);
  });

  it('un administrateur (ADMIN) ne peut pas régler la plage (403)', async () => {
    const res = await put('admin', { pushWindowStart: '06:00' });
    expect(res.status).toBe(403);
    const current = await api().get('/api/admin/settings').set('Cookie', cookie.superadmin);
    expect(current.body.pushWindowStart).toBe('07:30');
  });

  it('GET /api/settings/client donne la plage à tout utilisateur connecté', async () => {
    const res = await api().get('/api/settings/client').set('Cookie', cookie.enseignante);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(DEFAULT_WINDOW);
  });
});
