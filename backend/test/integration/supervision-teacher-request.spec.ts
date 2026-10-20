import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { addDays, atLocalTime, localDate, localTime } from '../../src/common/school-time';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { minutesFrom } from '../utils/coverage-fixtures';
import { useMiddayTimezone } from '../utils/school-timezone';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * T049 — US1 : l'enseignant signale à l'avance un retard ou une absence ; l'admin assigne un
 * surveillant disponible (scénarios 1 à 7, FR-008g, FR-012 à FR-014, FR-017a, FR-021, FR-023c).
 */
describe('Signalement d’un retard ou d’une absence par un enseignant (US1)', () => {
  const prisma = new PrismaClient();
  /** Fuseau de l'école pour la suite (voir useMiddayTimezone). */
  let TZ = '';
  let restoreTz = () => undefined as void;
  let app: INestApplication;
  const cookie: Record<string, string> = {};
  const id: Record<string, string> = {};
  let violet: string;
  let bleu: string;

  const api = () => request(app.getHttpServer());
  const get = (who: string, path: string) => api().get(path).set('Cookie', cookie[who]);
  const send = (
    who: string,
    method: 'post' | 'patch',
    path: string,
    body: Record<string, unknown>,
  ) => api()[method](path).set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).send(body);

  /** Plage du jour, en heures locales de l'école, à partir de maintenant. */
  function slot(startInMinutes: number, endInMinutes: number) {
    const now = new Date();
    const start = minutesFrom(now, startInMinutes);
    const end = minutesFrom(now, endInMinutes);
    return {
      date: localDate(start, TZ),
      startTime: localTime(start, TZ),
      endTime: localTime(end, TZ),
    };
  }

  /** Plage de demain matin (8 h – 9 h locales). */
  const tomorrow = () => ({
    date: addDays(localDate(new Date(), TZ), 1),
    startTime: '08:00',
    endTime: '09:00',
  });

  function create(who = 'enseignante', body: Record<string, unknown> = {}) {
    return send(who, 'post', '/api/coverage/teacher-requests', {
      clientId: randomUUID(),
      type: 'LATENESS',
      classId: violet,
      ...tomorrow(),
      ...body,
    });
  }

  async function createOk(body: Record<string, unknown> = {}, who = 'enseignante') {
    const res = await create(who, body);
    if (res.status !== 201)
      throw new Error(`Signalement : ${res.status} ${JSON.stringify(res.body)}`);
    return res.body as { id: string; version: number };
  }

  async function act(who: string, requestId: string, body: Record<string, unknown>) {
    const { version } = await prisma.request.findUniqueOrThrow({ where: { id: requestId } });
    return send(who, 'post', `/api/coverage/${requestId}/actions`, { version, ...body });
  }

  async function notifications(who: string, requestId: string): Promise<string[]> {
    const rows = await prisma.notification.findMany({
      where: { userId: id[who], requestId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((n) => n.type);
  }

  async function denials(who: string): Promise<number> {
    return prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId: id[who] } });
  }

  beforeAll(async () => {
    // Créneaux « du jour » sans passage de minuit, quelle que soit l'heure d'exécution.
    ({ tz: TZ, restore: restoreTz } = useMiddayTimezone());
    await resetDatabase(prisma);
    await seedDemo(prisma);
    // Une seconde enseignante, membre du groupe Enseignants.
    const { passwordHash } = await prisma.user.findUniqueOrThrow({
      where: { username: 'enseignante' },
    });
    const collegue = await prisma.user.create({
      data: {
        username: 'collegue',
        displayName: 'Collègue',
        role: 'EMPLOYEE',
        passwordHash,
        mustChangePassword: false,
      },
    });
    const teachers = await prisma.employeeGroup.findUniqueOrThrow({
      where: { systemKey: 'TEACHERS' },
    });
    await prisma.employeeGroupMember.create({
      data: { groupId: teachers.id, userId: collegue.id },
    });
    app = await createTestApp();
    for (const who of [
      'enseignante',
      'collegue',
      'admin',
      'superadmin',
      'surveillant',
      'remplacant',
      'reprographie',
    ]) {
      cookie[who] = await loginAs(app, who);
      id[who] = await userId(prisma, who);
    }
    violet = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '1ère année Violet' } }))
      .id;
    bleu = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '2e année Bleu' } })).id;
  });

  afterAll(async () => {
    restoreTz();
    await app.close();
    await prisma.$disconnect();
  });

  describe('création (scénarios 1 à 3, FR-012, FR-013)', () => {
    it('1. enregistré « en attente », source demande enseignant, admins notifiés ; renvoi idempotent', async () => {
      const clientId = randomUUID();
      const res = await create('enseignante', { clientId, reason: 'Rendez-vous médical' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        status: 'PENDING',
        mainStatus: 'PENDING',
        source: 'TEACHER_REQUEST',
        type: 'LATENESS',
        view: 'TEACHER',
        reason: 'Rendez-vous médical',
        class: { id: violet },
        floor: { name: '1er étage' },
        teacher: { id: id.enseignante },
        requester: { id: id.enseignante },
        assignee: null,
        allowedActions: ['UPDATE', 'WITHDRAW'],
      });
      expect(res.body.startAt).toBe(atLocalTime(tomorrow().date, '08:00', TZ).toISOString());
      expect(res.body.plannedEndAt).toBe(atLocalTime(tomorrow().date, '09:00', TZ).toISOString());
      expect(await notifications('admin', res.body.id)).toEqual(['COVERAGE_REQUESTED']);
      const events = await prisma.requestEvent.findMany({
        where: { requestId: res.body.id },
        orderBy: { seq: 'asc' },
      });
      expect(events.map((e) => e.type)).toEqual(['CREATED', 'STATUS_CHANGED']);
      expect(JSON.stringify(events.map((e) => [e.fromValue, e.toValue, e.comment]))).not.toMatch(
        /Rendez-vous/,
      ); // jamais de motif dans l'historique (R5)
      const reminders = await prisma.coverageReminder.findMany({
        where: { requestId: res.body.id },
      });
      expect(reminders.map((r) => r.kind).sort()).toEqual(['MORNING', 'TAKEOVER']);

      const again = await create('enseignante', { clientId, reason: 'Rendez-vous médical' });
      expect(again.status).toBe(200);
      expect(again.body.id).toBe(res.body.id);
    });

    it('durée au lieu de l’heure de fin', async () => {
      const res = await create('enseignante', {
        endTime: undefined,
        durationMinutes: 45,
        type: 'ABSENCE',
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ type: 'ABSENCE', estimatedMinutes: 45 });
    });

    it('2. champs manquants signalés un à un', async () => {
      const res = await send('enseignante', 'post', '/api/coverage/teacher-requests', {
        clientId: randomUUID(),
        type: 'LATENESS',
      });
      expect(res.status).toBe(400);
      const fields = res.body.error.details.fields.map((f: { field: string }) => f.field);
      expect(fields).toEqual(expect.arrayContaining(['classId', 'date', 'startTime']));
      const noEnd = await create('enseignante', { endTime: undefined });
      expect(noEnd.status).toBe(400);
      expect(noEnd.body.error.details.fields.map((f: { field: string }) => f.field)).toContain(
        'endTime',
      );
      const both = await create('enseignante', { durationMinutes: 30 });
      expect(both.status).toBe(400);
      expect((await create('enseignante', { type: 'EMPTY_CLASS' })).status).toBe(400);
    });

    it('3. date autre qu’aujourd’hui ou demain refusée, avec la règle', async () => {
      const today = localDate(new Date(), TZ);
      for (const date of [addDays(today, 2), addDays(today, -1)]) {
        const res = await create('enseignante', { date });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatchObject({
          code: 'INVALID_DATE',
          message: 'La date doit être aujourd’hui ou demain.',
        });
      }
    });

    it('plage invalide : fin avant le début, ou plage déjà entièrement passée', async () => {
      const reversed = await create('enseignante', { startTime: '10:00', endTime: '09:00' });
      expect(reversed.body.error.code).toBe('INVALID_RANGE');
      const past = slot(-90, -60);
      if (past.date === localDate(new Date(), TZ) && past.startTime < past.endTime) {
        expect((await create('enseignante', past)).body.error.code).toBe('INVALID_RANGE');
      }
      // Plage commencée mais pas finie : acceptée (sans délai minimum).
      const ongoing = slot(-10, 50);
      if (ongoing.date === localDate(new Date(), TZ) && ongoing.startTime < ongoing.endTime) {
        expect((await create('enseignante', ongoing)).status).toBe(201);
      }
    });

    it('classe désactivée refusée', async () => {
      await prisma.schoolClass.update({ where: { id: bleu }, data: { active: false } });
      try {
        const res = await create('enseignante', { classId: bleu });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('CLASS_INACTIVE');
      } finally {
        await prisma.schoolClass.update({ where: { id: bleu }, data: { active: true } });
      }
    });

    it('un compte hors du groupe Enseignants ne signale pas : 404, refus journalisé', async () => {
      for (const who of ['reprographie', 'surveillant']) {
        const before = await denials(who);
        expect((await create(who)).status).toBe(404);
        expect(await denials(who)).toBe(before + 1);
      }
    });
  });

  describe('modification et retrait en attente (FR-008g, FR-014)', () => {
    it('modification par l’auteur : tracée, admins notifiés, échéances recalculées ; version obsolète refusée', async () => {
      const created = await createOk({ reason: 'Train' });
      const before = await prisma.coverageReminder.findFirstOrThrow({
        where: { requestId: created.id, kind: 'TAKEOVER', resolvedAt: null },
      });
      const res = await send(
        'enseignante',
        'patch',
        `/api/coverage/${created.id}/teacher-request`,
        {
          version: created.version,
          classId: bleu,
          startTime: '10:00',
          endTime: '11:00',
          reason: 'Train retardé',
        },
      );
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        class: { id: bleu },
        floor: { name: '2e étage' },
        reason: 'Train retardé',
        status: 'PENDING',
      });
      const event = await prisma.requestEvent.findFirstOrThrow({
        where: { requestId: created.id, type: 'UPDATED' },
      });
      expect(event.actorId).toBe(id.enseignante);
      expect(event.toValue).toMatchObject({ classId: bleu, reasonChanged: true });
      expect(JSON.stringify([event.fromValue, event.toValue, event.comment])).not.toMatch(/Train/);
      expect(await notifications('admin', created.id)).toEqual([
        'COVERAGE_REQUESTED',
        'COVERAGE_UPDATED',
      ]);
      const after = await prisma.coverageReminder.findFirstOrThrow({
        where: { requestId: created.id, kind: 'TAKEOVER', resolvedAt: null },
      });
      expect(after.id).not.toBe(before.id);
      expect(after.dueAt.getTime()).toBeGreaterThan(before.dueAt.getTime());

      const stale = await send(
        'enseignante',
        'patch',
        `/api/coverage/${created.id}/teacher-request`,
        { version: created.version, reason: 'x' },
      );
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('STATE_CHANGED');
    });

    it('une autre enseignante ne voit ni ne modifie la demande', async () => {
      const created = await createOk();
      expect((await get('collegue', `/api/coverage/${created.id}`)).status).toBe(404);
      const res = await send('collegue', 'patch', `/api/coverage/${created.id}/teacher-request`, {
        version: created.version,
        reason: 'x',
      });
      expect(res.status).toBe(404);
      const mine = await get('collegue', '/api/coverage/my-requests');
      expect(mine.status).toBe(200);
      expect(mine.body.map((r: { id: string }) => r.id)).not.toContain(created.id);
      expect(
        (await get('enseignante', '/api/coverage/my-requests')).body.map(
          (r: { id: string }) => r.id,
        ),
      ).toContain(created.id);
    });

    it('retrait par l’auteur (motif facultatif) : annulée, admins prévenus', async () => {
      const created = await createOk();
      const res = await act('enseignante', created.id, { action: 'WITHDRAW' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'CANCELLED', mainStatus: 'CANCELLED' });
      expect(await notifications('admin', created.id)).toEqual(['COVERAGE_REQUESTED', 'CANCELLED']);
      expect(
        await prisma.coverageReminder.count({ where: { requestId: created.id, resolvedAt: null } }),
      ).toBe(0);
    });
  });

  describe('assignation par l’admin (scénarios 4, 5, 7 ; FR-008e, FR-017a)', () => {
    it('5. assignation : « assignée », surveillant et enseignant notifiés, tracée ; plus de modification ni de retrait', async () => {
      const created = await createOk();
      const candidates = await get('admin', `/api/coverage/${created.id}/candidates`);
      expect(candidates.body.map((c: { displayName: string }) => c.displayName)).toEqual([
        'Remplaçante',
        'Surveillant',
        'Surveillant 2e étage',
      ]);

      const res = await act('admin', created.id, { action: 'ASSIGN', assigneeId: id.surveillant });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'ACCEPTED',
        mainStatus: 'ASSIGNED',
        assignee: { id: id.surveillant },
      });
      expect(await notifications('surveillant', created.id)).toEqual(['ASSIGNED']);
      expect(await notifications('enseignante', created.id)).toEqual(['ASSIGNED']);
      const assigned = await prisma.requestEvent.findFirstOrThrow({
        where: { requestId: created.id, type: 'ASSIGNED' },
      });
      expect(assigned).toMatchObject({
        actorId: id.admin,
        toValue: { assigneeId: id.surveillant },
      });

      const patch = await send(
        'enseignante',
        'patch',
        `/api/coverage/${created.id}/teacher-request`,
        { version: res.body.version, reason: 'x' },
      );
      expect(patch.status).toBe(409);
      expect(patch.body.error.code).toBe('NOT_PENDING');
      const withdraw = await act('enseignante', created.id, { action: 'WITHDRAW' });
      expect(withdraw.status).toBe(409);
      expect(withdraw.body.error.code).toBe('NOT_PENDING');
    });

    it('4. un surveillant affecté sur un créneau qui chevauche n’est plus proposé comme disponible', async () => {
      const first = await createOk({ startTime: '13:00', endTime: '14:00' });
      await act('admin', first.id, { action: 'ASSIGN', assigneeId: id.remplacant });
      const second = await createOk({ startTime: '13:30', endTime: '14:30', classId: bleu });
      const candidates = await get('admin', `/api/coverage/${second.id}/candidates`);
      expect(candidates.body.find((c: { id: string }) => c.id === id.remplacant)).toMatchObject({
        available: false,
        reason: 'ON_GUARD',
      });
    });

    it('réassignation : ancien surveillant levé, nouveau et enseignant notifiés, ancien et nouveau tracés (FR-008k)', async () => {
      const created = await createOk({ startTime: '15:00', endTime: '16:00' });
      await act('admin', created.id, { action: 'ASSIGN', assigneeId: id.surveillant });
      const res = await act('admin', created.id, { action: 'REASSIGN', assigneeId: id.remplacant });
      expect(res.body).toMatchObject({ status: 'ACCEPTED', assignee: { id: id.remplacant } });
      expect(await notifications('surveillant', created.id)).toEqual([
        'ASSIGNED',
        'COVERAGE_LIFTED',
      ]);
      expect(await notifications('remplacant', created.id)).toEqual(['ASSIGNED']);
      expect(await notifications('enseignante', created.id)).toEqual(['ASSIGNED', 'ASSIGNED']);
      const event = await prisma.requestEvent.findFirstOrThrow({
        where: { requestId: created.id, type: 'REASSIGNED' },
      });
      expect(event).toMatchObject({
        actorId: id.admin,
        fromValue: { assigneeId: id.surveillant },
        toValue: { assigneeId: id.remplacant },
      });
    });

    it('annulation par l’admin : l’enseignant est prévenu', async () => {
      const created = await createOk();
      const res = await act('admin', created.id, { action: 'CANCEL' });
      expect(res.body.status).toBe('CANCELLED');
      expect(await notifications('enseignante', created.id)).toEqual(['CANCELLED']);
    });

    it('7. l’enseignant et le surveillant ne peuvent pas assigner ; refus journalisés', async () => {
      const created = await createOk();
      const teacherBefore = await denials('enseignante');
      const teacher = await act('enseignante', created.id, {
        action: 'ASSIGN',
        assigneeId: id.surveillant,
      });
      expect(teacher.status).toBe(403);
      expect(await denials('enseignante')).toBe(teacherBefore + 1);
      const supervisorBefore = await denials('surveillant');
      expect(
        (await act('surveillant', created.id, { action: 'ASSIGN', assigneeId: id.surveillant }))
          .status,
      ).toBe(404);
      expect(await denials('surveillant')).toBe(supervisorBefore + 1);
    });
  });

  describe('vues et parcours complet (scénario 6, FR-021, FR-023c)', () => {
    it('le surveillant ne voit jamais le motif ; l’enseignant voit le sien et le nom du surveillant', async () => {
      const created = await createOk({
        reason: 'Motif personnel',
        startTime: '17:00',
        endTime: '18:00',
      });
      await act('admin', created.id, { action: 'ASSIGN', assigneeId: id.surveillant });
      const supervisor = await get('surveillant', `/api/coverage/${created.id}`);
      expect(supervisor.body).toMatchObject({
        view: 'SUPERVISOR',
        reason: null,
        class: { id: violet },
        floor: { name: '1er étage' },
        type: 'LATENESS',
      });
      expect(JSON.stringify(supervisor.body)).not.toMatch(/Motif personnel/);
      const teacher = await get('enseignante', `/api/coverage/${created.id}`);
      expect(teacher.body).toMatchObject({
        view: 'TEACHER',
        reason: 'Motif personnel',
        assignee: { displayName: 'Surveillant' },
        history: null,
      });
      const admin = await get('admin', `/api/coverage/${created.id}`);
      expect(admin.body).toMatchObject({ view: 'ADMIN', reason: 'Motif personnel' });
    });

    it('6. en cours puis terminée : historique (qui, quand, classe) et durée de présence à fin', async () => {
      const created = await createOk(slot(5, 65));
      await act('admin', created.id, { action: 'ASSIGN', assigneeId: id.surveillant });
      // Preuve QR seule pour ce parcours.
      await prisma.request.update({
        where: { id: created.id },
        data: {
          rulesSnapshot: {
            kind: 'COVERAGE',
            proofMode: 'QR',
            finalValidation: false,
            takeoverMinutes: 2,
            arrivalMinutes: 5,
          },
        },
      });
      const qr = await get('superadmin', `/api/admin/coverage/classes/${violet}/qr`);
      const token = new URL(qr.body.url).searchParams.get('c')!;
      const onDuty = await act('surveillant', created.id, {
        action: 'CONFIRM_PRESENCE',
        qrToken: token,
      });
      expect(onDuty.body).toMatchObject({ status: 'ON_DUTY', mainStatus: 'IN_PROGRESS' });
      const done = await act('surveillant', created.id, { action: 'RELIEVE' });
      expect(done.body).toMatchObject({ mainStatus: 'DONE' });
      expect(typeof done.body.durationMinutes).toBe('number');
      const detail = await prisma.coverageDetail.findUniqueOrThrow({
        where: { requestId: created.id },
      });
      expect(detail.presenceAt).not.toBeNull();
      expect(detail.relievedAt).not.toBeNull();
      const history = await get('admin', `/api/coverage/${created.id}`);
      const statuses = history.body.history
        .filter((e: { type: string }) => e.type === 'STATUS_CHANGED')
        .map((e: { toValue: { status: string }; actor: { id: string } | null }) => [
          e.toValue.status,
          e.actor?.id ?? null,
        ]);
      expect(statuses).toEqual([
        ['PENDING', id.enseignante],
        ['ACCEPTED', id.admin],
        ['ON_DUTY', id.surveillant],
        ['DONE', id.surveillant],
        ['CLOSED', null],
      ]);
    });
  });
});
