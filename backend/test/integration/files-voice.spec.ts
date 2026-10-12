import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { loginAs, seedDemo } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

const fixture = (name: string) => join(__dirname, '..', 'fixtures', 'audio', name);

/** T032 — téléversement des vocaux et téléchargement protégé (research R2, R3). */
describe('Fichiers vocaux', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let enseignante: string;

  function upload(cookie: string, file: string, kind = 'VOICE') {
    return request(app.getHttpServer())
      .post('/api/files')
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .field('kind', kind)
      .attach('file', fixture(file));
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    enseignante = await loginAs(app, 'enseignante');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('accepte un vocal et le convertit en audio/mp4, sans exposer son emplacement', async () => {
    const res = await upload(enseignante, 'sample.webm');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      kind: 'VOICE',
      mimeType: 'audio/mp4',
      sizeBytes: expect.any(Number),
      durationSeconds: expect.any(Number),
    });
    const stored = await prisma.file.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(res.body).not.toHaveProperty('storagePath');
    expect(JSON.stringify(res.body)).not.toContain(stored.storagePath);
    expect(stored.requestId).toBeNull(); // fichier provisoire
    expect(existsSync(join(process.env.FILES_DIR!, stored.storagePath))).toBe(true);
  });

  it.each(['sample.mp4', 'sample.ogg', 'sample.m4a'])('accepte aussi %s', async (file) => {
    expect((await upload(enseignante, file)).status).toBe(201);
  });

  it('refuse un vocal trop court (422), un faux audio (415) et un type inconnu (400)', async () => {
    expect((await upload(enseignante, 'silence-0.5s.webm')).body.error.code).toBe('VOICE_TOO_SHORT');
    const fake = await upload(enseignante, 'not-audio.webm');
    expect(fake.status).toBe(415);
    expect(fake.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
    expect((await upload(enseignante, 'sample.webm', 'VIDEO')).status).toBe(400);
  });

  it('refuse un vocal au-delà de voiceMaxBytes (413 FILE_TOO_LARGE)', async () => {
    await prisma.setting.update({ where: { key: 'voiceMaxBytes' }, data: { value: 1000 } });
    const freshApp = await createTestApp();
    try {
      const cookie = await loginAs(freshApp, 'enseignante');
      const res = await request(freshApp.getHttpServer())
        .post('/api/files')
        .set('Cookie', cookie)
        .set('Origin', TEST_ORIGIN)
        .field('kind', 'VOICE')
        .attach('file', fixture('sample.webm'));
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    } finally {
      await prisma.setting.update({ where: { key: 'voiceMaxBytes' }, data: { value: 5 * 1024 * 1024 } });
      await freshApp.close();
    }
  });

  describe('GET /api/files/:id', () => {
    let fileId: string;

    beforeAll(async () => {
      fileId = (await upload(enseignante, 'sample.webm')).body.id;
    });

    it('sert le fichier à son auteur avec des en-têtes protecteurs', async () => {
      const res = await request(app.getHttpServer()).get(`/api/files/${fileId}`).set('Cookie', enseignante);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('audio/mp4');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers['content-disposition']).toMatch(/^inline/);
    });

    it('accepte les requêtes Range (lecture et déplacement sur Safari)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/files/${fileId}`)
        .set('Cookie', enseignante)
        .set('Range', 'bytes=0-99');
      expect(res.status).toBe(206);
      expect(res.headers['content-length']).toBe('100');
      expect(res.headers['content-range']).toMatch(/^bytes 0-99\//);
    });

    it('exige une session (401)', async () => {
      expect((await request(app.getHttpServer()).get(`/api/files/${fileId}`)).status).toBe(401);
    });

    it('renvoie 404 à un autre utilisateur et journalise le refus', async () => {
      const reprographie = await loginAs(app, 'reprographie');
      const res = await request(app.getHttpServer()).get(`/api/files/${fileId}`).set('Cookie', reprographie);
      expect(res.status).toBe(404);
      const denied = await prisma.auditLog.findFirst({
        where: { action: 'ACCESS_DENIED', targetId: fileId },
      });
      expect(denied).not.toBeNull();
    });

    it('renvoie 404 pour un identifiant inexistant ou invalide', async () => {
      expect(
        (await request(app.getHttpServer()).get('/api/files/00000000-0000-4000-8000-000000000000').set('Cookie', enseignante))
          .status,
      ).toBe(404);
      expect((await request(app.getHttpServer()).get('/api/files/pas-un-uuid').set('Cookie', enseignante)).status).toBe(404);
    });
  });
});
