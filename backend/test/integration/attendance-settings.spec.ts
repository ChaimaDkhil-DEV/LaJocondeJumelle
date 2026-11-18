import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { loginAs, seedDemo } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * 020, T008 (FR-018, research R7) : seuil de retard (5 min) et délai de tolérance (10 min) des séances, réglés
 * par le super administrateur entre 0 et 60 minutes ; le seuil ne dépasse jamais la tolérance.
 */
describe('Seuil de retard et délai de tolérance (020)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookie: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const put = (who: string, body: unknown) =>
    api().put('/api/admin/settings').set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).send(body as object);
  const DEFAULTS = { attendanceLateThresholdMinutes: 5, attendanceToleranceMinutes: 10 };

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    for (const who of ['superadmin', 'admin']) cookie[who] = await loginAs(app, who);
  });

  beforeEach(async () => {
    await put('superadmin', DEFAULTS);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('valeurs par défaut : 5 et 10 minutes', async () => {
    const res = await api().get('/api/admin/settings').set('Cookie', cookie.superadmin);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(DEFAULTS);
  });

  it('accepte 0 et 60, et un seuil égal à la tolérance', async () => {
    expect((await put('superadmin', { attendanceToleranceMinutes: 60 })).status).toBe(200);
    expect((await put('superadmin', { attendanceLateThresholdMinutes: 60 })).status).toBe(200);
    expect((await put('superadmin', { attendanceLateThresholdMinutes: 0, attendanceToleranceMinutes: 0 })).status).toBe(200);
  });

  it.each([
    ['-1', { attendanceToleranceMinutes: -1 }],
    ['61', { attendanceToleranceMinutes: 61 }],
    ['un nombre décimal', { attendanceLateThresholdMinutes: 2.5 }],
    ['du texte', { attendanceLateThresholdMinutes: '5' }],
  ])('refuse %s (400)', async (_label, body) => {
    expect((await put('superadmin', body)).status).toBe(400);
  });

  it('refuse un seuil de retard au-delà de la tolérance enregistrée', async () => {
    const res = await put('superadmin', { attendanceLateThresholdMinutes: 11 });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields).toEqual([
      { field: 'attendanceLateThresholdMinutes', messages: ['Le seuil de retard ne peut pas dépasser le délai de tolérance.'] },
    ]);
  });

  it('refuse une tolérance en deçà du seuil de retard enregistré', async () => {
    const res = await put('superadmin', { attendanceToleranceMinutes: 4 });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields).toEqual([
      { field: 'attendanceToleranceMinutes', messages: ['Le délai de tolérance ne peut pas être inférieur au seuil de retard.'] },
    ]);
    const current = await api().get('/api/admin/settings').set('Cookie', cookie.superadmin);
    expect(current.body).toMatchObject(DEFAULTS);
  });

  it('les deux changés ensemble sont comparés entre eux', async () => {
    expect((await put('superadmin', { attendanceLateThresholdMinutes: 15, attendanceToleranceMinutes: 20 })).status).toBe(200);
    expect((await put('superadmin', { attendanceLateThresholdMinutes: 30, attendanceToleranceMinutes: 20 })).status).toBe(400);
  });

  it('un administrateur (ADMIN) ne peut pas les régler (403)', async () => {
    expect((await put('admin', { attendanceToleranceMinutes: 15 })).status).toBe(403);
  });
});
