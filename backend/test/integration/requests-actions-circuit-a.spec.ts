import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** T048 — US2 : traiter une demande en circuit direct (V5 à V9). */
describe('Actions sur une demande — circuit direct', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let enseignante: string;
  let reprographie: string;
  let responsable: string;
  let photocopies: string;
  let petitsTravaux: string;
  let reprographieId: string;
  let enseignanteId: string;

  const api = () => request(app.getHttpServer());

  async function createRequest(categoryIdValue: string, extra: Record<string, unknown> = {}) {
    const res = await api()
      .post('/api/requests')
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({
        clientId: randomUUID(),
        title: 'Demande de test',
        description: 'Détails',
        categoryId: categoryIdValue,
        recipientId: reprographieId,
        priority: 'NORMAL',
        ...extra,
      });
    expect(res.status).toBe(201);
    return res.body as { id: string; version: number };
  }

  function act(cookie: string, id: string, body: Record<string, unknown>) {
    return api().post(`/api/requests/${id}/actions`).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  }

  /** Enchaîne les actions en reprenant la version renvoyée à chaque étape. */
  async function run(id: string, steps: Array<[string, string, Record<string, unknown>?]>) {
    let version = (await prisma.request.findUniqueOrThrow({ where: { id } })).version;
    let res: request.Response | undefined;
    for (const [cookie, action, extra] of steps) {
      res = await act(cookie, id, { action, version, ...extra });
      expect(res.status).toBe(200);
      version = res.body.version;
    }
    return res!;
  }

  async function uploadPhoto(cookie: string, file = 'photo.png'): Promise<string> {
    const res = await api()
      .post('/api/files')
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .field('kind', 'PHOTO')
      .attach('file', join(__dirname, '..', 'fixtures', 'images', file));
    expect(res.status).toBe(201);
    return res.body.id;
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    enseignante = await loginAs(app, 'enseignante');
    reprographie = await loginAs(app, 'reprographie');
    responsable = await loginAs(app, 'admin');
    photocopies = await categoryId(prisma, CATEGORIES.photocopies);
    petitsTravaux = await categoryId(prisma, CATEGORIES.petitsTravaux);
    reprographieId = await userId(prisma, 'reprographie');
    enseignanteId = await userId(prisma, 'enseignante');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('V5 — accepter, commencer, terminer : statuts, horodatages, version, historique et notifications', async () => {
    const { id } = await createRequest(photocopies);

    const accepted = await run(id, [[reprographie, 'ACCEPT']]);
    expect(accepted.body).toMatchObject({ status: 'ACCEPTED', version: 1, allowedActions: ['START'] });
    expect(accepted.body.timestamps.acceptedAt).toBeTruthy();

    const started = await run(id, [[reprographie, 'START']]);
    expect(started.body).toMatchObject({ status: 'IN_PROGRESS', version: 2 });
    expect(started.body.timestamps.startedAt).toBeTruthy();

    const done = await run(id, [[reprographie, 'COMPLETE']]);
    expect(done.body.status).toBe('DONE');
    expect(done.body.timestamps.doneAt).toBeTruthy();

    const events = await prisma.requestEvent.findMany({ where: { requestId: id, type: 'STATUS_CHANGED' }, orderBy: { createdAt: 'asc' } });
    expect(events.map((e) => (e.toValue as { status: string }).status)).toEqual(['SENT', 'ACCEPTED', 'IN_PROGRESS', 'DONE']);
    expect(events.slice(1).every((e) => e.actorId === reprographieId)).toBe(true);

    const toRequester = await prisma.notification.findMany({ where: { requestId: id, userId: enseignanteId } });
    expect(toRequester.map((n) => n.type)).toEqual(['STATUS_CHANGED', 'STATUS_CHANGED', 'STATUS_CHANGED']);
  });

  describe('Photo de preuve (V6)', () => {
    it('bloque « Terminée » sans photo quand la catégorie l’exige, l’accepte avec une photo', async () => {
      const { id } = await createRequest(petitsTravaux);
      const started = await run(id, [
        [reprographie, 'ACCEPT'],
        [reprographie, 'START'],
      ]);

      const refused = await act(reprographie, id, { action: 'COMPLETE', version: started.body.version });
      expect(refused.status).toBe(422);
      expect(refused.body.error.code).toBe('PHOTO_REQUIRED');

      const photoId = await uploadPhoto(reprographie, 'gps.jpg');
      const done = await act(reprographie, id, { action: 'COMPLETE', version: started.body.version, proofFileIds: [photoId] });
      expect(done.status).toBe(200);
      expect(done.body.status).toBe('DONE');
      await expect(prisma.file.findUniqueOrThrow({ where: { id: photoId } })).resolves.toMatchObject({
        requestId: id,
        isCompletionProof: true,
        mimeType: 'image/jpeg',
      });
      // La demandeuse voit la photo de preuve ; ses métadonnées (GPS) ont été retirées au téléversement.
      expect(done.body.proofPhotos).toEqual([{ fileId: photoId }]);
      const photo = await api().get(`/api/files/${photoId}`).set('Cookie', enseignante);
      expect(photo.status).toBe(200);
      expect(photo.headers['content-type']).toBe('image/jpeg');
    });

    it('refuse la photo d’un autre utilisateur comme preuve', async () => {
      const { id } = await createRequest(petitsTravaux);
      const started = await run(id, [
        [reprographie, 'ACCEPT'],
        [reprographie, 'START'],
      ]);
      const foreign = await uploadPhoto(enseignante);
      const res = await act(reprographie, id, { action: 'COMPLETE', version: started.body.version, proofFileIds: [foreign] });
      expect(res.status).toBe(400);
      expect(res.body.error.details.fields[0].field).toBe('proofFileIds');
    });
  });

  it('V7 — refus par l’employé affecté : motif obligatoire, statut final « Refusée », demandeuse notifiée', async () => {
    const { id, version } = await createRequest(photocopies);
    const noReason = await act(reprographie, id, { action: 'DECLINE', version });
    expect(noReason.status).toBe(422);
    expect(noReason.body.error.code).toBe('REASON_REQUIRED');

    const declined = await act(reprographie, id, { action: 'DECLINE', version, reason: '  Ce n’est pas mon service.  ' });
    expect(declined.status).toBe(200);
    expect(declined.body).toMatchObject({ status: 'REJECTED', rejectionReason: 'Ce n’est pas mon service.', allowedActions: [] });
    expect(declined.body.timestamps.rejectedAt).toBeTruthy();

    const notification = await prisma.notification.findFirstOrThrow({ where: { requestId: id, userId: enseignanteId, type: 'REJECTED' } });
    expect(notification).toBeTruthy();
    const message = await prisma.message.findFirstOrThrow({ where: { requestId: id } });
    expect(message).toMatchObject({ kind: 'SYSTEM', authorId: reprographieId });
    expect(message.text).toContain('Ce n’est pas mon service.');
  });

  it('V8 — annulation par la demandeuse tant que la demande n’est pas acceptée', async () => {
    const first = await createRequest(photocopies);
    const cancelled = await act(enseignante, first.id, { action: 'CANCEL', version: first.version });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(cancelled.body.timestamps.cancelledAt).toBeTruthy();
    await expect(
      prisma.notification.count({ where: { requestId: first.id, userId: reprographieId, type: 'CANCELLED' } }),
    ).resolves.toBe(1);

    const second = await createRequest(photocopies);
    const accepted = await run(second.id, [[reprographie, 'ACCEPT']]);
    const tooLate = await act(enseignante, second.id, { action: 'CANCEL', version: accepted.body.version });
    expect(tooLate.status).toBe(409);
    expect(tooLate.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('renvoi « À corriger » avec commentaire, reprise, puis clôture par la demandeuse', async () => {
    const { id } = await createRequest(petitsTravaux);
    const photo1 = await uploadPhoto(reprographie);
    const done = await run(id, [
      [reprographie, 'ACCEPT'],
      [reprographie, 'START'],
      [reprographie, 'COMPLETE', { proofFileIds: [photo1] }],
    ]);
    expect(done.body.allowedActions.sort()).toEqual([]);

    const asRequester = await api().get(`/api/requests/${id}`).set('Cookie', enseignante);
    expect(asRequester.body.allowedActions.sort()).toEqual(['CLOSE', 'REQUEST_CORRECTION']);

    const noComment = await act(enseignante, id, { action: 'REQUEST_CORRECTION', version: done.body.version, reason: ' ' });
    expect(noComment.body.error.code).toBe('REASON_REQUIRED');

    const toCorrect = await act(enseignante, id, { action: 'REQUEST_CORRECTION', version: done.body.version, reason: 'Il manque une étagère.' });
    expect(toCorrect.status).toBe(200);
    expect(toCorrect.body.status).toBe('TO_CORRECT');
    await expect(prisma.notification.count({ where: { requestId: id, userId: reprographieId, type: 'TO_CORRECT' } })).resolves.toBe(1);

    const photo2 = await uploadPhoto(reprographie);
    const redone = await run(id, [
      [reprographie, 'RESUME'],
      [reprographie, 'COMPLETE', { proofFileIds: [photo2] }],
    ]);
    expect(redone.body.proofPhotos).toHaveLength(2);

    const closed = await run(id, [[enseignante, 'CLOSE']]);
    expect(closed.body.status).toBe('CLOSED');
    expect(closed.body.timestamps.closedAt).toBeTruthy();
    await expect(prisma.notification.count({ where: { requestId: id, userId: reprographieId, type: 'CLOSED' } })).resolves.toBe(1);

    const afterClose = await act(enseignante, id, { action: 'REQUEST_CORRECTION', version: closed.body.version, reason: 'x' });
    expect(afterClose.status).toBe(409);
    expect(afterClose.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('clôture automatique : autoCloseAt fixé à « Terminée », annulé par un renvoi à corriger, refusé à la demandeuse', async () => {
    const { id } = await createRequest(photocopies);
    const done = await run(id, [
      [reprographie, 'ACCEPT'],
      [reprographie, 'START'],
      [reprographie, 'COMPLETE'],
    ]);
    const stored = await prisma.request.findUniqueOrThrow({ where: { id } });
    expect(stored.autoCloseAt!.getTime() - stored.doneAt!.getTime()).toBe(1440 * 60_000);
    expect(done.body.autoCloseAt).toBeTruthy();

    const manualClose = await act(enseignante, id, { action: 'CLOSE', version: done.body.version });
    expect(manualClose.status).toBe(403);

    await run(id, [[enseignante, 'REQUEST_CORRECTION', { reason: 'Recto-verso demandé' }]]);
    await expect(prisma.request.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({ autoCloseAt: null });
  });

  it('clôture par un responsable quand la catégorie le prévoit', async () => {
    const managed = await prisma.category.create({
      data: {
        name: 'Clôture par responsable',
        circuit: 'A_DIRECT',
        creatorRoles: ['EMPLOYEE'],
        closureMode: 'MANAGER',
        recipients: { create: { userId: reprographieId } },
        managers: { create: { userId: await userId(prisma, 'admin') } },
      },
    });
    const { id } = await createRequest(managed.id);
    const done = await run(id, [
      [reprographie, 'ACCEPT'],
      [reprographie, 'START'],
      [reprographie, 'COMPLETE'],
    ]);
    expect((await act(enseignante, id, { action: 'CLOSE', version: done.body.version })).status).toBe(403);
    const closed = await act(responsable, id, { action: 'CLOSE', version: done.body.version });
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe('CLOSED');
  });

  describe('Refus d’accès', () => {
    it('un tiers reçoit 404, la demandeuse 403 sur une action réservée, et chaque refus est journalisé', async () => {
      const { id, version } = await createRequest(photocopies);
      const other = await prisma.user.create({
        data: {
          username: 'tiers',
          displayName: 'Tiers',
          role: 'EMPLOYEE',
          passwordHash: (await prisma.user.findUniqueOrThrow({ where: { username: 'enseignante' } })).passwordHash,
          mustChangePassword: false,
        },
      });
      const tiers = await loginAs(app, 'tiers');

      expect((await act(tiers, id, { action: 'ACCEPT', version })).status).toBe(404);
      const forbidden = await act(enseignante, id, { action: 'ACCEPT', version });
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.error.code).toBe('FORBIDDEN');

      await expect(prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId: other.id, targetId: id } })).resolves.toBe(1);
      await expect(prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId: enseignanteId, targetId: id } })).resolves.toBe(1);
    });

    it('valide le corps de la requête', async () => {
      const { id } = await createRequest(photocopies);
      expect((await act(reprographie, id, { action: 'DANSER', version: 0 })).status).toBe(400);
      expect((await act(reprographie, id, { action: 'ACCEPT' })).status).toBe(400);
      expect((await act(reprographie, id, { action: 'DECLINE', version: 0, reason: 'x'.repeat(1001) })).status).toBe(400);
    });
  });

  describe('Concurrence (V9)', () => {
    it('deux acceptations simultanées : une seule réussit, l’autre reçoit STATE_CHANGED', async () => {
      const { id, version } = await createRequest(photocopies);
      const results = await Promise.all([
        act(reprographie, id, { action: 'ACCEPT', version }),
        act(reprographie, id, { action: 'ACCEPT', version }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const conflict = results.find((r) => r.status === 409)!;
      expect(['STATE_CHANGED', 'INVALID_TRANSITION']).toContain(conflict.body.error.code);
      await expect(prisma.requestEvent.count({ where: { requestId: id, type: 'STATUS_CHANGED' } })).resolves.toBe(2);
    });

    it('une version périmée est refusée avec STATE_CHANGED', async () => {
      const { id, version } = await createRequest(photocopies);
      await run(id, [[reprographie, 'ACCEPT']]);
      const stale = await act(reprographie, id, { action: 'START', version });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('STATE_CHANGED');
    });
  });

  it('envoi d’un brouillon (SUBMIT) : historique et notification créés à l’envoi', async () => {
    const draft = await createRequest(photocopies, { asDraft: true });
    expect((await prisma.request.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('DRAFT');

    const sent = await act(enseignante, draft.id, { action: 'SUBMIT', version: draft.version });
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ status: 'SENT', assignee: { id: reprographieId } });
    expect(sent.body.timestamps.submittedAt).toBeTruthy();
    const events = await prisma.requestEvent.findMany({ where: { requestId: draft.id } });
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['CREATED', 'STATUS_CHANGED', 'ASSIGNED']));
    await expect(prisma.notification.count({ where: { requestId: draft.id, userId: reprographieId } })).resolves.toBe(1);
  });
});
