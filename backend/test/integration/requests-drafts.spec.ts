import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** Spec 007 — brouillons : périmètres de liste (T002), envoi et réglage (T008). */
describe('Brouillons de demande (spec 007)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let enseignante: string;
  let reprographie: string;
  let photocopies: string;
  let circuitB: string;
  let reprographieId: string;
  let responsableId: string;

  const api = () => request(app.getHttpServer());

  function create(cookie: string, body: Record<string, unknown>) {
    return api()
      .post('/api/requests')
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .send({ clientId: randomUUID(), priority: 'NORMAL', categoryId: photocopies, ...body });
  }

  async function createOk(cookie: string, body: Record<string, unknown>): Promise<string> {
    const res = await create(cookie, body);
    if (res.status !== 201) throw new Error(`Création : ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id as string;
  }

  const ids = (res: request.Response) => (res.body.items as Array<{ id: string }>).map((r) => r.id);

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    enseignante = await loginAs(app, 'enseignante');
    reprographie = await loginAs(app, 'reprographie');
    photocopies = await categoryId(prisma, CATEGORIES.photocopies);
    circuitB = await categoryId(prisma, CATEGORIES.circuitB);
    reprographieId = await userId(prisma, 'reprographie');
    responsableId = await userId(prisma, 'admin');
  });

  function patch(cookie: string, id: string, body: Record<string, unknown>, server = app) {
    return request(server.getHttpServer()).patch(`/api/requests/${id}`).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  }

  function submit(cookie: string, id: string, version: number, server = app) {
    return request(server.getHttpServer())
      .post(`/api/requests/${id}/actions`)
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .send({ action: 'SUBMIT', version });
  }

  async function versionOf(id: string): Promise<number> {
    return (await prisma.request.findUniqueOrThrow({ where: { id } })).version;
  }

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('périmètres de liste (T002)', () => {
    it('scope=drafts : les seuls brouillons de l’utilisateur de la session', async () => {
      const draft = await createOk(enseignante, { title: 'Brouillon A', asDraft: true });
      const sent = await createOk(enseignante, { title: 'Envoyée A', description: 'x' });
      const othersDraft = await createOk(reprographie, { title: 'Brouillon d’un autre', asDraft: true });

      const res = await api().get('/api/requests?scope=drafts').set('Cookie', enseignante);
      expect(res.status).toBe(200);
      expect(ids(res)).toContain(draft);
      expect(ids(res)).not.toContain(sent);
      expect(ids(res)).not.toContain(othersDraft);
      expect((res.body.items as Array<{ status: string }>).every((r) => r.status === 'DRAFT')).toBe(true);
    });

    it('scope=mine (« Envoyées ») : plus aucun brouillon', async () => {
      const draft = await createOk(enseignante, { title: 'Brouillon B', asDraft: true });
      const sent = await createOk(enseignante, { title: 'Envoyée B', description: 'x' });

      const res = await api().get('/api/requests?scope=mine&limit=100').set('Cookie', enseignante);
      expect(res.status).toBe(200);
      expect(ids(res)).toContain(sent);
      expect(ids(res)).not.toContain(draft);
      expect((res.body.items as Array<{ status: string }>).some((r) => r.status === 'DRAFT')).toBe(false);
    });

    it('scope=drafts sans session : 401', async () => {
      expect((await api().get('/api/requests?scope=drafts')).status).toBe(401);
    });
  });

  /** Constat de l'existant (T008) : comportements du serveur sur lesquels l'interface s'appuie. */
  describe('envoi d’un brouillon et réglage (T008)', () => {
    it('mode direct : complété puis envoyé, il devient « Envoyée » et le destinataire est notifié', async () => {
      const id = await createOk(enseignante, { title: 'À compléter', asDraft: true });
      const completed = await patch(enseignante, id, { description: 'Deux copies', recipientId: reprographieId });
      expect(completed.status).toBe(200);

      const sent = await submit(enseignante, id, completed.body.version);
      expect(sent.status).toBe(200);
      expect(sent.body.status).toBe('SENT');
      await expect(prisma.notification.findMany({ where: { requestId: id } })).resolves.toEqual([
        expect.objectContaining({ userId: reprographieId, type: 'REQUEST_NEW' }),
      ]);
      const assigned = await api().get('/api/requests?scope=assigned').set('Cookie', reprographie);
      expect(ids(assigned)).toContain(id);
    });

    it('via l’administration : envoyé, il attend la validation et les responsables sont notifiés', async () => {
      const id = await createOk(enseignante, { title: 'Vidéoprojecteur', categoryId: circuitB, description: 'Salle 12', asDraft: true });
      const sent = await submit(enseignante, id, await versionOf(id));
      expect(sent.status).toBe(200);
      expect(sent.body.status).toBe('PENDING_ADMIN_VALIDATION');
      await expect(prisma.notification.findMany({ where: { requestId: id } })).resolves.toEqual([
        expect.objectContaining({ userId: responsableId, type: 'REQUEST_NEW' }),
      ]);
    });

    it('sans description ni message vocal, l’envoi est refusé et le brouillon reste brouillon', async () => {
      const id = await createOk(enseignante, { title: 'Vide', recipientId: reprographieId, asDraft: true });
      const sent = await submit(enseignante, id, await versionOf(id));
      expect(sent.status).toBeGreaterThanOrEqual(400);
      await expect(prisma.request.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({ status: 'DRAFT' });
      await expect(prisma.notification.count({ where: { requestId: id } })).resolves.toBe(0);
    });

    it('réglage désactivé : création refusée, mais un brouillon existant se modifie, s’envoie et se supprime', async () => {
      const toSend = await createOk(enseignante, { title: 'Existant à envoyer', asDraft: true });
      const toDelete = await createOk(enseignante, { title: 'Existant à supprimer', asDraft: true });
      await prisma.setting.update({ where: { key: 'draftsEnabled' }, data: { value: false } });
      // Les réglages sont mis en cache : une application neuve lit la nouvelle valeur.
      const freshApp = await createTestApp();
      try {
        const cookie = await loginAs(freshApp, 'enseignante');
        const refused = await request(freshApp.getHttpServer())
          .post('/api/requests')
          .set('Cookie', cookie)
          .set('Origin', TEST_ORIGIN)
          .send({ clientId: randomUUID(), title: 'Nouveau', categoryId: photocopies, priority: 'NORMAL', asDraft: true });
        expect(refused.status).toBe(400);

        const completed = await patch(cookie, toSend, { description: 'Complété', recipientId: reprographieId }, freshApp);
        expect(completed.status).toBe(200);
        const sent = await submit(cookie, toSend, completed.body.version, freshApp);
        expect(sent.status).toBe(200);
        expect(sent.body.status).toBe('SENT');

        const deleted = await request(freshApp.getHttpServer())
          .delete(`/api/requests/${toDelete}`)
          .set('Cookie', cookie)
          .set('Origin', TEST_ORIGIN);
        expect(deleted.status).toBe(204);
      } finally {
        await prisma.setting.update({ where: { key: 'draftsEnabled' }, data: { value: true } });
        await freshApp.close();
      }
    });
  });
});
