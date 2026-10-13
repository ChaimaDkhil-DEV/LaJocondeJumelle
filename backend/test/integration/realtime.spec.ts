import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { RealtimeService } from '../../src/realtime/realtime.service';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createListeningTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** T066 — temps réel (contracts/realtime-events.md) : authentification, salles, événements après validation. */
describe('Temps réel (Socket.IO)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let baseUrl: string;
  const sockets: Socket[] = [];

  let enseignante: string;
  let reprographie: string;
  let reprographieId: string;
  let photocopies: string;

  /** Événements reçus par socket, pour vérifier aussi l'absence d'événement. */
  const received = new Map<Socket, Array<{ event: string; payload: unknown }>>();

  function connect(cookie?: string, origin = TEST_ORIGIN): Promise<Socket> {
    const socket = io(baseUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      extraHeaders: { ...(cookie ? { Cookie: cookie } : {}), Origin: origin },
    });
    sockets.push(socket);
    received.set(socket, []);
    socket.onAny((event: string, payload: unknown) => received.get(socket)!.push({ event, payload }));
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', (error) => reject(error));
    });
  }

  function nextEvent<T = Record<string, unknown>>(socket: Socket, event: string, timeoutMs = 2000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Aucun événement ${event}`)), timeoutMs);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function createRequest(): Promise<{ id: string; version: number }> {
    const res = await request(app.getHttpServer())
      .post('/api/requests')
      .set('Cookie', enseignante)
      .set('Origin', TEST_ORIGIN)
      .send({
        clientId: randomUUID(),
        title: 'Photocopies temps réel',
        description: 'x',
        categoryId: photocopies,
        recipientId: reprographieId,
        priority: 'URGENT',
      });
    expect(res.status).toBe(201);
    return res.body;
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    ({ app, baseUrl } = await createListeningTestApp());
    enseignante = await loginAs(app, 'enseignante');
    reprographie = await loginAs(app, 'reprographie');
    reprographieId = await userId(prisma, 'reprographie');
    photocopies = await categoryId(prisma, CATEGORIES.photocopies);
  });

  afterEach(() => {
    for (const s of sockets.splice(0)) s.disconnect();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('Poignée de main', () => {
    it('refuse une connexion sans session et la journalise', async () => {
      await expect(connect()).rejects.toMatchObject({ message: 'UNAUTHENTICATED' });
      const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'ACCESS_DENIED' }, orderBy: { createdAt: 'desc' } });
      expect(entry.details).toMatchObject({ reason: 'UNAUTHENTICATED', channel: 'socket' });
    });

    it('refuse une Origin étrangère même avec une session valide', async () => {
      await expect(connect(enseignante, 'https://pirate.example')).rejects.toMatchObject({ message: 'UNAUTHENTICATED' });
      const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'ACCESS_DENIED' }, orderBy: { createdAt: 'desc' } });
      expect(entry.details).toMatchObject({ reason: 'ORIGIN_MISMATCH', channel: 'socket' });
    });

    it('accepte une session valide', async () => {
      const socket = await connect(enseignante);
      expect(socket.connected).toBe(true);
    });
  });

  describe('Événements', () => {
    it('notifie le destinataire en moins d’une seconde, avec des métadonnées seulement, et pas l’auteur', async () => {
      const author = await connect(enseignante);
      const recipient = await connect(reprographie);
      const outsider = await connect(await loginAs(app, 'autre'));

      const started = Date.now();
      const pending = nextEvent(recipient, 'notification:new');
      const created = await createRequest();
      const notification = await pending;

      expect(Date.now() - started).toBeLessThan(1000);
      expect(Object.keys(notification).sort()).toEqual(['createdAt', 'id', 'kind', 'priority', 'reference', 'requestId', 'title', 'type']);
      expect(notification).toMatchObject({ type: 'URGENT', priority: 'URGENT', requestId: created.id, title: 'Photocopies temps réel' });

      await pause(300);
      expect(received.get(author)!.filter((e) => e.event === 'notification:new')).toEqual([]);
      expect(received.get(outsider)).toEqual([]);
    });

    it('diffuse request:updated après un changement de statut, et rien si la transaction échoue', async () => {
      const { id, version } = await createRequest();
      const author = await connect(enseignante);

      const updated = nextEvent(author, 'request:updated');
      const notified = nextEvent(author, 'notification:new');
      await request(app.getHttpServer())
        .post(`/api/requests/${id}/actions`)
        .set('Cookie', reprographie)
        .set('Origin', TEST_ORIGIN)
        .send({ action: 'ACCEPT', version })
        .expect(200);
      expect(await updated).toEqual({ requestId: id, status: 'ACCEPTED', version: 1, overdueStage: null });
      expect(await notified).toMatchObject({ type: 'STATUS_CHANGED', requestId: id });

      // Version périmée : 409, aucune écriture, donc aucun événement.
      received.get(author)!.length = 0;
      await request(app.getHttpServer())
        .post(`/api/requests/${id}/actions`)
        .set('Cookie', reprographie)
        .set('Origin', TEST_ORIGIN)
        .send({ action: 'START', version })
        .expect(409);
      await pause(300);
      expect(received.get(author)).toEqual([]);
    });

    it('diffuse message:new aux autres participants', async () => {
      const { id } = await createRequest();
      const author = await connect(enseignante);
      const recipient = await connect(reprographie);
      const pending = nextEvent(recipient, 'message:new');
      const res = await request(app.getHttpServer())
        .post(`/api/requests/${id}/messages`)
        .set('Cookie', enseignante)
        .set('Origin', TEST_ORIGIN)
        .send({ clientId: randomUUID(), text: 'Merci' })
        .expect(201);
      expect(await pending).toEqual({ requestId: id, messageId: res.body.id });
      await pause(300);
      expect(received.get(author)!.filter((e) => e.event === 'message:new')).toEqual([]);
    });
  });

  describe('Fin de session', () => {
    it('la déconnexion envoie session:ended puis ferme la connexion', async () => {
      const cookie = await loginAs(app, 'enseignante');
      const socket = await connect(cookie);
      const ended = nextEvent(socket, 'session:ended');
      const closed = new Promise<void>((resolve) => socket.once('disconnect', () => resolve()));
      await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookie).set('Origin', TEST_ORIGIN).expect(204);
      expect(await ended).toEqual({ reason: 'LOGOUT' });
      await closed;
    });

    it('la désactivation d’un compte ferme toutes ses connexions', async () => {
      const socket = await connect(await loginAs(app, 'reprographie'));
      const ended = nextEvent(socket, 'session:ended');
      app.get(RealtimeService).endUserSessions(reprographieId, 'DEACTIVATED');
      expect(await ended).toEqual({ reason: 'DEACTIVATED' });
    });

    it('une session expirée pendant la connexion est fermée à la vérification périodique', async () => {
      const cookie = await loginAs(app, 'enseignante');
      const socket = await connect(cookie);
      const keep = await connect(enseignante);
      const ended = nextEvent(socket, 'session:ended');
      const enseignanteId = await userId(prisma, 'enseignante');
      const sessions = await prisma.session.findMany({ where: { userId: enseignanteId }, orderBy: { createdAt: 'desc' } });
      await prisma.session.update({ where: { id: sessions[0].id }, data: { expiresAt: new Date(Date.now() - 1000) } });

      await app.get(RealtimeService).revalidateSessions();
      expect(await ended).toEqual({ reason: 'EXPIRED' });
      expect(keep.connected).toBe(true);
    });
  });
});
