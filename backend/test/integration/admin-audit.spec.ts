import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** T101 — US8 : consultation du journal d'audit (FR-030), lecture seule. */
describe('Journal d’audit', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let superadmin: string;
  let responsableId: string;

  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    superadmin = await loginAs(app, 'superadmin');
    await loginAs(app, 'responsable');
    await api().post('/api/auth/login').set('Origin', TEST_ORIGIN).send({ username: 'responsable', password: 'mauvais' });
    responsableId = await userId(prisma, 'responsable');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('liste les entrées, les plus récentes d’abord, avec l’auteur', async () => {
    const res = await api().get('/api/admin/audit').set('Cookie', superadmin);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(3);
    // Certaines entrées n'ont ni cible ni détails (null) : on vérifie la forme exacte.
    expect(Object.keys(res.body.items[0]).sort()).toEqual(['action', 'actor', 'createdAt', 'details', 'id', 'ip', 'targetId', 'targetType']);
    const failure = res.body.items.find((i: { action: string }) => i.action === 'LOGIN_FAILURE');
    expect(failure.actor).toEqual({ id: responsableId, displayName: 'Responsable administratif' });
    const dates = res.body.items.map((i: { createdAt: string }) => Date.parse(i.createdAt));
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
  });

  it('filtre par auteur, action et période', async () => {
    const byActor = await api().get(`/api/admin/audit?actorId=${responsableId}`).set('Cookie', superadmin);
    expect(byActor.body.items.every((i: { actor: { id: string } }) => i.actor?.id === responsableId)).toBe(true);
    const failures = await api().get('/api/admin/audit?action=LOGIN_FAILURE').set('Cookie', superadmin);
    expect(failures.body.items).toHaveLength(1);
    expect(failures.body.items[0].details).toMatchObject({ username: 'responsable', reason: 'BAD_PASSWORD' });
    const future = await api().get('/api/admin/audit?from=2099-01-01').set('Cookie', superadmin);
    expect(future.body.items).toEqual([]);
    expect((await api().get('/api/admin/audit?action=INVENTE').set('Cookie', superadmin)).status).toBe(400);
  });

  it('ne contient aucune donnée sensible', async () => {
    const res = await api().get('/api/admin/audit?limit=100').set('Cookie', superadmin);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/password"|passwordHash|argon2|sid=/);
  });

  it('n’offre aucune route d’écriture', async () => {
    const entry = await prisma.auditLog.findFirstOrThrow();
    for (const method of ['post', 'patch', 'put', 'delete'] as const) {
      const res = await api()[method](`/api/admin/audit/${entry.id}`).set('Cookie', superadmin).set('Origin', TEST_ORIGIN).send({});
      expect(res.status).toBe(404);
    }
  });
});
