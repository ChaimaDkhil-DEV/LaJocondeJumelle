import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { CoverageDeadlinesJob } from '../../src/scheduler/coverage-deadlines.job';
import { SettingsService } from '../../src/settings/settings.service';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { clearCoverages, createCoverage, minutesFrom } from '../utils/coverage-fixtures';
import { createListeningTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

const image = (name: string) => join(__dirname, '..', 'fixtures', 'images', name);

/**
 * Affectations (ex-couvertures de classe, lot 2 → 004) : scénarios de bout en bout côté API
 * conservés après la suppression de la diffusion (FR-011a, FR-011b). Chaque affectation est préparée
 * par l'admin (affectation directe ou assignation d'une demande en attente) ; présence (photo + QR),
 * relève, libération, prolongation, retard d'arrivée, annulation, transitions interdites, écrans du
 * super administrateur. Les cas supprimés avec la diffusion sont listés dans
 * docs/validation/verification-004.md (T038).
 */
describe('Affectations : parcours conservés de la garde de classe', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let baseUrl: string;
  let job: CoverageDeadlinesJob;
  const sockets: Socket[] = [];

  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let categoryId: string;
  let violet: string;
  let bleu: string;

  const api = () => request(app.getHttpServer());

  /** Affectation directe par l'admin (assignée d'emblée). */
  async function create(overrides: Record<string, unknown> = {}, as = 'admin') {
    return api()
      .post('/api/coverage')
      .set('Cookie', cookies[as])
      .set('Origin', TEST_ORIGIN)
      .send({
        clientId: randomUUID(),
        classId: violet,
        type: 'ABSENCE',
        startAt: new Date().toISOString(),
        endAt: minutesFrom(new Date(), 60).toISOString(),
        assigneeId: ids.surveillant,
        ...overrides,
      });
  }

  async function createOk(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string; version: number }> {
    const res = await create(overrides);
    if (res.status !== 201) throw new Error(`Création : ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }

  /** Demande d'enseignant en attente (pour l'assignation par l'admin). */
  function pending(className = '1ère année Violet') {
    const now = new Date();
    return createCoverage(prisma, {
      status: 'PENDING',
      className,
      startAt: now,
      plannedEndAt: minutesFrom(now, 60),
    });
  }

  function act(as: string, id: string, body: Record<string, unknown>) {
    return api()
      .post(`/api/coverage/${id}/actions`)
      .set('Cookie', cookies[as])
      .set('Origin', TEST_ORIGIN)
      .send(body);
  }

  async function actOk(as: string, id: string, body: Record<string, unknown>) {
    const res = await act(as, id, body);
    if (res.status !== 200)
      throw new Error(`${body.action} par ${as} : ${res.status} ${JSON.stringify(res.body)}`);
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
    const res = await api()
      .get(`/api/admin/coverage/classes/${classId}/qr`)
      .set('Cookie', cookies.superadmin);
    expect(res.status).toBe(200);
    return new URL(res.body.url).searchParams.get('c')!;
  }

  /** Affectation directe + présence confirmée (photo + QR) : « en cours ». */
  async function onDuty(as = 'surveillant', overrides: Record<string, unknown> = {}) {
    const { id } = await createOk({ assigneeId: ids[as], ...overrides });
    await actOk(as, id, {
      action: 'CONFIRM_PRESENCE',
      photoFileId: await photoId(as),
      qrToken: await qrToken(violet),
    });
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
    await prisma.request.update({
      where: { id },
      data: { currentDueAt: new Date(Date.now() - 60_000) },
    });
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

  function nextEvent<T = Record<string, unknown>>(
    socket: Socket,
    event: string,
    timeoutMs = 3000,
  ): Promise<T> {
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
    for (const username of [
      'admin',
      'superadmin',
      'surveillant',
      'remplacant',
      'autre',
      'enseignante',
    ]) {
      cookies[username] = await loginAs(app, username);
      ids[username] = await userId(prisma, username);
    }
    categoryId = (await prisma.category.findUniqueOrThrow({ where: { name: 'Garde de classe' } }))
      .id;
    violet = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '1ère année Violet' } }))
      .id;
    bleu = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '2e année Bleu' } })).id;
  });

  // Chaque scénario repart de surveillants libres.
  afterEach(() => clearCoverages(prisma));

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await app.close();
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------------
  // 1. Parcours nominal
  // -------------------------------------------------------------------------

  it('1. nominal : affectation directe → en route → présence (photo + QR) → terminée → clôture', async () => {
    const before = Date.now();
    const created = await create({
      note: 'Cahiers sur le bureau',
      reason: 'Formation de Mme Martin',
    });
    expect(created.status).toBe(201);
    const id = created.body.id;
    // Création journalisée (métadonnées seules : ni consigne, ni motif).
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'COVERAGE_CREATED', targetId: id },
    });
    expect(audit).toMatchObject({
      actorId: ids.admin,
      targetType: 'Request',
      details: {
        source: 'ADMIN_DIRECT',
        type: 'ABSENCE',
        classId: violet,
        assigneeId: ids.surveillant,
        status: 'ACCEPTED',
      },
    });
    expect(JSON.stringify(audit.details)).not.toMatch(/Martin|Cahiers/);
    expect(created.body).toMatchObject({
      status: 'ACCEPTED',
      mainStatus: 'ASSIGNED',
      source: 'ADMIN_DIRECT',
      type: 'ABSENCE',
      priority: 'URGENT',
      proofMode: 'BOTH',
      class: { name: '1ère année Violet', room: 'Salle 12' },
      floor: { name: '1er étage' },
      assignee: { id: ids.surveillant },
      currentStage: 'ARRIVAL',
      reason: 'Formation de Mme Martin',
    });
    // Délai d'arrivée configuré (5 min), heure serveur.
    const due = new Date(created.body.currentDueAt).getTime();
    expect(due - before).toBeGreaterThanOrEqual(5 * 60_000 - 1000);
    expect(due - before).toBeLessThanOrEqual(5 * 60_000 + 5000);

    // Seul le surveillant assigné est notifié.
    expect(await notificationTypes('surveillant', id)).toEqual(['ASSIGNED']);
    expect(await notificationTypes('remplacant', id)).toEqual([]);
    // Le surveillant ne voit jamais le motif (FR-023c).
    const seen = await api().get(`/api/coverage/${id}`).set('Cookie', cookies.surveillant);
    expect(seen.body).toMatchObject({
      view: 'SUPERVISOR',
      reason: null,
      note: 'Cahiers sur le bureau',
    });

    expect(await actOk('surveillant', id, { action: 'DEPART' })).toMatchObject({
      status: 'EN_ROUTE',
      subState: 'EN_ROUTE',
    });

    const tPresence = Date.now();
    const onDutyBody = await actOk('surveillant', id, {
      action: 'CONFIRM_PRESENCE',
      photoFileId: await photoId('surveillant'),
      qrToken: await qrToken(violet),
    });
    expect(onDutyBody).toMatchObject({ status: 'ON_DUTY', mainStatus: 'IN_PROGRESS' });
    // Heure serveur, jamais celle du client.
    const presenceAt = new Date(onDutyBody.timestamps.presenceAt).getTime();
    expect(presenceAt).toBeGreaterThanOrEqual(tPresence - 1000);
    expect(presenceAt).toBeLessThanOrEqual(Date.now() + 1000);
    expect(onDutyBody.presences.map((p: { method: string }) => p.method).sort()).toEqual([
      'PHOTO',
      'QR',
    ]);
    expect(await notificationTypes('admin', id)).toContain('COVERAGE_PRESENCE');

    const relieved = await actOk('surveillant', id, { action: 'RELIEVE' });
    expect(relieved).toMatchObject({ status: 'CLOSED', mainStatus: 'DONE' }); // sans validation finale : clôture immédiate
    expect(relieved.timestamps.relievedAt).toBeTruthy();
    expect(relieved.timestamps.closedAt).toBeTruthy();
    expect(typeof relieved.durationMinutes).toBe('number');
    expect(await notificationTypes('admin', id)).toContain('COVERAGE_RELIEVED');

    // Historique complet et chronologique.
    const history = relieved.history.map(
      (e: { type: string; toValue: { status?: string } | null }) =>
        e.type === 'STATUS_CHANGED' ? `→${e.toValue?.status}` : e.type,
    );
    expect(history).toEqual([
      'CREATED',
      '→ACCEPTED',
      'ASSIGNED',
      '→EN_ROUTE',
      '→ON_DUTY',
      'PRESENCE_CONFIRMED',
      '→DONE',
      '→CLOSED',
    ]);

    // Historique personnel du surveillant.
    const personal = await api().get('/api/coverage/history').set('Cookie', cookies.surveillant);
    expect(personal.body.guards.map((g: { id: string }) => g.id)).toContain(id);
  });

  it('1 bis. validation finale configurée : terminée, puis clôturée par l’admin', async () => {
    await prisma.category.update({ where: { id: categoryId }, data: { finalValidation: true } });
    try {
      const id = await onDuty();
      expect(await actOk('surveillant', id, { action: 'RELIEVE' })).toMatchObject({
        status: 'DONE',
      });
      expect((await act('surveillant', id, { action: 'VALIDATE' })).status).toBe(403);
      expect(await actOk('admin', id, { action: 'VALIDATE' })).toMatchObject({
        status: 'CLOSED',
        subState: 'CLOSED',
      });
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
        data: {
          id: eventId,
          requestId: id,
          actorId: null,
          type: 'OVERDUE',
          toValue: { stage },
          createdAt: at,
        },
      });
    await event('ffffffff-ffff-4fff-bfff-ffffffffff02', 'TAKEOVER');
    await event('00000000-0000-4000-8000-000000000002', 'ARRIVAL');

    const detail = await api().get(`/api/coverage/${id}`).set('Cookie', cookies.surveillant);
    expect(detail.status).toBe(200);
    expect(
      detail.body.history.slice(-2).map((e: { toValue: { stage: string } }) => e.toValue.stage),
    ).toEqual(['TAKEOVER', 'ARRIVAL']);
  });

  it('assignation d’une demande en attente : surveillant et enseignant notifiés (FR-017a)', async () => {
    const id = await pending();
    const assigned = await actOk('admin', id, { action: 'ASSIGN', assigneeId: ids.surveillant });
    expect(assigned).toMatchObject({
      status: 'ACCEPTED',
      assignee: { id: ids.surveillant },
      currentStage: 'ARRIVAL',
    });
    expect(await notificationTypes('surveillant', id)).toEqual(['ASSIGNED']);
    expect(await notificationTypes('enseignante', id)).toEqual(['ASSIGNED']);
    expect(await prisma.requestEvent.count({ where: { requestId: id, type: 'ASSIGNED' } })).toBe(1);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'COVERAGE_MANAGED', targetId: id },
    });
    expect(audit.details).toMatchObject({
      action: 'ASSIGN',
      after: { assigneeId: ids.surveillant },
    });
  });

  // -------------------------------------------------------------------------
  // 3, 4. Accès et disponibilité
  // -------------------------------------------------------------------------

  it('3. un employé hors module ne voit ni n’agit sur l’affectation ; refus journalisé', async () => {
    const { id } = await createOk();
    expect((await api().get(`/api/coverage/${id}`).set('Cookie', cookies.autre)).status).toBe(404);
    expect((await act('autre', id, { action: 'DEPART' })).status).toBe(404);
    const denied = await prisma.auditLog.findFirst({
      where: { action: 'ACCESS_DENIED', actorId: ids.autre, targetId: id },
    });
    expect(denied).not.toBeNull();
  });

  it('4. un surveillant déjà affecté sur le créneau n’est pas assignable, sans forçage', async () => {
    await createOk();
    const second = await pending('2e année Bleu');
    const candidates = await api()
      .get(`/api/coverage/${second}/candidates`)
      .set('Cookie', cookies.admin);
    expect(candidates.body.find((c: { id: string }) => c.id === ids.surveillant)).toMatchObject({
      available: false,
      reason: 'ON_GUARD',
    });
    const refused = await act('admin', second, { action: 'ASSIGN', assigneeId: ids.surveillant });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('NOT_AVAILABLE');
    expect(
      (await act('admin', second, { action: 'ASSIGN', assigneeId: ids.surveillant, force: true }))
        .status,
    ).toBe(400);
    expect((await create({ classId: bleu })).body.error.code).toBe('NOT_AVAILABLE');
  });

  it('disponibilité : le surveillant se déclare indisponible ; « Absent » est réservé à l’admin', async () => {
    const self = await api()
      .patch('/api/coverage/availability')
      .set('Cookie', cookies.remplacant)
      .set('Origin', TEST_ORIGIN)
      .send({ availability: 'UNAVAILABLE' });
    expect(self.status).toBe(200);
    expect((await create({ assigneeId: ids.remplacant })).body.error.code).toBe('NOT_AVAILABLE');

    const absentBySelf = await api()
      .patch('/api/coverage/availability')
      .set('Cookie', cookies.remplacant)
      .set('Origin', TEST_ORIGIN)
      .send({ availability: 'ABSENT' });
    expect(absentBySelf.status).toBe(400);

    const byAdmin = await api()
      .patch(`/api/coverage/team/${ids.remplacant}/availability`)
      .set('Cookie', cookies.admin)
      .set('Origin', TEST_ORIGIN)
      .send({ availability: 'ABSENT' });
    expect(byAdmin.status).toBe(200);
    const back = await api()
      .patch('/api/coverage/availability')
      .set('Cookie', cookies.remplacant)
      .set('Origin', TEST_ORIGIN)
      .send({ availability: 'AVAILABLE' });
    expect(back.status).toBe(403);
    const bySupervisor = await api()
      .patch(`/api/coverage/team/${ids.surveillant}/availability`)
      .set('Cookie', cookies.remplacant)
      .set('Origin', TEST_ORIGIN)
      .send({ availability: 'ABSENT' });
    expect(bySupervisor.status).toBe(404);
    expect(
      await prisma.auditLog.count({
        where: { action: 'AVAILABILITY_CHANGED', targetId: ids.remplacant },
      }),
    ).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 5. Relève
  // -------------------------------------------------------------------------

  it('5 bis. en cours, le surveillant ne se désiste pas (action retirée) : seule la demande de relève est possible', async () => {
    const id = await onDuty();
    const res = await act('surveillant', id, { action: 'RELEASE', reason: 'Je dois partir' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_ACTION');
    const detail = await api().get(`/api/coverage/${id}`).set('Cookie', cookies.surveillant);
    expect(detail.body.allowedActions).toEqual([
      'CONFIRM_PRESENCE',
      'REQUEST_RELIEF',
      'RELIEVE',
      'EXTEND',
    ]);
  });

  it('demande de relève : relève en attente assignée par l’admin ; le premier est relevé à la présence du remplaçant', async () => {
    const original = await onDuty('surveillant');
    expect((await act('surveillant', original, { action: 'REQUEST_RELIEF' })).body.error.code).toBe(
      'REASON_REQUIRED',
    );
    const relieving = await actOk('surveillant', original, {
      action: 'REQUEST_RELIEF',
      reason: 'Malaise',
    });
    expect(relieving).toMatchObject({ status: 'RELIEF_PENDING', subState: 'RELIEF_PENDING' });
    expect(relieving.assignee.id).toBe(ids.surveillant); // reste responsable

    const relief = await prisma.request.findFirstOrThrow({
      where: { coverage: { reliefForId: original } },
      include: { coverage: true },
    });
    expect(relief).toMatchObject({
      status: 'PENDING',
      priority: 'URGENT',
      kind: 'COVERAGE',
      assigneeId: null,
    });
    expect(relief.coverage!.classId).toBe(violet);
    expect(await notificationTypes('admin', original)).toContain('COVERAGE_RELIEF_REQUESTED');
    const urgent = await prisma.notification.findFirstOrThrow({
      where: { userId: ids.superadmin, requestId: original, type: 'COVERAGE_RELIEF_REQUESTED' },
    });
    expect(urgent.priority).toBe('URGENT');
    // Plus de diffusion : personne n'est sollicité avant l'assignation par l'admin.
    expect(await notificationTypes('remplacant', relief.id)).toEqual([]);
    expect(
      await prisma.coverageReminder.count({ where: { requestId: relief.id, kind: 'TAKEOVER' } }),
    ).toBe(1);

    await actOk('admin', relief.id, { action: 'ASSIGN', assigneeId: ids.remplacant });
    expect(await notificationTypes('remplacant', relief.id)).toEqual(['ASSIGNED']);
    // Le premier surveillant reste en cours tant que le remplaçant n'a pas confirmé sa présence.
    expect((await prisma.request.findUniqueOrThrow({ where: { id: original } })).status).toBe(
      'RELIEF_PENDING',
    );
    await actOk('remplacant', relief.id, {
      action: 'CONFIRM_PRESENCE',
      photoFileId: await photoId('remplacant'),
      qrToken: await qrToken(violet),
    });
    const first = await prisma.request.findUniqueOrThrow({
      where: { id: original },
      include: { coverage: true },
    });
    expect(first.status).toBe('CLOSED');
    expect(first.coverage!.relievedAt).not.toBeNull();
    expect(await notificationTypes('surveillant', original)).toContain('COVERAGE_RELIEVED');
    const systemRelief = await prisma.requestEvent.findFirstOrThrow({
      where: {
        requestId: original,
        type: 'STATUS_CHANGED',
        toValue: { path: ['status'], equals: 'DONE' },
      },
    });
    expect(systemRelief.actorId).toBeNull(); // relève automatique (système)
  });

  it('libération par l’admin : motif obligatoire, journalisée ; la relève en attente est annulée', async () => {
    const original = await onDuty('surveillant');
    await actOk('surveillant', original, {
      action: 'REQUEST_RELIEF',
      reason: 'Rendez-vous médical',
    });
    const relief = await prisma.request.findFirstOrThrow({
      where: { coverage: { reliefForId: original } },
    });

    expect(
      (await act('surveillant', original, { action: 'RELEASE_BY_MANAGER', reason: 'x' })).status,
    ).toBe(403);
    expect((await act('admin', original, { action: 'RELEASE_BY_MANAGER' })).body.error.code).toBe(
      'REASON_REQUIRED',
    );
    const done = await actOk('admin', original, {
      action: 'RELEASE_BY_MANAGER',
      reason: 'Enseignante revenue',
    });
    expect(done.status).toBe('CLOSED');
    const event = await prisma.requestEvent.findFirstOrThrow({
      where: { requestId: original, type: 'RELEASED' },
    });
    expect(event).toMatchObject({
      actorId: ids.admin,
      comment: 'Enseignante revenue',
      toValue: { byManager: true },
    });
    expect(
      await prisma.auditLog.count({ where: { action: 'COVERAGE_MANAGED', targetId: original } }),
    ).toBe(1);
    expect((await prisma.request.findUniqueOrThrow({ where: { id: relief.id } })).status).toBe(
      'CANCELLED',
    );
    expect(await notificationTypes('surveillant', original)).toContain('COVERAGE_RELIEVED');
  });

  it('relève annulée par l’admin : l’affectation d’origine redevient « en cours »', async () => {
    const original = await onDuty('surveillant');
    await actOk('surveillant', original, { action: 'REQUEST_RELIEF', reason: 'Fatigue' });
    const relief = await prisma.request.findFirstOrThrow({
      where: { coverage: { reliefForId: original } },
    });
    await actOk('admin', relief.id, { action: 'CANCEL', reason: 'Je passe en classe' });
    expect((await prisma.request.findUniqueOrThrow({ where: { id: original } })).status).toBe(
      'ON_DUTY',
    );
  });

  it('prolongation : fin de créneau repoussée, rappel de clôture recalculé, admins notifiés', async () => {
    const id = await onDuty('surveillant');
    const end = (await prisma.coverageDetail.findUniqueOrThrow({ where: { requestId: id } }))
      .plannedEndAt!;
    const extended = await actOk('surveillant', id, { action: 'EXTEND', minutes: 30 });
    expect(new Date(extended.plannedEndAt).getTime()).toBe(end.getTime() + 30 * 60_000);
    const [closeReminder] = await prisma.coverageReminder.findMany({
      where: { requestId: id, kind: 'END_OF_SLOT', resolvedAt: null },
    });
    expect(closeReminder.dueAt.getTime()).toBe(end.getTime() + 40 * 60_000);
    expect(await notificationTypes('admin', id)).toContain('COVERAGE_EXTENDED');
  });

  // -------------------------------------------------------------------------
  // 7. Délai d'arrivée
  // -------------------------------------------------------------------------

  it('7. surveillant sans confirmation de présence à temps : en retard, alertes, réassignation', async () => {
    const { id } = await createOk();
    await expireStage(id);
    expect(await job.runOnce()).toBe(1);
    expect(await prisma.request.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'LATE',
      overdueStage: 'ARRIVAL',
    });
    for (const user of ['admin', 'superadmin'])
      expect(await notificationTypes(user, id)).toContain('COVERAGE_LATE');
    expect(await notificationTypes('surveillant', id)).toContain('COVERAGE_LATE');
    const late = await prisma.requestEvent.findFirstOrThrow({
      where: { requestId: id, type: 'OVERDUE' },
    });
    expect(late.toValue).toMatchObject({ stage: 'ARRIVAL', assigneeId: ids.surveillant });
    const reassigned = await actOk('admin', id, { action: 'REASSIGN', assigneeId: ids.remplacant });
    expect(reassigned).toMatchObject({
      status: 'ACCEPTED',
      assignee: { id: ids.remplacant },
      overdueStage: null,
    });
    expect(await notificationTypes('surveillant', id)).toContain('COVERAGE_LIFTED');
    expect(await notificationTypes('remplacant', id)).toEqual(['ASSIGNED']);
  });

  it('double exécution simultanée de la tâche de délais : une seule alerte', async () => {
    const a = await createOk();
    const b = await createOk({ classId: bleu, assigneeId: ids.remplacant });
    await expireStage(a.id);
    await expireStage(b.id);
    const results = await Promise.all([job.runOnce(), job.runOnce(), job.runOnce()]);
    expect(results.reduce((s, n) => s + n, 0)).toBe(2);
    for (const { id } of [a, b]) {
      expect(await prisma.requestEvent.count({ where: { requestId: id, type: 'OVERDUE' } })).toBe(
        1,
      );
      expect(
        await prisma.notification.count({
          where: { requestId: id, userId: ids.admin, type: 'COVERAGE_LATE' },
        }),
      ).toBe(1);
    }
  });

  // -------------------------------------------------------------------------
  // 8, 9. Annulation et transitions interdites
  // -------------------------------------------------------------------------

  it('8. annulation par l’admin : motif facultatif ; surveillant libéré, enseignant prévenu', async () => {
    const id = await pending();
    await actOk('admin', id, { action: 'ASSIGN', assigneeId: ids.surveillant });
    expect((await act('surveillant', id, { action: 'CANCEL', reason: 'x' })).status).toBe(403);
    const cancelled = await actOk('admin', id, { action: 'CANCEL' });
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      mainStatus: 'CANCELLED',
      cancelReason: null,
      assignee: null,
    });
    expect(await notificationTypes('surveillant', id)).toEqual(['ASSIGNED', 'COVERAGE_LIFTED']);
    expect(await notificationTypes('enseignante', id)).toEqual(['ASSIGNED', 'CANCELLED']);
    expect(await notificationTypes('remplacant', id)).toEqual([]);
    // Le surveillant est libéré : il peut recevoir une autre affectation.
    expect((await create({ classId: bleu })).status).toBe(201);
  });

  it('9. transitions interdites via l’API : refusées', async () => {
    const { id } = await createOk();
    expect((await act('surveillant', id, { action: 'RELIEVE' })).body.error.code).toBe(
      'INVALID_TRANSITION',
    );
    expect((await act('surveillant', id, { action: 'VALIDATE' })).body.error.code).toBe(
      'INVALID_TRANSITION',
    );
    expect((await act('admin', id, { action: 'DEPART' })).status).toBe(403);
    // Actions retirées ou réservées au système : 400 UNKNOWN_ACTION.
    for (const action of [
      'ACCEPT',
      'WIDEN',
      'RELEASE',
      'EXPIRE',
      'EXPIRE_UNFILLED',
      'RELIEF_ABANDONED',
      'ATTACH_DECLARATION',
      'UPDATE',
      'HACK',
    ]) {
      const res = await act('admin', id, { action });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNKNOWN_ACTION');
    }
    // Version obsolète.
    expect((await act('surveillant', id, { action: 'DEPART', version: 99 })).body.error.code).toBe(
      'STATE_CHANGED',
    );
    // Les routes des demandes de travail refusent les affectations.
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
      await prisma.setting.update({
        where: { key: 'attachmentMaxBytes' },
        data: { value: 10 * 1024 * 1024 },
      });
      settings.invalidate();
    }
    // Photo d'un autre employé : refusée.
    const { id } = await createOk();
    const othersPhoto = await photoId('remplacant');
    const res = await act('surveillant', id, {
      action: 'CONFIRM_PRESENCE',
      photoFileId: othersPhoto,
      qrToken: await qrToken(violet),
    });
    expect(res.status).toBe(400);
  });

  it('10 bis. photo de preuve : accessible à son auteur, aux admins et au super admin seulement', async () => {
    const id = await onDuty('surveillant');
    const detail = await api().get(`/api/coverage/${id}`).set('Cookie', cookies.admin);
    const fileId = detail.body.presences.find(
      (p: { method: string }) => p.method === 'PHOTO',
    ).fileId;
    expect(fileId).toBeTruthy();
    for (const user of ['surveillant', 'admin', 'superadmin']) {
      expect((await api().get(`/api/files/${fileId}`).set('Cookie', cookies[user])).status).toBe(
        200,
      );
    }
    for (const user of ['remplacant', 'autre', 'enseignante']) {
      expect((await api().get(`/api/files/${fileId}`).set('Cookie', cookies[user])).status).toBe(
        404,
      );
    }
    // EXIF retiré par le traitement existant ; l'heure de référence est celle du serveur (CoveragePresence.createdAt).
    const presence = await prisma.coveragePresence.findFirstOrThrow({
      where: { requestId: id, method: 'PHOTO' },
    });
    expect(presence.fileId).toBe(fileId);
  });

  it('11. QR code d’une autre classe refusé ; ancienne version refusée après révocation', async () => {
    const { id } = await createOk();
    const photo = await photoId('surveillant');

    const wrongClass = await act('surveillant', id, {
      action: 'CONFIRM_PRESENCE',
      photoFileId: photo,
      qrToken: await qrToken(bleu),
    });
    expect(wrongClass.status).toBe(422);
    expect(wrongClass.body.error.code).toBe('QR_CLASS_MISMATCH');

    const oldToken = await qrToken(violet);
    const revoked = await api()
      .post(`/api/admin/coverage/classes/${violet}/qr/revoke`)
      .set('Cookie', cookies.superadmin)
      .set('Origin', TEST_ORIGIN);
    expect(revoked.status).toBe(201);
    expect(await prisma.auditLog.count({ where: { action: 'QR_REVOKED', targetId: violet } })).toBe(
      1,
    );
    const old = await act('surveillant', id, {
      action: 'CONFIRM_PRESENCE',
      photoFileId: photo,
      qrToken: oldToken,
    });
    expect(old.body.error.code).toBe('QR_INVALID');

    const forged = await act('surveillant', id, {
      action: 'CONFIRM_PRESENCE',
      photoFileId: photo,
      qrToken: oldToken.replace(/.$/, 'A'),
    });
    expect(forged.body.error.code).toBe('QR_INVALID');

    const ok = await actOk('surveillant', id, {
      action: 'CONFIRM_PRESENCE',
      photoFileId: photo,
      qrToken: await qrToken(violet),
    });
    expect(ok.status).toBe('ON_DUTY');
  });

  it('QR valide mais utilisateur non affecté : refusé ; ouvrir la page ne valide jamais la présence', async () => {
    const { id } = await createOk();
    const token = await qrToken(violet);

    // La page du QR (résolution) n'écrit rien.
    const resolved = await api()
      .post('/api/coverage/presence/resolve')
      .set('Cookie', cookies.surveillant)
      .set('Origin', TEST_ORIGIN)
      .send({ token });
    expect(resolved.status).toBe(200);
    expect(resolved.body).toMatchObject({
      class: { id: violet },
      coverage: { id, status: 'ACCEPTED' },
    });
    expect((await prisma.request.findUniqueOrThrow({ where: { id } })).status).toBe('ACCEPTED');
    expect(await prisma.coveragePresence.count({ where: { requestId: id } })).toBe(0);

    // Un autre surveillant, devant la même classe : refusé.
    const intruder = await act('remplacant', id, {
      action: 'CONFIRM_PRESENCE',
      photoFileId: await photoId('remplacant'),
      qrToken: token,
    });
    expect(intruder.status).toBe(404);
    const resolvedByOther = await api()
      .post('/api/coverage/presence/resolve')
      .set('Cookie', cookies.remplacant)
      .set('Origin', TEST_ORIGIN)
      .send({ token });
    expect(resolvedByOther.body.coverage).toBeNull();

    // POST direct sans les preuves exigées (catégorie : QR + photo) : refusé.
    expect(
      (await act('surveillant', id, { action: 'CONFIRM_PRESENCE', qrToken: token })).body.error
        .code,
    ).toBe('PROOF_REQUIRED');
    expect((await act('surveillant', id, { action: 'CONFIRM_PRESENCE' })).body.error.code).toBe(
      'PROOF_REQUIRED',
    );
    // Non connecté : refusé.
    expect(
      (
        await api()
          .post('/api/coverage/presence/resolve')
          .set('Origin', TEST_ORIGIN)
          .send({ token })
      ).status,
    ).toBe(401);
    expect((await prisma.request.findUniqueOrThrow({ where: { id } })).status).toBe('ACCEPTED');
  });

  // -------------------------------------------------------------------------
  // 12, 13. Tableau de suivi du super administrateur
  // -------------------------------------------------------------------------

  it('12. le tableau du super admin reflète en direct les changements, chiffres conformes aux données', async () => {
    const socket = await connect(cookies.superadmin);
    await pending('2e année Bleu');
    const { id } = await createOk();

    const snapshot = async () =>
      (await api().get('/api/admin/coverage/dashboard').set('Cookie', cookies.superadmin)).body;
    const dbCount = (statuses: string[]) =>
      prisma.request.count({ where: { kind: 'COVERAGE', status: { in: statuses as never } } });

    let board = await snapshot();
    expect(board.counts.open).toBe(await dbCount(['PENDING']));
    expect(board.counts.taken).toBe(await dbCount(['ACCEPTED', 'EN_ROUTE']));
    expect(board.active.map((r: { id: string }) => r.id)).toContain(id);

    const update = nextEvent<{ requestId: string; status: string }>(socket, 'coverage:updated');
    await actOk('surveillant', id, { action: 'DEPART' });
    expect(await update).toMatchObject({ requestId: id, status: 'EN_ROUTE' });

    board = await snapshot();
    expect(board.counts.taken).toBe(await dbCount(['ACCEPTED', 'EN_ROUTE']));
    expect(board.counts.onDuty).toBe(await dbCount(['ON_DUTY', 'RELIEF_PENDING']));
    expect(board.counts.total).toBe(await prisma.request.count({ where: { kind: 'COVERAGE' } }));
    const surveillant = board.employees.find((e: { id: string }) => e.id === ids.surveillant);
    expect(surveillant.currentGuard).toMatchObject({
      requestId: id,
      status: 'EN_ROUTE',
      class: { name: '1ère année Violet' },
    });
    expect(surveillant.available).toBe(false);

    // Filtres et export CSV.
    const filtered = await api()
      .get('/api/admin/coverage/dashboard')
      .query({ classId: bleu })
      .set('Cookie', cookies.superadmin);
    expect(filtered.body.active.every((r: { class: { id: string } }) => r.class.id === bleu)).toBe(
      true,
    );
    const csv = await api().get('/api/admin/coverage/export.csv').set('Cookie', cookies.superadmin);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Référence;Statut;Source;Type;Priorité;Classe');
    expect(csv.text).toContain('1ère année Violet');
  });

  it('13. un surveillant ou un admin n’accède pas aux écrans du super admin ; le module refuse les autres employés', async () => {
    for (const user of ['admin', 'surveillant']) {
      for (const path of ['dashboard', 'export.csv', 'groups', 'classes', `classes/${violet}/qr`]) {
        expect(
          (await api().get(`/api/admin/coverage/${path}`).set('Cookie', cookies[user])).status,
        ).toBe(403);
      }
      const revoke = await api()
        .post(`/api/admin/coverage/classes/${violet}/qr/revoke`)
        .set('Cookie', cookies[user])
        .set('Origin', TEST_ORIGIN);
      expect(revoke.status).toBe(403);
    }
    // Gestion du module : admins seulement (404 pour les autres, FR-023b).
    expect((await api().get('/api/coverage').set('Cookie', cookies.surveillant)).status).toBe(404);
    expect((await api().get('/api/coverage/team').set('Cookie', cookies.surveillant)).status).toBe(
      404,
    );
    expect((await create({}, 'surveillant')).status).toBe(404);
    expect(
      (await api().get('/api/coverage/form-options').set('Cookie', cookies.enseignante)).status,
    ).toBe(404);
  });

  // -------------------------------------------------------------------------
  // Données de référence
  // -------------------------------------------------------------------------

  it('le type d’une catégorie (travail / garde) ne peut pas être modifié, côté serveur ; délais configurables', async () => {
    const res = await api()
      .patch(`/api/admin/categories/${categoryId}`)
      .set('Cookie', cookies.superadmin)
      .set('Origin', TEST_ORIGIN)
      .send({ kind: 'WORK' });
    expect(res.status).toBe(400);
    expect((await prisma.category.findUniqueOrThrow({ where: { id: categoryId } })).kind).toBe(
      'COVERAGE',
    );
    // Délais de prise en charge et d'arrivée configurables (jamais codés en dur).
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
    const snapshot = (await prisma.request.findUniqueOrThrow({ where: { id: created.id } }))
      .rulesSnapshot;
    expect(snapshot).toMatchObject({ takeoverMinutes: 3, arrivalMinutes: 7, proofMode: 'BOTH' });
  });
});
