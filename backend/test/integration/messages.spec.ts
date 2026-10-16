import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

const fixtures = join(__dirname, '..', 'fixtures');

/** T059 — US3 : fil de discussion, pièces jointes et confidentialité (V10, V11). */
describe('Fil de discussion', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let enseignante: string;
  let reprographie: string;
  let tiers: string;
  let requestId: string;
  let reprographieId: string;
  let enseignanteId: string;
  let workDir: string;

  const api = () => request(app.getHttpServer());

  function post(cookie: string, id: string, body: Record<string, unknown>) {
    return api()
      .post(`/api/requests/${id}/messages`)
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .send({ clientId: randomUUID(), ...body });
  }

  function upload(cookie: string, kind: string, path: string, filename?: string) {
    return api()
      .post('/api/files')
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .field('kind', kind)
      .attach('file', path, filename ? { filename } : undefined);
  }

  async function createRequest(): Promise<{ id: string; version: number }> {
    const res = await api()
      .post('/api/requests')
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({
        clientId: randomUUID(),
        title: 'Photocopies avec consignes',
        description: 'Voir le fil',
        categoryId: await categoryId(prisma, CATEGORIES.photocopies),
        recipientId: reprographieId,
        priority: 'NORMAL',
      });
    expect(res.status).toBe(201);
    return res.body;
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    await prisma.user.create({
      data: {
        username: 'tiers',
        displayName: 'Tiers',
        role: 'EMPLOYEE',
        passwordHash: (await prisma.user.findUniqueOrThrow({ where: { username: 'enseignante' } })).passwordHash,
        mustChangePassword: false,
      },
    });
    app = await createTestApp();
    enseignante = await loginAs(app, 'enseignante');
    reprographie = await loginAs(app, 'reprographie');
    tiers = await loginAs(app, 'tiers');
    reprographieId = await userId(prisma, 'reprographie');
    enseignanteId = await userId(prisma, 'enseignante');
    requestId = (await createRequest()).id;
    workDir = mkdtempSync(join(tmpdir(), 'ljj-msg-'));
  });

  afterAll(async () => {
    rmSync(workDir, { recursive: true, force: true });
    await app.close();
    await prisma.$disconnect();
  });

  it('publie un message texte avec son auteur et sa date, notifie l’autre participant uniquement', async () => {
    const res = await post(enseignante, requestId, { text: '  Merci de faire 30 exemplaires.  ' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      kind: 'TEXT',
      author: { id: enseignanteId, displayName: 'Enseignante' },
      text: 'Merci de faire 30 exemplaires.',
      voice: null,
      attachments: [],
      createdAt: expect.any(String),
    });
    const notifications = await prisma.notification.findMany({ where: { requestId, type: 'MESSAGE_NEW' } });
    expect(notifications.map((n) => n.userId)).toEqual([reprographieId]);
    const event = await prisma.requestEvent.findFirstOrThrow({ where: { requestId, type: 'MESSAGE_ADDED' } });
    expect(event.toValue).toMatchObject({ messageId: res.body.id, kind: 'TEXT' });
  });

  it('publie un message vocal', async () => {
    const voice = await upload(reprographie, 'VOICE', join(fixtures, 'audio', 'sample.webm'));
    const res = await post(reprographie, requestId, { voiceFileId: voice.body.id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      kind: 'VOICE',
      author: { displayName: 'Reprographie' },
      voice: { fileId: voice.body.id, durationSeconds: expect.any(Number) },
    });
    await expect(prisma.file.findUniqueOrThrow({ where: { id: voice.body.id } })).resolves.toMatchObject({ requestId });
    // Le vocal est désormais lisible par la demandeuse.
    expect((await api().get(`/api/files/${voice.body.id}`).set('Cookie', enseignante)).status).toBe(200);
  });

  it('joint une photo et un PDF, visibles des participants, avec FILE_ADDED dans l’historique', async () => {
    const photo = await upload(enseignante, 'PHOTO', join(fixtures, 'images', 'photo.png'), 'modele.png');
    const pdf = await upload(enseignante, 'DOCUMENT', join(fixtures, 'docs', 'sample.pdf'), 'consignes du brevet.pdf');
    expect(pdf.status).toBe(201);
    expect(pdf.body).toMatchObject({ kind: 'DOCUMENT', mimeType: 'application/pdf' });

    const res = await post(enseignante, requestId, {
      text: 'Le modèle et les consignes',
      attachmentFileIds: [photo.body.id, pdf.body.id],
    });
    expect(res.status).toBe(201);
    expect(res.body.attachments).toEqual([
      { fileId: photo.body.id, kind: 'PHOTO', mimeType: 'image/jpeg', originalName: 'modele.jpg', sizeBytes: expect.any(Number) },
      {
        fileId: pdf.body.id,
        kind: 'DOCUMENT',
        mimeType: 'application/pdf',
        originalName: 'consignes du brevet.pdf',
        sizeBytes: expect.any(Number),
      },
    ]);
    await expect(prisma.requestEvent.count({ where: { requestId, type: 'FILE_ADDED' } })).resolves.toBe(3); // vocal + 2

    const download = await api().get(`/api/files/${pdf.body.id}`).set('Cookie', reprographie);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toBe('application/pdf');
    expect(download.headers['content-disposition']).toMatch(/^attachment/);
  });

  it('liste les messages du plus récent au plus ancien, paginés, avec auteur et date', async () => {
    const page1 = await api().get(`/api/requests/${requestId}/messages?limit=2`).set('Cookie', reprographie);
    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.items[0].text).toBe('Le modèle et les consignes');
    expect(page1.body.nextCursor).toEqual(expect.any(String));
    const page2 = await api()
      .get(`/api/requests/${requestId}/messages?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`)
      .set('Cookie', reprographie);
    expect(page2.body.items.map((m: { text: string }) => m.text)).toEqual(['Merci de faire 30 exemplaires.']);
    expect(page2.body.nextCursor).toBeNull();
  });

  it('rend l’envoi idempotent par clientId', async () => {
    const clientId = randomUUID();
    const first = await post(enseignante, requestId, { clientId, text: 'Relance' });
    const second = await post(enseignante, requestId, { clientId, text: 'Relance' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
  });

  it.each([
    ['un message vide', { text: '   ' }, 422, 'CONTENT_REQUIRED'],
    ['un texte de plus de 4 000 caractères', { text: 'x'.repeat(4001) }, 400, 'VALIDATION_ERROR'],
    ['plus de 5 pièces jointes', { attachmentFileIds: Array.from({ length: 6 }, () => randomUUID()) }, 400, 'VALIDATION_ERROR'],
  ])('refuse %s', async (_label, body, status, code) => {
    const res = await post(enseignante, requestId, body);
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
  });

  it('refuse la pièce jointe d’un autre utilisateur', async () => {
    const foreign = await upload(reprographie, 'PHOTO', join(fixtures, 'images', 'photo.png'));
    const res = await post(enseignante, requestId, { text: 'x', attachmentFileIds: [foreign.body.id] });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields[0].field).toBe('attachmentFileIds');
  });

  describe('Fichiers refusés (V11)', () => {
    it('refuse un exécutable renommé en .pdf (415)', async () => {
      const res = await upload(enseignante, 'DOCUMENT', join(fixtures, 'images', 'exe-renamed.jpg'), 'programme.pdf');
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
    });

    it('refuse un PDF de 20 Mo (413)', async () => {
      const big = join(workDir, 'gros.pdf');
      writeFileSync(big, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(20 * 1024 * 1024)]));
      const res = await upload(enseignante, 'DOCUMENT', big);
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    });
  });

  describe('Confidentialité (V10)', () => {
    it('un non-participant ne voit ni le fil ni les fichiers (404) et chaque refus est journalisé', async () => {
      const tiersId = await userId(prisma, 'tiers');
      const list = await api().get(`/api/requests/${requestId}/messages`).set('Cookie', tiers);
      expect(list.status).toBe(404);

      const attachment = await prisma.file.findFirstOrThrow({ where: { requestId, kind: 'DOCUMENT' } });
      expect((await api().get(`/api/files/${attachment.id}`).set('Cookie', tiers)).status).toBe(404);
      expect((await post(tiers, requestId, { text: 'Intrusion' })).status).toBe(404);

      await expect(prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId: tiersId } })).resolves.toBe(3);
    });

    it('les messages ne peuvent être ni modifiés ni supprimés', async () => {
      const message = await prisma.message.findFirstOrThrow({ where: { requestId } });
      const path = `/api/requests/${requestId}/messages/${message.id}`;
      expect((await api().patch(path).set('Cookie', enseignante).set('Origin', TEST_ORIGIN).send({ text: 'x' })).status).toBe(404);
      expect((await api().delete(path).set('Cookie', enseignante).set('Origin', TEST_ORIGIN)).status).toBe(404);
    });
  });

  it('une demande terminée de façon définitive n’accepte plus de message (403), le fil reste lisible', async () => {
    const { id, version } = await createRequest();
    const cancel = await api()
      .post(`/api/requests/${id}/actions`)
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({ action: 'CANCEL', version });
    expect(cancel.status).toBe(200);
    expect(cancel.body.canWriteInThread).toBe(false);
    const res = await post(enseignante, id, { text: 'Trop tard' });
    expect(res.status).toBe(403);
    expect((await api().get(`/api/requests/${id}/messages`).set('Cookie', enseignante)).status).toBe(200);
  });

  it('une demande au travail terminé est en lecture seule côté serveur : ni message, ni fichier, ni priorité', async () => {
    const { id } = await createRequest();
    let version = (await prisma.request.findUniqueOrThrow({ where: { id } })).version;
    for (const action of ['ACCEPT', 'START', 'COMPLETE']) {
      const res = await api().post(`/api/requests/${id}/actions`).set('Cookie', reprographie).set('Origin', TEST_ORIGIN).send({ action, version });
      expect(res.status).toBe(200);
      version = res.body.version;
    }
    const detail = await api().get(`/api/requests/${id}`).set('Cookie', enseignante);
    expect(detail.body.status).toBe('DONE');
    expect(detail.body.canWriteInThread).toBe(false);
    expect(detail.body.allowedActions).not.toContain('CHANGE_PRIORITY');
    // Les actions du circuit restent possibles (le motif d'une correction est saisi avec l'action).
    expect(detail.body.allowedActions).toContain('REQUEST_CORRECTION');

    // Requêtes directes : toutes refusées, et journalisées.
    for (const cookie of [enseignante, reprographie]) {
      expect((await post(cookie, id, { text: 'Encore une chose' })).status).toBe(403);
    }
    const photo = await api()
      .post('/api/files')
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .field('kind', 'PHOTO')
      .field('requestId', id)
      .attach('file', join(__dirname, '..', 'fixtures', 'images', 'photo.png'));
    // Rattachement refusé sans révéler la demande (convention de files.service : 404).
    expect(photo.status).toBe(404);
    const priority = await api().patch(`/api/requests/${id}/priority`).set('Cookie', enseignante).set('Origin', TEST_ORIGIN).send({ priority: 'URGENT', version });
    expect(priority.status).toBe(403);
    const denied = await prisma.auditLog.findMany({ where: { action: 'ACCESS_DENIED', targetId: id } });
    expect(denied.map((d) => (d.details as { reason?: string }).reason)).toEqual(
      expect.arrayContaining(['THREAD_CLOSED', 'FORBIDDEN_CHANGE_PRIORITY']),
    );
    expect(await prisma.message.count({ where: { requestId: id, kind: { not: 'SYSTEM' } } })).toBe(0);

    // La consultation reste possible : détail, fil et historique.
    expect((await api().get(`/api/requests/${id}/messages`).set('Cookie', enseignante)).status).toBe(200);
    expect((await api().get(`/api/requests/${id}/history`).set('Cookie', enseignante)).status).toBe(200);

    // Renvoyée à corriger, la demande redevient active : la discussion rouvre.
    const correction = await api()
      .post(`/api/requests/${id}/actions`)
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({ action: 'REQUEST_CORRECTION', version, reason: 'Il manque la page 3.' });
    expect(correction.status).toBe(200);
    expect(correction.body.canWriteInThread).toBe(true);
    expect((await post(enseignante, id, { text: 'Merci !' })).status).toBe(201);
  });

  it('le motif d’un refus apparaît dans le fil comme message système', async () => {
    const { id, version } = await createRequest();
    await api()
      .post(`/api/requests/${id}/actions`)
      .set('Cookie', reprographie)
      .set('Origin', TEST_ORIGIN)
      .send({ action: 'DECLINE', version, reason: 'Pas de papier A3' })
      .expect(200);
    const res = await api().get(`/api/requests/${id}/messages`).set('Cookie', enseignante);
    expect(res.body.items[0]).toMatchObject({
      kind: 'SYSTEM',
      author: { displayName: 'Reprographie' },
      text: 'Motif du refus : Pas de papier A3',
    });
  });
});
