import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** T033 — création et lecture des demandes (US1, V2, V3). */
describe('Création de demandes', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let enseignante: string;
  let reprographie: string;
  let responsable: string;
  let photocopies: string;
  let circuitB: string;
  let reprographieId: string;

  const api = () => request(app.getHttpServer());

  function create(cookie: string, body: Record<string, unknown>) {
    return api()
      .post('/api/requests')
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .send({ clientId: randomUUID(), priority: 'NORMAL', ...body });
  }

  async function uploadVoice(cookie: string): Promise<string> {
    const res = await api()
      .post('/api/files')
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .field('kind', 'VOICE')
      .attach('file', join(__dirname, '..', 'fixtures', 'audio', 'sample.webm'));
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
    circuitB = await categoryId(prisma, CATEGORIES.circuitB);
    reprographieId = await userId(prisma, 'reprographie');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('GET /api/categories', () => {
    it('liste les catégories actives où l’utilisateur peut créer', async () => {
      const res = await api().get('/api/categories').set('Cookie', enseignante);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.arrayContaining([
          { id: photocopies, name: 'Photocopies', circuit: 'A_DIRECT', routingMode: 'DIRECT', photoRequired: false },
          expect.objectContaining({ id: circuitB, circuit: 'B_ADMIN_VALIDATION', routingMode: 'VIA_ADMIN', photoRequired: true }),
        ]),
      );
    });

    it('n’affiche pas une catégorie inactive ni une catégorie interdite au rôle', async () => {
      const hidden = await prisma.category.create({
        data: { name: 'Réservée', circuit: 'A_DIRECT', creatorRoles: ['ADMIN'], closureMode: 'REQUESTER' },
      });
      const res = await api().get('/api/categories').set('Cookie', enseignante);
      expect(res.body.map((c: { id: string }) => c.id)).not.toContain(hidden.id);
      await prisma.category.delete({ where: { id: hidden.id } });
    });

    it('liste les destinataires actifs d’une catégorie en circuit A, aucun en circuit B', async () => {
      const a = await api().get(`/api/categories/${photocopies}/recipients`).set('Cookie', enseignante);
      expect(a.status).toBe(200);
      expect(a.body).toEqual([{ id: reprographieId, displayName: 'Reprographie', jobTitle: 'Reprographie', availability: 'AVAILABLE' }]);
      const b = await api().get(`/api/categories/${circuitB}/recipients`).set('Cookie', enseignante);
      expect(b.body).toEqual([]);
    });
  });

  describe('POST /api/requests — circuit A', () => {
    it('crée une demande vocale envoyée au destinataire choisi', async () => {
      const voiceFileId = await uploadVoice(enseignante);
      const res = await create(enseignante, {
        title: 'Photocopies du contrôle de maths',
        categoryId: photocopies,
        recipientId: reprographieId,
        priority: 'URGENT',
        voiceFileId,
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        title: 'Photocopies du contrôle de maths',
        status: 'SENT',
        priority: 'URGENT',
        category: { id: photocopies, name: 'Photocopies' },
        assignee: { id: reprographieId, displayName: 'Reprographie' },
        hasVoice: true,
        voice: { fileId: voiceFileId, durationSeconds: expect.any(Number) },
        version: 0,
        allowedActions: expect.arrayContaining(['CANCEL']),
        rulesSnapshot: { circuit: 'A_DIRECT', photoRequired: false, closureMode: 'AUTO', finalValidation: false },
      });
      expect(res.body.reference).toMatch(/^D-\d{4}-\d{6}$/);
      expect(res.body.timestamps.submittedAt).toBeTruthy();
      expect(res.body.timestamps.assignedAt).toBeTruthy();

      const stored = await prisma.request.findUniqueOrThrow({ where: { id: res.body.id }, include: { events: true } });
      expect(stored.rulesSnapshot).toMatchObject({ takeoverMinutes: 1, completionMinutes: 5, autoCloseAfterMinutes: 1440 });
      expect(stored.events.map((e) => e.type)).toEqual(expect.arrayContaining(['CREATED', 'STATUS_CHANGED']));
      await expect(prisma.file.findUniqueOrThrow({ where: { id: voiceFileId } })).resolves.toMatchObject({
        requestId: res.body.id,
      });

      const notifications = await prisma.notification.findMany({ where: { requestId: res.body.id } });
      // Demande urgente : l'employé et, une seule fois, le super administrateur (alerte de supervision).
      const superadminId = await userId(prisma, 'superadmin');
      expect(notifications.map((n) => [n.userId, n.type])).toEqual(
        expect.arrayContaining([
          [reprographieId, 'URGENT'],
          [superadminId, 'URGENT'],
        ]),
      );
      expect(notifications).toHaveLength(2);
    });

    it('notifie REQUEST_NEW pour une demande non urgente', async () => {
      const res = await create(enseignante, {
        title: 'Affiches',
        description: '20 exemplaires A3',
        categoryId: photocopies,
        recipientId: reprographieId,
      });
      expect(res.status).toBe(201);
      const notification = await prisma.notification.findFirstOrThrow({ where: { requestId: res.body.id } });
      expect(notification.type).toBe('REQUEST_NEW');
    });

    it('refuse un destinataire hors catégorie ou désactivé (422) sans rien créer (V2)', async () => {
      const before = await prisma.request.count();
      const responsableId = await userId(prisma, 'admin');
      const outside = await create(enseignante, { title: 'X', description: 'x', categoryId: photocopies, recipientId: responsableId });
      expect(outside.status).toBe(422);
      expect(outside.body.error.code).toBe('RECIPIENT_NOT_ALLOWED');

      await prisma.user.update({ where: { id: reprographieId }, data: { active: false } });
      const inactive = await create(enseignante, { title: 'X', description: 'x', categoryId: photocopies, recipientId: reprographieId });
      await prisma.user.update({ where: { id: reprographieId }, data: { active: true } });
      expect(inactive.body.error.code).toBe('RECIPIENT_NOT_ALLOWED');
      await expect(prisma.request.count()).resolves.toBe(before);
      reprographie = await loginAs(app, 'reprographie');
    });

    it('exige un vocal ou une description (CONTENT_REQUIRED)', async () => {
      const res = await create(enseignante, { title: 'Sans contenu', categoryId: photocopies, recipientId: reprographieId });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('CONTENT_REQUIRED');
    });

    it.each([
      ['un titre vide', { title: '   ' }],
      ['un titre de plus de 120 caractères', { title: 'x'.repeat(121) }],
      ['une priorité inconnue', { priority: 'EXTREME' }],
      ['un champ inconnu', { status: 'CLOSED' }],
    ])('refuse %s (400)', async (_label, override) => {
      const res = await create(enseignante, {
        title: 'Titre',
        description: 'x',
        categoryId: photocopies,
        recipientId: reprographieId,
        ...override,
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('refuse le vocal d’un autre utilisateur', async () => {
      const foreignVoice = await uploadVoice(responsable);
      const res = await create(enseignante, {
        title: 'Vocal volé',
        categoryId: photocopies,
        recipientId: reprographieId,
        voiceFileId: foreignVoice,
      });
      expect(res.status).toBe(400);
      expect(res.body.error.details.fields[0].field).toBe('voiceFileId');
    });

    it('est idempotent : renvoyer le même clientId ne crée pas de doublon (V3)', async () => {
      const clientId = randomUUID();
      const body = { clientId, title: 'Relance', description: 'x', categoryId: photocopies, recipientId: reprographieId };
      const first = await create(enseignante, body);
      const second = await create(enseignante, body);
      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(second.body.id).toBe(first.body.id);
      await expect(prisma.request.count({ where: { clientId } })).resolves.toBe(1);
    });

    it('refuse une catégorie où le rôle ne peut pas créer (403)', async () => {
      const reserved = await prisma.category.create({
        data: { name: 'Direction', circuit: 'A_DIRECT', creatorRoles: ['ADMIN'], closureMode: 'REQUESTER' },
      });
      const res = await create(enseignante, { title: 'X', description: 'x', categoryId: reserved.id, recipientId: reprographieId });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/requests — circuit B', () => {
    it('soumet à validation administrative, notifie les responsables, invisible des destinataires', async () => {
      const res = await create(enseignante, { title: 'Réparer le vidéoprojecteur', description: 'Salle 12', categoryId: circuitB });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'PENDING_ADMIN_VALIDATION', assignee: null });

      const notified = await prisma.notification.findMany({ where: { requestId: res.body.id } });
      expect(notified.map((n) => n.userId)).toEqual([await userId(prisma, 'admin')]);

      expect((await api().get(`/api/requests/${res.body.id}`).set('Cookie', reprographie)).status).toBe(404);
      expect((await api().get(`/api/requests/${res.body.id}`).set('Cookie', responsable)).status).toBe(200);
    });

    it('refuse un destinataire en circuit B (le demandeur ne choisit pas l’agent)', async () => {
      const res = await create(enseignante, { title: 'X', description: 'x', categoryId: circuitB, recipientId: reprographieId });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('RECIPIENT_NOT_ALLOWED');
    });
  });

  describe('Brouillons', () => {
    it('crée, modifie et supprime un brouillon visible de son seul auteur, sans historique', async () => {
      const voiceFileId = await uploadVoice(enseignante);
      const created = await create(enseignante, { title: 'Brouillon', categoryId: photocopies, voiceFileId, asDraft: true });
      expect(created.status).toBe(201);
      expect(created.body.status).toBe('DRAFT');
      const id = created.body.id;
      await expect(prisma.requestEvent.count({ where: { requestId: id } })).resolves.toBe(0);
      await expect(prisma.notification.count({ where: { requestId: id } })).resolves.toBe(0);

      expect((await api().get(`/api/requests/${id}`).set('Cookie', responsable)).status).toBe(404);

      const patched = await api()
        .patch(`/api/requests/${id}`)
        .set('Cookie', enseignante)
        .set('Origin', TEST_ORIGIN)
        .send({ title: 'Brouillon modifié', priority: 'HIGH', recipientId: reprographieId });
      expect(patched.status).toBe(200);
      expect(patched.body).toMatchObject({ title: 'Brouillon modifié', priority: 'HIGH' });

      const forbidden = await api().delete(`/api/requests/${id}`).set('Cookie', responsable).set('Origin', TEST_ORIGIN);
      expect(forbidden.status).toBe(404);

      const deleted = await api().delete(`/api/requests/${id}`).set('Cookie', enseignante).set('Origin', TEST_ORIGIN);
      expect(deleted.status).toBe(204);
      await expect(prisma.request.findUnique({ where: { id } })).resolves.toBeNull();
      await expect(prisma.file.findUnique({ where: { id: voiceFileId } })).resolves.toBeNull();
    });

    it('refuse de modifier ou supprimer une demande qui n’est plus un brouillon (409)', async () => {
      const sent = await create(enseignante, { title: 'Envoyée', description: 'x', categoryId: photocopies, recipientId: reprographieId });
      const patch = await api()
        .patch(`/api/requests/${sent.body.id}`)
        .set('Cookie', enseignante)
        .set('Origin', TEST_ORIGIN)
        .send({ title: 'Modifiée' });
      expect(patch.status).toBe(409);
      const del = await api().delete(`/api/requests/${sent.body.id}`).set('Cookie', enseignante).set('Origin', TEST_ORIGIN);
      expect(del.status).toBe(409);
    });

    it('refuse un brouillon quand les brouillons sont désactivés', async () => {
      await prisma.setting.update({ where: { key: 'draftsEnabled' }, data: { value: false } });
      const freshApp = await createTestApp();
      try {
        const cookie = await loginAs(freshApp, 'enseignante');
        const res = await request(freshApp.getHttpServer())
          .post('/api/requests')
          .set('Cookie', cookie)
          .set('Origin', TEST_ORIGIN)
          .send({ clientId: randomUUID(), title: 'X', description: 'x', categoryId: photocopies, priority: 'NORMAL', asDraft: true });
        expect(res.status).toBe(400);
      } finally {
        await prisma.setting.update({ where: { key: 'draftsEnabled' }, data: { value: true } });
        await freshApp.close();
      }
    });
  });

  describe('Lecture', () => {
    it('le destinataire retrouve la demande dans ses demandes reçues', async () => {
      const created = await create(enseignante, { title: 'Pour la reprographie', description: 'x', categoryId: photocopies, recipientId: reprographieId });
      const res = await api().get('/api/requests?scope=assigned').set('Cookie', reprographie);
      expect(res.status).toBe(200);
      expect(res.body.items.map((r: { id: string }) => r.id)).toContain(created.body.id);
      const item = res.body.items.find((r: { id: string }) => r.id === created.body.id);
      expect(item).toMatchObject({
        reference: expect.stringMatching(/^D-/),
        status: 'SENT',
        requester: { displayName: 'Enseignante' },
        hasVoice: false,
        unreadCount: 1,
      });
    });

    it('« mine » ne contient que les demandes de l’utilisateur', async () => {
      const res = await api().get('/api/requests?scope=mine').set('Cookie', reprographie);
      expect(res.body.items).toEqual([]);
    });

    it('pagine par curseur', async () => {
      const page1 = await api().get('/api/requests?scope=mine&limit=2').set('Cookie', enseignante);
      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.nextCursor).toEqual(expect.any(String));
      const page2 = await api()
        .get(`/api/requests?scope=mine&limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`)
        .set('Cookie', enseignante);
      const ids1 = page1.body.items.map((r: { id: string }) => r.id);
      expect(page2.body.items.map((r: { id: string }) => r.id).some((id: string) => ids1.includes(id))).toBe(false);
    });

    it('filtre par statut', async () => {
      const res = await api().get('/api/requests?scope=mine&status=PENDING_ADMIN_VALIDATION').set('Cookie', enseignante);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(res.body.items.every((r: { status: string }) => r.status === 'PENDING_ADMIN_VALIDATION')).toBe(true);
    });

    it('un tiers reçoit 404 sur le détail, et le refus est journalisé', async () => {
      const created = await create(enseignante, { title: 'Privée', description: 'x', categoryId: photocopies, recipientId: reprographieId });
      // Compte « autre » du seed : employé sans lien avec la catégorie.
      const autre = await prisma.user.findUniqueOrThrow({ where: { username: 'autre' } });
      const cookie = await loginAs(app, 'autre');
      const res = await api().get(`/api/requests/${created.body.id}`).set('Cookie', cookie);
      expect(res.status).toBe(404);
      await expect(
        prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId: autre.id, targetId: created.body.id } }),
      ).resolves.toBe(1);
      const list = await api().get('/api/requests?scope=all').set('Cookie', cookie);
      expect(list.body.items).toEqual([]);
    });
  });
});
