import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { CoverageActionsService } from '../../src/coverage/coverage-actions.service';
import { CoverageDeadlinesJob } from '../../src/coverage/coverage-deadlines.job';
import { SettingsService } from '../../src/settings/settings.service';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createListeningTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

const image = (name: string) => join(__dirname, '..', 'fixtures', 'images', name);

/**
 * Couverture de classe (lot 2) : scénarios de bout en bout côté API — diffusion, prise en charge
 * atomique, présence (photo + QR), désistement, relève, délais, annulation, permissions, tableau de suivi.
 */
describe('Couverture de classe', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let baseUrl: string;
  let job: CoverageDeadlinesJob;
  const sockets: Socket[] = [];

  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let categoryId: string;
  let groupId: string;
  let violet: string;
  let bleu: string;

  const api = () => request(app.getHttpServer());

  async function create(overrides: Record<string, unknown> = {}, as = 'responsable') {
    const res = await api()
      .post('/api/coverage')
      .set('Cookie', cookies[as])
      .set('Origin', TEST_ORIGIN)
      .send({ clientId: randomUUID(), categoryId, classId: violet, groupIds: [groupId], ...overrides });
    return res;
  }

  async function createOk(overrides: Record<string, unknown> = {}): Promise<{ id: string; version: number }> {
    const res = await create(overrides);
    expect(res.status).toBe(201);
    return res.body;
  }

  function act(as: string, id: string, body: Record<string, unknown>) {
    return api().post(`/api/coverage/${id}/actions`).set('Cookie', cookies[as]).set('Origin', TEST_ORIGIN).send(body);
  }

  async function actOk(as: string, id: string, body: Record<string, unknown>) {
    const res = await act(as, id, body);
    if (res.status !== 200) throw new Error(`${body.action} par ${as} : ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }

  async function uploadPhoto(as: string, file = 'photo.png') {
    return api()
      .post('/api/files')
      .set('Cookie', cookies[as])
      .set('Origin', TEST_ORIGIN)
      .field('kind', 'PHOTO')
      .attach('file', image(file));
  }

  async function photoId(as: string): Promise<string> {
    const res = await uploadPhoto(as);
    expect(res.status).toBe(201);
    return res.body.id;
  }

  async function qrToken(classId: string): Promise<string> {
    const res = await api().get(`/api/admin/coverage/classes/${classId}/qr`).set('Cookie', cookies.superadmin);
    expect(res.status).toBe(200);
    return new URL(res.body.url).searchParams.get('c')!;
  }

  /** Prise + présence confirmée (photo + QR), statut En garde. */
  async function onDuty(as = 'surveillant', overrides: Record<string, unknown> = {}) {
    const { id } = await createOk(overrides);
    await actOk(as, id, { action: 'ACCEPT' });
    await actOk(as, id, { action: 'CONFIRM_PRESENCE', photoFileId: await photoId(as), qrToken: await qrToken(violet) });
    return id;
  }

  async function notificationTypes(username: string, requestId: string): Promise<string[]> {
    const rows = await prisma.notification.findMany({
      where: { userId: ids[username], requestId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((n) => n.type);
  }

  async function expireStage(id: string): Promise<void> {
    await prisma.request.update({ where: { id }, data: { currentDueAt: new Date(Date.now() - 60_000) } });
  }

  function connect(cookie: string): Promise<Socket> {
    const socket = io(baseUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      extraHeaders: { Cookie: cookie, Origin: TEST_ORIGIN },
    });
    sockets.push(socket);
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }

  function nextEvent<T = Record<string, unknown>>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Aucun événement ${event}`)), timeoutMs);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    ({ app, baseUrl } = await createListeningTestApp());
    job = app.get(CoverageDeadlinesJob);
    for (const username of ['responsable', 'superadmin', 'surveillant', 'remplacant', 'autre', 'enseignante']) {
      cookies[username] = await loginAs(app, username);
      ids[username] = await userId(prisma, username);
    }
    categoryId = (await prisma.category.findUniqueOrThrow({ where: { name: 'Garde de classe' } })).id;
    groupId = (await prisma.employeeGroup.findUniqueOrThrow({ where: { name: 'Surveillants/Remplaçants' } })).id;
    violet = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '1ère année Violet' } })).id;
    bleu = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '2e année Bleu' } })).id;
  });

  beforeEach(() => app.get(CoverageActionsService).limiter.reset());

  afterEach(async () => {
    // Chaque scénario repart d'employés libres : les gardes restées ouvertes sont annulées.
    const open = await prisma.request.findMany({
      where: { kind: 'COVERAGE', status: { in: ['BROADCAST', 'UNFILLED', 'ACCEPTED', 'EN_ROUTE', 'LATE'] } },
      select: { id: true },
    });
    for (const { id } of open) await act('superadmin', id, { action: 'CANCEL', reason: 'Nettoyage du test' });
    const onSite = await prisma.request.findMany({
      where: { kind: 'COVERAGE', status: { in: ['ON_DUTY', 'RELIEF_PENDING'] } },
      select: { id: true },
    });
    for (const { id } of onSite) await act('superadmin', id, { action: 'RELIEVE' });
    await prisma.user.updateMany({ where: { id: { in: [ids.surveillant, ids.remplacant] } }, data: { availability: 'AVAILABLE' } });
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await app.close();
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------------
  // 1. Parcours nominal
  // -------------------------------------------------------------------------

  it('1. nominal : diffusion → acceptation → en route → présence (photo + QR) → relève → clôture', async () => {
    const before = Date.now();
    const created = await create({ absentTeacher: 'Mme Martin', estimatedMinutes: 60, note: 'Cahiers sur le bureau' });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect(created.body).toMatchObject({
      status: 'BROADCAST',
      priority: 'URGENT', // priorité par défaut
      proofMode: 'BOTH',
      class: { name: '1ère année Violet', room: 'Salle 12' },
      notifiedCount: 2,
      currentStage: 'TAKEOVER',
    });
    // Délai de prise en charge configuré (2 min), heure serveur.
    const due = new Date(created.body.currentDueAt).getTime();
    expect(due - before).toBeGreaterThanOrEqual(2 * 60_000 - 1000);
    expect(due - before).toBeLessThanOrEqual(2 * 60_000 + 5000);

    // Diffusion : uniquement aux membres disponibles du groupe ciblé.
    expect(await notificationTypes('surveillant', id)).toEqual(['COVERAGE_NEW']);
    expect(await notificationTypes('remplacant', id)).toEqual(['COVERAGE_NEW']);
    expect(await notificationTypes('autre', id)).toEqual([]);
    const open = await api().get('/api/coverage/open').set('Cookie', cookies.surveillant);
    expect(open.body.items.map((i: { id: string }) => i.id)).toContain(id);
    expect(open.body.items.find((i: { id: string }) => i.id === id).canAccept).toBe(true);

    const accepted = await actOk('surveillant', id, { action: 'ACCEPT' });
    expect(accepted).toMatchObject({ status: 'ACCEPTED', assignee: { id: ids.surveillant }, currentStage: 'ARRIVAL' });
    expect(await notificationTypes('responsable', id)).toContain('COVERAGE_ACCEPTED');
    expect(await notificationTypes('remplacant', id)).toEqual(['COVERAGE_NEW', 'COVERAGE_TAKEN']);

    expect(await actOk('surveillant', id, { action: 'DEPART' })).toMatchObject({ status: 'EN_ROUTE' });

    const tPresence = Date.now();
    const onDutyBody = await actOk('surveillant', id, {
      action: 'CONFIRM_PRESENCE',
      photoFileId: await photoId('surveillant'),
      qrToken: await qrToken(violet),
    });
    expect(onDutyBody.status).toBe('ON_DUTY');
    // Heure serveur, jamais celle du client.
    const presenceAt = new Date(onDutyBody.timestamps.presenceAt).getTime();
    expect(presenceAt).toBeGreaterThanOrEqual(tPresence - 1000);
    expect(presenceAt).toBeLessThanOrEqual(Date.now() + 1000);
    expect(onDutyBody.presences.map((p: { method: string }) => p.method).sort()).toEqual(['PHOTO', 'QR']);
    expect(await notificationTypes('responsable', id)).toContain('COVERAGE_PRESENCE');
    expect(await notificationTypes('superadmin', id)).toContain('COVERAGE_PRESENCE');

    const relieved = await actOk('surveillant', id, { action: 'RELIEVE' });
    expect(relieved.status).toBe('CLOSED'); // sans validation finale : clôture immédiate
    expect(relieved.timestamps.relievedAt).toBeTruthy();
    expect(relieved.timestamps.closedAt).toBeTruthy();
    expect(typeof relieved.durationMinutes).toBe('number');
    expect(await notificationTypes('responsable', id)).toContain('COVERAGE_RELIEVED');

    // Historique complet et chronologique.
    const history = relieved.history.map((e: { type: string; toValue: { status?: string } | null }) =>
      e.type === 'STATUS_CHANGED' ? `→${e.toValue?.status}` : e.type,
    );
    expect(history).toEqual([
      'CREATED',
      '→BROADCAST',
      '→ACCEPTED',
      'ASSIGNED',
      '→EN_ROUTE',
      '→ON_DUTY',
      'PRESENCE_CONFIRMED',
      '→DONE',
      '→CLOSED',
    ]);

    // Historique personnel de l'employé.
    const personal = await api().get('/api/coverage/history').set('Cookie', cookies.surveillant);
    expect(personal.body.guards.map((g: { id: string }) => g.id)).toContain(id);
  });

  it('1 bis. validation finale configurée : Relevée puis Clôturée par le responsable', async () => {
    await prisma.category.update({ where: { id: categoryId }, data: { finalValidation: true } });
    try {
      const id = await onDuty();
      expect(await actOk('surveillant', id, { action: 'RELIEVE' })).toMatchObject({ status: 'DONE' });
      expect((await act('surveillant', id, { action: 'VALIDATE' })).status).toBe(403);
      expect(await actOk('responsable', id, { action: 'VALIDATE' })).toMatchObject({ status: 'CLOSED' });
      expect(await notificationTypes('surveillant', id)).toContain('CLOSED');
    } finally {
      await prisma.category.update({ where: { id: categoryId }, data: { finalValidation: false } });
    }
  });

  it('1 ter. historique : des événements de même horodatage restent dans leur ordre d’écriture (N3)', async () => {
    const id = await onDuty();
    // Même milliseconde et identifiants en ordre inverse de l'écriture : seul l'ordre d'écriture départage.
    const at = new Date(Date.now() + 60_000);
    const event = (eventId: string, stage: string) =>
      prisma.requestEvent.create({
        data: { id: eventId, requestId: id, actorId: null, type: 'OVERDUE', toValue: { stage }, createdAt: at },
      });
    await event('ffffffff-ffff-4fff-bfff-ffffffffff02', 'BROADCAST');
    await event('00000000-0000-4000-8000-000000000002', 'ARRIVAL');

    const detail = await api().get(`/api/coverage/${id}`).set('Cookie', cookies.surveillant);
    expect(detail.status).toBe(200);
    expect(detail.body.history.slice(-2).map((e: { toValue: { stage: string } }) => e.toValue.stage)).toEqual([
      'BROADCAST',
      'ARRIVAL',
    ]);
  });

  // -------------------------------------------------------------------------
  // 2. Concurrence
  // -------------------------------------------------------------------------

  it('2. concurrence : deux employés acceptent en même temps, un seul réussit', async () => {
    for (let round = 0; round < 3; round += 1) {
      const { id } = await createOk();
      const [a, b] = await Promise.all([
        act('surveillant', id, { action: 'ACCEPT' }),
        act('remplacant', id, { action: 'ACCEPT' }),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 409]);
      const winner = a.status === 200 ? 'surveillant' : 'remplacant';
      const loser = a.status === 200 ? b : a;
      expect(loser.body.error.code).toBe('ALREADY_TAKEN');
      expect(loser.body.error.message).toBe(`Déjà prise par ${winner === 'surveillant' ? 'Surveillant' : 'Remplaçante'}.`);

      const row = await prisma.request.findUniqueOrThrow({ where: { id } });
      expect(row.assigneeId).toBe(ids[winner]);
      expect(await prisma.requestEvent.count({ where: { requestId: id, type: 'ASSIGNED' } })).toBe(1);
      await actOk('superadmin', id, { action: 'CANCEL', reason: 'Tour suivant' });
    }
  });

  it('limitation de débit sur « Je prends » : au-delà de 10 tentatives par minute, refus 429', async () => {
    const { id } = await createOk();
    await actOk('surveillant', id, { action: 'ACCEPT' });
    for (let i = 0; i < 10; i += 1) expect((await act('remplacant', id, { action: 'ACCEPT' })).status).toBe(409);
    const limited = await act('remplacant', id, { action: 'ACCEPT' });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });

  it('2 bis. le perdant ne voit plus que « Déjà prise par [nom] », sans détail', async () => {
    const { id } = await createOk();
    await actOk('surveillant', id, { action: 'ACCEPT' });
    const view = await api().get(`/api/coverage/${id}`).set('Cookie', cookies.remplacant);
    expect(view.status).toBe(200);
    expect(view.body).toEqual({ id, reference: expect.any(String), limited: true, takenBy: 'Surveillant', finished: false });
    const late = await act('remplacant', id, { action: 'ACCEPT' });
    expect(late.status).toBe(409);
    expect(late.body.error.message).toBe('Déjà prise par Surveillant.');
    // Disparaît de sa liste « À prendre ».
    const open = await api().get('/api/coverage/open').set('Cookie', cookies.remplacant);
    expect(open.body.items.map((i: { id: string }) => i.id)).not.toContain(id);
  });

  // -------------------------------------------------------------------------
  // 3, 4. Groupe cible et disponibilité
  // -------------------------------------------------------------------------

  it('3. un employé hors groupe cible ne voit ni ne peut accepter la demande', async () => {
    const { id } = await createOk();
    const open = await api().get('/api/coverage/open').set('Cookie', cookies.autre);
    expect(open.body.items).toEqual([]);
    expect((await api().get(`/api/coverage/${id}`).set('Cookie', cookies.autre)).status).toBe(404);
    expect((await act('autre', id, { action: 'ACCEPT' })).status).toBe(404);
    const denied = await prisma.auditLog.findFirst({
      where: { action: 'ACCESS_DENIED', actorId: ids.autre, targetId: id },
    });
    expect(denied).not.toBeNull();
  });

  it('4. un employé déjà en garde ne peut pas accepter une autre garde sur le même créneau', async () => {
    const first = await createOk();
    await actOk('surveillant', first.id, { action: 'ACCEPT' });
    const second = await createOk({ classId: bleu });
    // Déjà en garde : non notifié et bouton désactivé.
    expect(await notificationTypes('surveillant', second.id)).toEqual([]);
    const open = await api().get('/api/coverage/open').set('Cookie', cookies.surveillant);
    expect(open.body.items.find((i: { id: string }) => i.id === second.id)?.canAccept).toBe(false);
    const res = await act('surveillant', second.id, { action: 'ACCEPT' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_AVAILABLE');
  });

  it('4 bis. le responsable peut forcer une affectation sur un employé déjà en garde, avec trace', async () => {
    const first = await createOk();
    await actOk('surveillant', first.id, { action: 'ACCEPT' });
    const second = await createOk({ classId: bleu });

    const candidates = await api().get(`/api/coverage/${second.id}/candidates`).set('Cookie', cookies.responsable);
    expect(candidates.body.find((c: { id: string }) => c.id === ids.surveillant)).toMatchObject({ available: false, reason: 'ON_GUARD' });

    const refused = await act('responsable', second.id, { action: 'ASSIGN', assigneeId: ids.surveillant });
    expect(refused.body.error.code).toBe('NOT_AVAILABLE');
    const forced = await actOk('responsable', second.id, { action: 'ASSIGN', assigneeId: ids.surveillant, force: true });
    expect(forced.assignee.id).toBe(ids.surveillant);
    const event = await prisma.requestEvent.findFirstOrThrow({ where: { requestId: second.id, type: 'ASSIGNED' } });
    expect(event.toValue).toMatchObject({ assigneeId: ids.surveillant, forced: true });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'COVERAGE_MANAGED', targetId: second.id } });
    expect(audit.details).toMatchObject({ action: 'ASSIGN', forced: true });
    expect(await notificationTypes('surveillant', second.id)).toContain('ASSIGNED');
  });

  it('disponibilité : l’employé se déclare indisponible ; « Absent » est réservé au responsable', async () => {
    const self = await api().patch('/api/coverage/availability').set('Cookie', cookies.remplacant).set('Origin', TEST_ORIGIN).send({ availability: 'UNAVAILABLE' });
    expect(self.status).toBe(200);
    const { id } = await createOk();
    expect(await notificationTypes('remplacant', id)).toEqual([]);
    expect((await act('remplacant', id, { action: 'ACCEPT' })).body.error.code).toBe('NOT_AVAILABLE');

    const absentBySelf = await api().patch('/api/coverage/availability').set('Cookie', cookies.remplacant).set('Origin', TEST_ORIGIN).send({ availability: 'ABSENT' });
    expect(absentBySelf.status).toBe(400);

    const byManager = await api()
      .patch(`/api/coverage/team/${ids.remplacant}/availability`)
      .set('Cookie', cookies.responsable)
      .set('Origin', TEST_ORIGIN)
      .send({ availability: 'ABSENT' });
    expect(byManager.status).toBe(200);
    const back = await api().patch('/api/coverage/availability').set('Cookie', cookies.remplacant).set('Origin', TEST_ORIGIN).send({ availability: 'AVAILABLE' });
    expect(back.status).toBe(403);
    const byEmployee = await api()
      .patch(`/api/coverage/team/${ids.surveillant}/availability`)
      .set('Cookie', cookies.remplacant)
      .set('Origin', TEST_ORIGIN)
      .send({ availability: 'ABSENT' });
    expect(byEmployee.status).toBe(403);
    expect(await prisma.auditLog.count({ where: { action: 'AVAILABILITY_CHANGED', targetId: ids.remplacant } })).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 5. Désistement et relève
  // -------------------------------------------------------------------------

  it('5. désistement : motif obligatoire, rediffusion immédiate, groupe renotifié, administration alertée', async () => {
    const { id } = await createOk();
    await actOk('remplacant', id, { action: 'ACCEPT' });
    const noReason = await act('remplacant', id, { action: 'RELEASE' });
    expect(noReason.status).toBe(422);
    expect(noReason.body.error.code).toBe('REASON_REQUIRED');

    const released = await actOk('remplacant', id, { action: 'RELEASE', reason: 'Appelée en urgence' });
    expect(released.status).toBe('BROADCAST');
    expect(released.assignee).toBeNull();
    expect(released.currentStage).toBe('TAKEOVER');
    expect(await notificationTypes('surveillant', id)).toEqual(['COVERAGE_NEW', 'COVERAGE_TAKEN', 'COVERAGE_NEW']);
    expect(await notificationTypes('responsable', id)).toContain('COVERAGE_RELEASED');
    expect(await notificationTypes('superadmin', id)).toContain('COVERAGE_RELEASED');
    const event = await prisma.requestEvent.findFirstOrThrow({ where: { requestId: id, type: 'RELEASED' } });
    expect(event).toMatchObject({ comment: 'Appelée en urgence', actorId: ids.remplacant });
    // La demande est de nouveau disponible pour les autres.
    expect(await actOk('surveillant', id, { action: 'ACCEPT' })).toMatchObject({ status: 'ACCEPTED' });
  });

  it('5 bis. désistement refusé en garde (ON_DUTY) : seule la demande de relève est possible', async () => {
    const id = await onDuty();
    const res = await act('surveillant', id, { action: 'RELEASE', reason: 'Je dois partir' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    const detail = await api().get(`/api/coverage/${id}`).set('Cookie', cookies.surveillant);
    expect(detail.body.allowedActions).not.toContain('RELEASE');
    expect(detail.body.allowedActions).toContain('REQUEST_RELIEF');
  });

  it('demande de relève : relève urgente rediffusée, puis le premier est relevé quand le remplaçant confirme sa présence', async () => {
    const original = await onDuty('surveillant');
    expect((await act('surveillant', original, { action: 'REQUEST_RELIEF' })).body.error.code).toBe('REASON_REQUIRED');
    const pending = await actOk('surveillant', original, { action: 'REQUEST_RELIEF', reason: 'Malaise' });
    expect(pending.status).toBe('RELIEF_PENDING');
    expect(pending.assignee.id).toBe(ids.surveillant); // reste responsable

    const relief = await prisma.request.findFirstOrThrow({ where: { coverage: { reliefForId: original } }, include: { coverage: true } });
    expect(relief).toMatchObject({ status: 'BROADCAST', priority: 'URGENT', kind: 'COVERAGE' });
    expect(relief.coverage!.classId).toBe(violet);
    expect(await notificationTypes('responsable', original)).toContain('COVERAGE_RELIEF_REQUESTED');
    const urgent = await prisma.notification.findFirstOrThrow({ where: { userId: ids.superadmin, requestId: original, type: 'COVERAGE_RELIEF_REQUESTED' } });
    expect(urgent.priority).toBe('URGENT');
    expect(await notificationTypes('remplacant', relief.id)).toEqual(['COVERAGE_NEW']);
    // L'employé en garde n'est pas disponible pour sa propre relève.
    expect(await notificationTypes('surveillant', relief.id)).toEqual([]);

    await actOk('remplacant', relief.id, { action: 'ACCEPT' });
    // Le premier employé reste en garde tant que le remplaçant n'a pas confirmé sa présence.
    expect((await prisma.request.findUniqueOrThrow({ where: { id: original } })).status).toBe('RELIEF_PENDING');
    await actOk('remplacant', relief.id, {
      action: 'CONFIRM_PRESENCE',
      photoFileId: await photoId('remplacant'),
      qrToken: await qrToken(violet),
    });
    const first = await prisma.request.findUniqueOrThrow({ where: { id: original }, include: { coverage: true } });
    expect(first.status).toBe('CLOSED');
    expect(first.coverage!.relievedAt).not.toBeNull();
    expect(await notificationTypes('surveillant', original)).toContain('COVERAGE_RELIEVED');
    const systemRelief = await prisma.requestEvent.findFirstOrThrow({
      where: { requestId: original, type: 'STATUS_CHANGED', toValue: { path: ['status'], equals: 'DONE' } },
    });
    expect(systemRelief.actorId).toBeNull(); // relève automatique (système)
  });

  it('libération par le responsable : motif obligatoire, journalisée ; la relève en attente est annulée', async () => {
    const original = await onDuty('surveillant');
    await actOk('surveillant', original, { action: 'REQUEST_RELIEF', reason: 'Rendez-vous médical' });
    const relief = await prisma.request.findFirstOrThrow({ where: { coverage: { reliefForId: original } } });

    expect((await act('surveillant', original, { action: 'RELEASE_BY_MANAGER', reason: 'x' })).status).toBe(403);
    expect((await act('responsable', original, { action: 'RELEASE_BY_MANAGER' })).body.error.code).toBe('REASON_REQUIRED');
    const done = await actOk('responsable', original, { action: 'RELEASE_BY_MANAGER', reason: 'Enseignante revenue' });
    expect(done.status).toBe('CLOSED');
    const event = await prisma.requestEvent.findFirstOrThrow({ where: { requestId: original, type: 'RELEASED' } });
    expect(event).toMatchObject({ actorId: ids.responsable, comment: 'Enseignante revenue', toValue: { byManager: true } });
    expect(await prisma.auditLog.count({ where: { action: 'COVERAGE_MANAGED', targetId: original } })).toBe(1);
    expect((await prisma.request.findUniqueOrThrow({ where: { id: relief.id } })).status).toBe('CANCELLED');
    expect(await notificationTypes('surveillant', original)).toContain('COVERAGE_RELIEVED');
  });

  it('relève annulée par le responsable : la garde d’origine redevient « En garde »', async () => {
    const original = await onDuty('surveillant');
    await actOk('surveillant', original, { action: 'REQUEST_RELIEF', reason: 'Fatigue' });
    const relief = await prisma.request.findFirstOrThrow({ where: { coverage: { reliefForId: original } } });
    await actOk('responsable', relief.id, { action: 'CANCEL', reason: 'Je passe en classe' });
    expect((await prisma.request.findUniqueOrThrow({ where: { id: original } })).status).toBe('ON_DUTY');
  });

  // -------------------------------------------------------------------------
  // 6, 7. Délais
  // -------------------------------------------------------------------------

  it('6. aucun preneur dans le délai : Non pourvue, alertes, groupe relancé, demande conservée', async () => {
    const { id } = await createOk();
    await expireStage(id);
    expect(await job.runOnce()).toBe(1);
    const row = await prisma.request.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: 'UNFILLED', overdueStage: 'TAKEOVER' });
    expect(await notificationTypes('responsable', id)).toContain('COVERAGE_UNFILLED');
    expect(await notificationTypes('superadmin', id)).toContain('COVERAGE_UNFILLED');
    expect(await notificationTypes('surveillant', id)).toEqual(['COVERAGE_NEW', 'COVERAGE_NEW']);
    expect(await prisma.requestEvent.count({ where: { requestId: id, type: 'OVERDUE' } })).toBe(1);
    // Une seule alerte : un second passage ne fait rien.
    expect(await job.runOnce()).toBe(0);
    // Toujours prenable, et le responsable peut élargir ou affecter.
    const detail = await api().get(`/api/coverage/${id}`).set('Cookie', cookies.responsable);
    expect(detail.body.allowedActions).toEqual(expect.arrayContaining(['WIDEN', 'ASSIGN', 'CANCEL']));
    expect(await actOk('remplacant', id, { action: 'ACCEPT' })).toMatchObject({ status: 'ACCEPTED' });
  });

  it('7. preneur sans confirmation de présence à temps : En retard, alertes, réaffectation possible', async () => {
    const { id } = await createOk();
    await actOk('surveillant', id, { action: 'ACCEPT' });
    await expireStage(id);
    expect(await job.runOnce()).toBe(1);
    expect(await prisma.request.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'LATE', overdueStage: 'ARRIVAL' });
    for (const user of ['responsable', 'superadmin', 'surveillant']) {
      expect(await notificationTypes(user, id)).toContain('COVERAGE_LATE');
    }
    const late = await prisma.requestEvent.findFirstOrThrow({ where: { requestId: id, type: 'OVERDUE' } });
    expect(late.toValue).toMatchObject({ stage: 'ARRIVAL', assigneeId: ids.surveillant });
    const reassigned = await actOk('responsable', id, { action: 'REASSIGN', assigneeId: ids.remplacant });
    expect(reassigned).toMatchObject({ status: 'ACCEPTED', assignee: { id: ids.remplacant }, overdueStage: null });
    expect(await notificationTypes('surveillant', id)).toContain('COVERAGE_RELEASED');
  });

  it('double exécution simultanée de la tâche de délais : une seule alerte', async () => {
    const a = await createOk();
    const b = await createOk({ classId: bleu });
    await expireStage(a.id);
    await expireStage(b.id);
    const results = await Promise.all([job.runOnce(), job.runOnce(), job.runOnce()]);
    expect(results.reduce((s, n) => s + n, 0)).toBe(2);
    for (const { id } of [a, b]) {
      expect(await prisma.requestEvent.count({ where: { requestId: id, type: 'OVERDUE' } })).toBe(1);
      expect(await prisma.notification.count({ where: { requestId: id, userId: ids.responsable, type: 'COVERAGE_UNFILLED' } })).toBe(1);
    }
  });

  // -------------------------------------------------------------------------
  // 8, 9. Annulation et transitions interdites
  // -------------------------------------------------------------------------

  it('8. annulation par l’administration : motif obligatoire, tous les concernés notifiés', async () => {
    const { id } = await createOk();
    await actOk('surveillant', id, { action: 'ACCEPT' });
    expect((await act('responsable', id, { action: 'CANCEL' })).body.error.code).toBe('REASON_REQUIRED');
    expect((await act('surveillant', id, { action: 'CANCEL', reason: 'x' })).status).toBe(403);
    const cancelled = await actOk('responsable', id, { action: 'CANCEL', reason: 'L’enseignante est arrivée' });
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelReason: 'L’enseignante est arrivée', assignee: null });
    expect(await notificationTypes('surveillant', id)).toContain('CANCELLED');
    expect(await notificationTypes('remplacant', id)).toContain('CANCELLED');
    // Personne d'autre : un employé hors groupe n'apprend rien de la demande.
    expect(await notificationTypes('autre', id)).toEqual([]);
    // L'employé est libéré : il peut prendre une autre garde.
    const next = await createOk({ classId: bleu });
    expect(await actOk('surveillant', next.id, { action: 'ACCEPT' })).toMatchObject({ status: 'ACCEPTED' });
  });

  it('9. transitions interdites via l’API : refusées', async () => {
    const { id } = await createOk();
    await actOk('surveillant', id, { action: 'ACCEPT' });
    expect((await act('surveillant', id, { action: 'RELIEVE' })).body.error.code).toBe('INVALID_TRANSITION');
    expect((await act('surveillant', id, { action: 'VALIDATE' })).body.error.code).toBe('INVALID_TRANSITION');
    expect((await act('responsable', id, { action: 'DEPART' })).status).toBe(403);
    // Actions réservées au système : rejetées dès la validation de la requête.
    for (const action of ['EXPIRE', 'RELIEF_ABANDONED', 'HACK']) {
      const res = await act('responsable', id, { action });
      expect(res.status).toBe(400);
    }
    // Version obsolète.
    expect((await act('surveillant', id, { action: 'DEPART', version: 0 })).body.error.code).toBe('STATE_CHANGED');
    // Les routes des demandes de travail refusent les couvertures.
    const work = await api()
      .post(`/api/requests/${id}/actions`)
      .set('Cookie', cookies.superadmin)
      .set('Origin', TEST_ORIGIN)
      .send({ action: 'CANCEL', version: 1, reason: 'x' });
    expect(work.status).toBe(404);
    expect((await prisma.request.findUniqueOrThrow({ where: { id } })).status).toBe('ACCEPTED');
  });

  // -------------------------------------------------------------------------
  // 10, 11. Preuves : photo et QR
  // -------------------------------------------------------------------------

  it('10. photo invalide (mauvais format, trop lourde) refusée', async () => {
    const exe = await uploadPhoto('surveillant', 'exe-renamed.jpg');
    expect(exe.status).toBe(415);
    const settings = app.get(SettingsService);
    await prisma.setting.update({ where: { key: 'attachmentMaxBytes' }, data: { value: 10_000 } });
    settings.invalidate();
    try {
      const big = await uploadPhoto('surveillant', 'large.png');
      expect(big.status).toBe(413);
    } finally {
      await prisma.setting.update({ where: { key: 'attachmentMaxBytes' }, data: { value: 10 * 1024 * 1024 } });
      settings.invalidate();
    }
    // Photo d'un autre employé ou déjà rattachée : refusée.
    const { id } = await createOk();
    await actOk('surveillant', id, { action: 'ACCEPT' });
    const othersPhoto = await photoId('remplacant');
    const res = await act('surveillant', id, { action: 'CONFIRM_PRESENCE', photoFileId: othersPhoto, qrToken: await qrToken(violet) });
    expect(res.status).toBe(400);
  });

  it('10 bis. photo de preuve : accessible au preneur, aux responsables et au super admin seulement', async () => {
    const id = await onDuty('surveillant');
    const detail = await api().get(`/api/coverage/${id}`).set('Cookie', cookies.responsable);
    const fileId = detail.body.presences.find((p: { method: string }) => p.method === 'PHOTO').fileId;
    expect(fileId).toBeTruthy();
    for (const user of ['surveillant', 'responsable', 'superadmin']) {
      expect((await api().get(`/api/files/${fileId}`).set('Cookie', cookies[user])).status).toBe(200);
    }
    for (const user of ['remplacant', 'autre', 'enseignante']) {
      expect((await api().get(`/api/files/${fileId}`).set('Cookie', cookies[user])).status).toBe(404);
    }
    // EXIF retiré par le traitement existant ; l'heure de référence est celle du serveur (CoveragePresence.createdAt).
    const presence = await prisma.coveragePresence.findFirstOrThrow({ where: { requestId: id, method: 'PHOTO' } });
    expect(presence.fileId).toBe(fileId);
  });

  it('11. QR code d’une autre classe refusé ; ancienne version refusée après révocation', async () => {
    const { id } = await createOk();
    await actOk('surveillant', id, { action: 'ACCEPT' });
    const photo = await photoId('surveillant');

    const wrongClass = await act('surveillant', id, { action: 'CONFIRM_PRESENCE', photoFileId: photo, qrToken: await qrToken(bleu) });
    expect(wrongClass.status).toBe(422);
    expect(wrongClass.body.error.code).toBe('QR_CLASS_MISMATCH');

    const oldToken = await qrToken(violet);
    const revoked = await api().post(`/api/admin/coverage/classes/${violet}/qr/revoke`).set('Cookie', cookies.superadmin).set('Origin', TEST_ORIGIN);
    expect(revoked.status).toBe(201);
    expect(revoked.body.version).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: 'QR_REVOKED', targetId: violet } })).toBe(1);
    const old = await act('surveillant', id, { action: 'CONFIRM_PRESENCE', photoFileId: photo, qrToken: oldToken });
    expect(old.body.error.code).toBe('QR_INVALID');

    const forged = await act('surveillant', id, { action: 'CONFIRM_PRESENCE', photoFileId: photo, qrToken: oldToken.replace(/.$/, 'A') });
    expect(forged.body.error.code).toBe('QR_INVALID');

    const ok = await actOk('surveillant', id, { action: 'CONFIRM_PRESENCE', photoFileId: photo, qrToken: await qrToken(violet) });
    expect(ok.status).toBe('ON_DUTY');
  });

  it('QR valide mais utilisateur non preneur : refusé ; ouvrir la page ne valide jamais la présence', async () => {
    const { id } = await createOk();
    await actOk('surveillant', id, { action: 'ACCEPT' });
    const token = await qrToken(violet);

    // La page du QR (résolution) n'écrit rien.
    const resolved = await api().post('/api/coverage/presence/resolve').set('Cookie', cookies.surveillant).set('Origin', TEST_ORIGIN).send({ token });
    expect(resolved.status).toBe(200);
    expect(resolved.body).toMatchObject({ class: { id: violet }, coverage: { id, status: 'ACCEPTED' } });
    expect((await prisma.request.findUniqueOrThrow({ where: { id } })).status).toBe('ACCEPTED');
    expect(await prisma.coveragePresence.count({ where: { requestId: id } })).toBe(0);

    // Un autre membre du groupe, devant la même classe : refusé.
    const intruder = await act('remplacant', id, { action: 'CONFIRM_PRESENCE', photoFileId: await photoId('remplacant'), qrToken: token });
    expect(intruder.status).toBe(404);
    const resolvedByOther = await api().post('/api/coverage/presence/resolve').set('Cookie', cookies.remplacant).set('Origin', TEST_ORIGIN).send({ token });
    expect(resolvedByOther.body.coverage).toBeNull();

    // POST direct sans les preuves exigées (catégorie : QR + photo) : refusé.
    const qrOnly = await act('surveillant', id, { action: 'CONFIRM_PRESENCE', qrToken: token });
    expect(qrOnly.body.error.code).toBe('PROOF_REQUIRED');
    const nothing = await act('surveillant', id, { action: 'CONFIRM_PRESENCE' });
    expect(nothing.body.error.code).toBe('PROOF_REQUIRED');
    // Non connecté : refusé.
    expect((await api().post('/api/coverage/presence/resolve').set('Origin', TEST_ORIGIN).send({ token })).status).toBe(401);
    expect((await prisma.request.findUniqueOrThrow({ where: { id } })).status).toBe('ACCEPTED');
  });

  // -------------------------------------------------------------------------
  // 12, 13. Tableau de suivi du super administrateur
  // -------------------------------------------------------------------------

  it('12. le tableau du super admin reflète en direct les changements, chiffres conformes aux données', async () => {
    const socket = await connect(cookies.superadmin);
    const { id } = await createOk();

    const snapshot = async () => (await api().get('/api/admin/coverage/dashboard').set('Cookie', cookies.superadmin)).body;
    const dbCount = (statuses: string[]) =>
      prisma.request.count({ where: { kind: 'COVERAGE', status: { in: statuses as never } } });

    let board = await snapshot();
    expect(board.counts.open).toBe(await dbCount(['BROADCAST']));
    expect(board.counts.taken).toBe(await dbCount(['ACCEPTED', 'EN_ROUTE']));
    expect(board.active.map((r: { id: string }) => r.id)).toContain(id);

    const update = nextEvent<{ requestId: string; status: string }>(socket, 'coverage:updated');
    await actOk('surveillant', id, { action: 'ACCEPT' });
    expect(await update).toMatchObject({ requestId: id, status: 'ACCEPTED' });

    board = await snapshot();
    expect(board.counts.open).toBe(await dbCount(['BROADCAST']));
    expect(board.counts.taken).toBe(await dbCount(['ACCEPTED', 'EN_ROUTE']));
    expect(board.counts.onDuty).toBe(await dbCount(['ON_DUTY', 'RELIEF_PENDING']));
    expect(board.counts.total).toBe(await prisma.request.count({ where: { kind: 'COVERAGE' } }));
    const surveillant = board.employees.find((e: { id: string }) => e.id === ids.surveillant);
    expect(surveillant.currentGuard).toMatchObject({ requestId: id, status: 'ACCEPTED', class: { name: '1ère année Violet' } });
    expect(surveillant.available).toBe(false);
    const doneInDb = await prisma.request.count({ where: { kind: 'COVERAGE', assigneeId: ids.surveillant, status: { in: ['DONE', 'CLOSED'] } } });
    expect(surveillant.guardsDone).toBe(doneInDb);

    // Filtres et export CSV.
    const filtered = await api().get('/api/admin/coverage/dashboard').query({ classId: bleu }).set('Cookie', cookies.superadmin);
    expect(filtered.body.active.every((r: { class: { id: string } }) => r.class.id === bleu)).toBe(true);
    const csv = await api().get('/api/admin/coverage/export.csv').set('Cookie', cookies.superadmin);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Référence;Statut;Priorité;Classe');
    expect(csv.text).toContain('1ère année Violet');
  });

  it('les employés du groupe voient disparaître en direct une garde prise (« Déjà prise par … »)', async () => {
    const socket = await connect(cookies.remplacant);
    const { id } = await createOk();
    const taken = nextEvent<{ requestId: string; takenBy: string }>(socket, 'coverage:taken');
    await actOk('surveillant', id, { action: 'ACCEPT' });
    expect(await taken).toEqual({ requestId: id, takenBy: 'Surveillant' });
  });

  it('13. un employé ou un responsable ne peut pas accéder aux écrans du super admin', async () => {
    for (const user of ['responsable', 'surveillant']) {
      for (const path of ['dashboard', 'export.csv', 'groups', 'classes', `classes/${violet}/qr`]) {
        expect((await api().get(`/api/admin/coverage/${path}`).set('Cookie', cookies[user])).status).toBe(403);
      }
      const revoke = await api().post(`/api/admin/coverage/classes/${violet}/qr/revoke`).set('Cookie', cookies[user]).set('Origin', TEST_ORIGIN);
      expect(revoke.status).toBe(403);
    }
    // Les employés ne gèrent ni ne listent les couvertures.
    expect((await api().get('/api/coverage').set('Cookie', cookies.surveillant)).status).toBe(403);
    expect((await api().get('/api/coverage/team').set('Cookie', cookies.surveillant)).status).toBe(403);
    expect((await create({}, 'surveillant')).status).toBe(403);
    expect((await api().get('/api/coverage/form-options').set('Cookie', cookies.enseignante)).status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // Données de référence
  // -------------------------------------------------------------------------

  it('groupe vide : avertissement avant l’envoi, aucun notifié, signalé au super admin', async () => {
    const created = await api()
      .post('/api/admin/coverage/groups')
      .set('Cookie', cookies.superadmin)
      .set('Origin', TEST_ORIGIN)
      .send({ name: 'Groupe vide', memberIds: [] });
    expect(created.status).toBe(201);
    const empty = created.body.find((g: { name: string }) => g.name === 'Groupe vide');

    const options = await api().get('/api/coverage/form-options').set('Cookie', cookies.responsable);
    expect(options.body.groups.find((g: { id: string }) => g.id === empty.id)).toMatchObject({ memberCount: 0, availableCount: 0 });

    const res = await create({ groupIds: [empty.id] });
    expect(res.status).toBe(201);
    expect(res.body.notifiedCount).toBe(0);
    const board = await api().get('/api/admin/coverage/dashboard').set('Cookie', cookies.superadmin);
    expect(board.body.emptyGroups.map((g: { name: string }) => g.name)).toContain('Groupe vide');

    // Élargissement au groupe des surveillants : ils sont notifiés.
    const widened = await actOk('responsable', res.body.id, { action: 'WIDEN', groupId });
    expect(widened.groups.map((g: { id: string }) => g.id)).toEqual([empty.id, groupId]);
    expect(await notificationTypes('surveillant', res.body.id)).toEqual(['COVERAGE_NEW']);
    await prisma.employeeGroup.update({ where: { id: empty.id }, data: { active: false } });
  });

  it('le type d’une catégorie (travail / couverture) ne peut pas être modifié, côté serveur', async () => {
    const res = await api()
      .patch(`/api/admin/categories/${categoryId}`)
      .set('Cookie', cookies.superadmin)
      .set('Origin', TEST_ORIGIN)
      .send({ kind: 'WORK' });
    expect(res.status).toBe(400);
    expect((await prisma.category.findUniqueOrThrow({ where: { id: categoryId } })).kind).toBe('COVERAGE');
    // Le délai d'arrivée est configurable (jamais codé en dur).
    const deadlines = await api()
      .put(`/api/admin/categories/${categoryId}/deadlines`)
      .set('Cookie', cookies.superadmin)
      .set('Origin', TEST_ORIGIN)
      .send({
        rules: ['NORMAL', 'MEDIUM', 'HIGH', 'URGENT'].map((priority) => ({
          priority,
          validationMinutes: null,
          takeoverMinutes: 3,
          completionMinutes: null,
          arrivalMinutes: 7,
        })),
      });
    expect(deadlines.status).toBe(200);
    const created = await createOk();
    const snapshot = (await prisma.request.findUniqueOrThrow({ where: { id: created.id } })).rulesSnapshot;
    expect(snapshot).toMatchObject({ takeoverMinutes: 3, arrivalMinutes: 7, proofMode: 'BOTH' });
  });
});
