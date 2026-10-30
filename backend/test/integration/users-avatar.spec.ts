import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Photos de profil : avatar par défaut à la création, envoi et lecture, validations, droits
 * (soi-même ; super administrateur et admin pour les autres), retour à l'avatar par défaut,
 * nettoyage des anciens fichiers, traces d'audit.
 */
const fixture = (name: string) => join(__dirname, '..', 'fixtures', 'images', name);
const avatarDir = () => join(process.env.FILES_DIR!, 'avatars');
const filesOf = (id: string) => (existsSync(avatarDir()) ? readdirSync(avatarDir()).filter((f) => f.startsWith(id)) : []);

describe('Photos de profil (/api/users/:id/avatar)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookie: Record<string, string> = {};
  const id: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const upload = (who: string, target: string, file: string | Buffer, name = 'photo.png') =>
    api()
      .post(`/api/users/${target}/avatar`)
      .set('Cookie', cookie[who])
      .set('Origin', TEST_ORIGIN)
      .attach('file', typeof file === 'string' ? fixture(file) : file, name);
  const reset = (who: string, target: string) => api().delete(`/api/users/${target}/avatar`).set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN);

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    for (const who of ['superadmin', 'admin', 'enseignante', 'reprographie']) {
      cookie[who] = await loginAs(app, who);
      id[who] = await userId(prisma, who);
    }
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('un compte créé a l’avatar par défaut : aucun fichier, absent de la liste des photos', async () => {
    const created = await api()
      .post('/api/admin/users')
      .set('Cookie', cookie.superadmin)
      .set('Origin', TEST_ORIGIN)
      .send({ username: 'nouvelle.recrue', displayName: 'Nouvelle Recrue', role: 'EMPLOYEE' });
    expect(created.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { username: 'nouvelle.recrue' } });
    expect(user).toMatchObject({ avatarType: 'DEFAULT', avatarUrl: null });
    expect((await api().get(`/api/users/${user.id}/avatar`).set('Cookie', cookie.enseignante)).status).toBe(404);
    const list = await api().get('/api/users/avatars').set('Cookie', cookie.enseignante);
    expect(list.body.some((a: { id: string }) => a.id === user.id)).toBe(false);
  });

  it('chacun change sa photo : WebP 256 × 256, adresse versionnée, visible de tous, en-têtes protecteurs', async () => {
    const res = await upload('enseignante', id.enseignante, 'gps.jpg', 'vacances.jpg');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ avatarType: 'CUSTOM', avatarUrl: expect.stringMatching(new RegExp(`^/api/users/${id.enseignante}/avatar\\?v=[0-9a-f]{16}$`)) });

    const image = await api().get(res.body.avatarUrl).set('Cookie', cookie.reprographie).buffer(true);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/webp');
    expect(image.headers['x-content-type-options']).toBe('nosniff');
    expect(image.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    const meta = await sharp(image.body as Buffer).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 256, height: 256 });
    expect(meta.exif).toBeUndefined();

    const list = await api().get('/api/users/avatars').set('Cookie', cookie.reprographie);
    expect(list.body).toContainEqual({ id: id.enseignante, avatarUrl: res.body.avatarUrl });
  });

  it('une nouvelle photo remplace l’ancienne : un seul fichier conservé', async () => {
    const first = await upload('reprographie', id.reprographie, 'photo.png');
    const second = await upload('reprographie', id.reprographie, 'photo.webp', 'photo.webp');
    expect(second.status).toBe(200);
    expect(second.body.avatarUrl).not.toBe(first.body.avatarUrl);
    expect(filesOf(id.reprographie)).toHaveLength(1);
  });

  it('retour à l’avatar par défaut : champ remis à DEFAULT, fichier supprimé, image introuvable', async () => {
    await upload('reprographie', id.reprographie, 'photo.png');
    const res = await reset('reprographie', id.reprographie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ avatarUrl: null, avatarType: 'DEFAULT' });
    expect(filesOf(id.reprographie)).toHaveLength(0);
    expect((await api().get(`/api/users/${id.reprographie}/avatar`).set('Cookie', cookie.enseignante)).status).toBe(404);
  });

  it('refuse les fichiers invalides avec un message clair, sans toucher à la photo', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: id.enseignante } });
    const fake = await upload('enseignante', id.enseignante, 'exe-renamed.jpg', 'photo.jpg');
    expect(fake.status).toBe(415);
    expect(fake.body.error).toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED', message: 'Formats acceptés : JPG, PNG ou WebP.' });
    const heic = await upload('enseignante', id.enseignante, 'photo.heic', 'photo.heic');
    expect(heic.status).toBe(415);
    // Signature JPEG valide, 2,5 Mo : refusée sur la taille.
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2.5 * 1024 * 1024)]);
    const tooBig = await upload('enseignante', id.enseignante, big, 'grande.jpg');
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.error).toMatchObject({ code: 'FILE_TOO_LARGE', message: 'La photo ne doit pas dépasser 2 Mo.' });
    const missing = await api().post(`/api/users/${id.enseignante}/avatar`).set('Cookie', cookie.enseignante).set('Origin', TEST_ORIGIN);
    expect(missing.status).toBe(400);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: id.enseignante } })).toMatchObject({ avatarUrl: before.avatarUrl, avatarType: before.avatarType });
  });

  it('un employé ne change pas la photo d’un autre : 403 journalisé ; admin et super administrateur peuvent, avec trace', async () => {
    const denied = await upload('enseignante', id.reprographie, 'photo.png');
    expect(denied.status).toBe(403);
    expect(denied.body.error.message).toBe('Vous ne pouvez changer que votre propre photo.');
    expect((await reset('enseignante', id.reprographie)).status).toBe(403);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'ACCESS_DENIED', actorId: id.enseignante, targetId: id.reprographie }, orderBy: { createdAt: 'desc' } });
    expect(log.details).toMatchObject({ reason: 'AVATAR_NOT_ALLOWED' });

    expect((await upload('admin', id.reprographie, 'photo.png')).status).toBe(200);
    expect((await reset('superadmin', id.reprographie)).status).toBe(200);
    const traces = await prisma.auditLog.findMany({ where: { action: 'USER_UPDATED', targetId: id.reprographie }, orderBy: { createdAt: 'asc' } });
    expect(traces.map((t) => [t.actorId, (t.details as { action: string }).action])).toEqual([
      [id.admin, 'set'],
      [id.superadmin, 'reset'],
    ]);
  });

  it('identifiant inconnu ou mal formé, visiteur non connecté, origine absente : refusés', async () => {
    expect((await upload('superadmin', '00000000-0000-4000-8000-000000000000', 'photo.png')).status).toBe(404);
    expect((await api().get('/api/users/pas-un-uuid/avatar').set('Cookie', cookie.enseignante)).status).toBe(400);
    expect((await api().get('/api/users/avatars')).status).toBe(401);
    const noOrigin = await api().delete(`/api/users/${id.enseignante}/avatar`).set('Cookie', cookie.enseignante);
    expect(noOrigin.status).toBe(403);
  });
});
