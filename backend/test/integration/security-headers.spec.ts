import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { loginAs, seedDemo } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

describe('En-têtes de sécurité et limite d’envoi', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('pose les en-têtes de helmet sur les réponses de l’API', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/me');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('limite les envois de fichiers par utilisateur (429 au-delà de 30 par minute)', async () => {
    const cookie = await loginAs(app, 'enseignante');
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const res = await request(app.getHttpServer()).post('/api/files').set('Cookie', cookie).set('Origin', TEST_ORIGIN);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 30).every((s) => s !== 429)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});
