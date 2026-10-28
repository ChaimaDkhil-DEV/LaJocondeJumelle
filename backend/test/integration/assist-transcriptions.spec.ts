import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { TRANSCRIPTION_PROVIDER, type TranscriptionInput } from '../../src/assist/providers/assist-providers';
import { loginAs, seedDemo } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

const fixture = (name: string) => join(__dirname, '..', 'fixtures', 'audio', name);
const UPLOAD_TMP_DIR = join(tmpdir(), 'ljj-uploads');
const listing = (dir: string) => {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
};

/** 009, US4 (T033) : transcription d'un vocal sans rien conserver (ni ligne File, ni fichier). */
describe('POST /api/assist/transcriptions', () => {
  const prisma = new PrismaClient();
  const saved: Record<string, string | undefined> = {};
  let app: INestApplication;
  let enseignante: string;
  let text = 'La photocopieuse du premier étage est en panne.';
  let received: TranscriptionInput | null = null;
  const fake = {
    name: 'test',
    transcribe: async (input: TranscriptionInput) => {
      received = input;
      return text;
    },
  };

  const transcribe = (file: string) =>
    request(app.getHttpServer())
      .post('/api/assist/transcriptions')
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .attach('file', fixture(file));

  beforeAll(async () => {
    for (const [key, value] of Object.entries({ ASSIST_TRANSCRIPTION_PROVIDER: 'demo', ASSIST_RATE_LIMIT: '1000' })) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp([], [{ provide: TRANSCRIPTION_PROVIDER, useValue: fake }]);
    enseignante = await loginAs(app, 'enseignante');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  beforeEach(() => {
    received = null;
    text = 'La photocopieuse du premier étage est en panne.';
  });

  it('renvoie le texte du fournisseur ; aucune ligne File ni aucun fichier ne reste', async () => {
    const files = await prisma.file.count();
    const stored = listing(process.env.FILES_DIR!);
    const temp = listing(UPLOAD_TMP_DIR);

    const res = await transcribe('sample.webm');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: 'La photocopieuse du premier étage est en panne.' });
    // Le fournisseur reçoit le vocal contrôlé et converti, comme pour un envoi.
    expect(received).toMatchObject({ mimeType: 'audio/mp4', durationSeconds: expect.any(Number) });

    expect(await prisma.file.count()).toBe(files);
    expect(listing(process.env.FILES_DIR!)).toEqual(stored);
    expect(listing(UPLOAD_TMP_DIR)).toEqual(temp);
  });

  it('borne le texte renvoyé à 4 000 caractères', async () => {
    text = 'mot '.repeat(2000);
    const res = await transcribe('sample.webm');
    expect(res.status).toBe(200);
    expect(res.body.text.length).toBeLessThanOrEqual(4000);
  });

  it('refuse un vocal trop court, un faux audio et un vocal trop long avec les codes existants, sans appeler le fournisseur', async () => {
    const temp = listing(UPLOAD_TMP_DIR);
    expect((await transcribe('silence-0.5s.webm')).body.error.code).toBe('VOICE_TOO_SHORT');
    const fake = await transcribe('not-audio.webm');
    expect(fake.status).toBe(415);
    expect(fake.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
    expect((await transcribe('too-long.webm')).body.error.code).toBe('VOICE_TOO_LONG');
    expect(received).toBeNull();
    expect(listing(UPLOAD_TMP_DIR)).toEqual(temp);
  });

  it('refuse un vocal au-delà de voiceMaxBytes (413)', async () => {
    // Les réglages sont mis en cache : nouvelle application après la modification.
    await prisma.setting.update({ where: { key: 'voiceMaxBytes' }, data: { value: 1000 } });
    const freshApp = await createTestApp([], [{ provide: TRANSCRIPTION_PROVIDER, useValue: fake }]);
    try {
      const cookie = await loginAs(freshApp, 'enseignante');
      const res = await request(freshApp.getHttpServer())
        .post('/api/assist/transcriptions')
        .set('Cookie', cookie)
        .set('Origin', TEST_ORIGIN)
        .attach('file', fixture('sample.webm'));
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('FILE_TOO_LARGE');
      expect(received).toBeNull();
    } finally {
      await prisma.setting.update({ where: { key: 'voiceMaxBytes' }, data: { value: 5 * 1024 * 1024 } });
      await freshApp.close();
    }
  });

  it('signale une transcription vide (TRANSCRIPTION_EMPTY)', async () => {
    text = '   ';
    const res = await transcribe('sample.webm');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TRANSCRIPTION_EMPTY');
  });

  it('exige un fichier', async () => {
    const res = await request(app.getHttpServer()).post('/api/assist/transcriptions').set('Cookie', enseignante).set('Origin', TEST_ORIGIN);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
