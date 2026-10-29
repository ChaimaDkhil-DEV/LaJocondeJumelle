import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { join } from 'node:path';
import request from 'supertest';
import { loginAs, seedDemo } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * 011 (T025) : transcription réelle par un serveur Whisper LOCAL, seulement si ASSIST_WHISPER_TEST_URL
 * le désigne (par exemple http://127.0.0.1:8000, service « whisper » de docker-compose.dev.yml).
 * Sans cette variable, la suite est ignorée : les tests ordinaires ne dépendent d'aucun service.
 * Fixture : phrase de synthèse vocale française (voix Windows), fictive, sans donnée personnelle.
 */
const LIVE_URL = process.env.ASSIST_WHISPER_TEST_URL;
const LIVE_ENV: Record<string, string | undefined> = {
  ASSIST_SUGGESTION_PROVIDER: 'rules',
  ASSIST_TRANSCRIPTION_PROVIDER: 'whisper',
  ASSIST_WHISPER_URL: LIVE_URL,
  ASSIST_WHISPER_MODEL: process.env.ASSIST_WHISPER_TEST_MODEL,
  ASSIST_WHISPER_CA_FILE: process.env.ASSIST_WHISPER_TEST_CA_FILE,
  ASSIST_TRANSCRIPTION_TIMEOUT_MS: process.env.ASSIST_WHISPER_TEST_TIMEOUT_MS ?? '120000',
  ASSIST_RATE_LIMIT: '1000',
};

(LIVE_URL ? describe : describe.skip)('Whisper réel (opt-in, ASSIST_WHISPER_TEST_URL)', () => {
  const prisma = new PrismaClient();
  const saved: Record<string, string | undefined> = {};
  let app: INestApplication;
  let enseignante: string;

  beforeAll(async () => {
    for (const [key, value] of Object.entries(LIVE_ENV)) {
      saved[key] = process.env[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    enseignante = await loginAs(app, 'enseignante');
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('transcrit une phrase française par le connecteur réel, sans rien conserver', async () => {
    const files = await prisma.file.count();
    const started = Date.now();
    const res = await request(app.getHttpServer())
      .post('/api/assist/transcriptions')
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .attach('file', join(__dirname, '..', 'fixtures', 'audio', 'parole-fr.m4a'));
    const elapsed = Date.now() - started;

    expect(res.status).toBe(200);
    const text = String(res.body.text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    expect(text).toContain('photocopieuse');
    expect(text).toMatch(/panne/);
    expect(await prisma.file.count()).toBe(files);
    // Durée affichée pour la vérification (docs/validation/verification-011.md), pas une assertion.
    console.info(`Transcription réelle : ${elapsed} ms — « ${res.body.text} »`);
  }, 300_000);
});
