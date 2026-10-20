import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { seedVolume } from '../../prisma/seed-volume';
import { loginAs, seedDemo } from '../utils/auth-helpers';
import { createTestApp } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** T091 — SC-009 : une recherche filtrée répond en moins de 2 s sur 10 000 demandes. */
describe('Performance de la recherche', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let responsable: string;

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    await seedVolume(prisma, 10_000);
    app = await createTestApp();
    responsable = await loginAs(app, 'admin');
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('dispose bien de 10 000 demandes', async () => {
    await expect(prisma.request.count()).resolves.toBeGreaterThanOrEqual(10_000);
  });

  it.each([
    ['filtres combinés statut + priorité + période', '/api/requests?scope=all&status=IN_PROGRESS&status=SENT&priority=URGENT&from=2025-06-01&to=2026-06-30'],
    ['recherche dans le titre', '/api/requests?scope=all&q=affiches'],
    ['demandes en retard', '/api/requests?scope=all&overdue=true'],
    ['page suivante', '/api/requests?scope=all&limit=25'],
  ])('%s : réponse en moins de 2 s', async (_label, url) => {
    // Premier appel : préchauffage (plans de requête, connexions).
    await request(app.getHttpServer()).get(url).set('Cookie', responsable);
    const started = performance.now();
    const res = await request(app.getHttpServer()).get(url).set('Cookie', responsable);
    const elapsed = performance.now() - started;
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(2000);
  });
});
