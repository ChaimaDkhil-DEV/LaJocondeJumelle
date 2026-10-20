import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import {
  clearCoverages,
  createCoverage,
  minutesFrom,
  notificationsOf,
} from '../utils/coverage-fixtures';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * T070 — US3 : l'admin crée une affectation directe (scénarios 1 à 3, FR-019) ; réassignation
 * d'une affectation assignée (FR-008k) ou en cours (relève assignée, FR-008j).
 */
describe('Affectation directe par l’admin (US3)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookie: Record<string, string> = {};
  const id: Record<string, string> = {};
  let violet: string;

  const api = () => request(app.getHttpServer());
  const get = (who: string, path: string) => api().get(path).set('Cookie', cookie[who]);
  const post = (who: string, path: string, body: Record<string, unknown>) =>
    api().post(path).set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).send(body);

  const slot = (start = 10, end = 70) => ({
    startAt: minutesFrom(new Date(), start).toISOString(),
    endAt: minutesFrom(new Date(), end).toISOString(),
  });

  function create(who = 'admin', body: Record<string, unknown> = {}) {
    return post(who, '/api/coverage', {
      clientId: randomUUID(),
      classId: violet,
      type: 'ABSENCE',
      assigneeId: id.surveillant,
      ...slot(),
      ...body,
    });
  }

  async function createOk(body: Record<string, unknown> = {}) {
    const res = await create('admin', body);
    if (res.status !== 201) throw new Error(`Création : ${res.status} ${JSON.stringify(res.body)}`);
    return res.body as { id: string };
  }

  async function act(who: string, requestId: string, body: Record<string, unknown>) {
    const { version } = await prisma.request.findUniqueOrThrow({ where: { id: requestId } });
    return post(who, `/api/coverage/${requestId}/actions`, { version, ...body });
  }

  async function qrToken(classId: string): Promise<string> {
    const res = await get('superadmin', `/api/admin/coverage/classes/${classId}/qr`);
    return new URL(res.body.url).searchParams.get('c')!;
  }

  const types = async (who: string, requestId: string) =>
    (await notificationsOf(prisma, who, requestId)).map((n) => n.type);

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    // Preuve de présence par QR seul : la photo est couverte par coverage.spec.ts.
    await prisma.category.updateMany({ where: { kind: 'COVERAGE' }, data: { proofMode: 'QR' } });
    app = await createTestApp();
    for (const who of [
      'enseignante',
      'admin',
      'superadmin',
      'surveillant',
      'remplacant',
      'surveillant2',
      'reprographie',
    ]) {
      cookie[who] = await loginAs(app, who);
      id[who] = await userId(prisma, who);
    }
    violet = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '1ère année Violet' } }))
      .id;
  });

  beforeEach(() => clearCoverages(prisma));

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('création (scénario 1)', () => {
    it('naît « assignée », source création directe ; surveillant notifié ; tracée ; renvoi idempotent', async () => {
      const clientId = randomUUID();
      const res = await create('admin', {
        clientId,
        reason: 'Appel de l’enseignante',
        note: 'Cahier de textes sur le bureau',
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        status: 'ACCEPTED',
        mainStatus: 'ASSIGNED',
        source: 'ADMIN_DIRECT',
        type: 'ABSENCE',
        teacher: null,
        assignee: { id: id.surveillant },
        requester: { id: id.admin },
        reason: 'Appel de l’enseignante',
        view: 'ADMIN',
      });
      expect(await types('surveillant', res.body.id)).toEqual(['ASSIGNED']);
      const reminders = await prisma.coverageReminder.findMany({
        where: { requestId: res.body.id },
      });
      expect(reminders.map((r) => r.kind)).toEqual(['END_OF_SLOT']);
      const events = await prisma.requestEvent.findMany({
        where: { requestId: res.body.id },
        orderBy: { seq: 'asc' },
      });
      expect(events.map((e) => e.type)).toEqual(['CREATED', 'STATUS_CHANGED', 'ASSIGNED']);
      expect(
        await prisma.auditLog.count({
          where: { action: 'COVERAGE_CREATED', targetId: res.body.id },
        }),
      ).toBe(1);

      const again = await create('admin', { clientId });
      expect(again.status).toBe(200);
      expect(again.body.id).toBe(res.body.id);
    });

    it('enseignant facultatif, membre du groupe Enseignants', async () => {
      const ok = await create('admin', { teacherId: id.enseignante });
      expect(ok.status).toBe(201);
      expect(ok.body.teacher).toMatchObject({ id: id.enseignante });
      const ko = await create('admin', { teacherId: id.reprographie, assigneeId: id.remplacant });
      expect(ko.status).toBe(400);
      expect(ko.body.error.details.fields[0].field).toBe('teacherId');
    });

    it.each([
      ['type', { type: undefined }],
      ['endAt', { endAt: undefined }],
      ['assigneeId', { assigneeId: undefined }],
    ])('champ obligatoire : %s', async (field, body) => {
      const res = await create('admin', body);
      expect(res.status).toBe(400);
      expect(res.body.error.details.fields.map((f: { field: string }) => f.field)).toContain(field);
    });

    it.each([
      ['groupIds', []],
      ['categoryId', randomUUID()],
      ['estimatedMinutes', 60],
      ['absentTeacher', 'M. Martin'],
      ['force', true],
    ])('champ retiré refusé : %s', async (field, value) => {
      const res = await create('admin', { [field]: value });
      expect(res.status).toBe(400);
    });

    it('créneau incohérent refusé', async () => {
      const res = await create('admin', slot(60, 30));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_RANGE');
    });
  });

  describe('surveillants proposés (scénario 2)', () => {
    it('surveillant déjà affecté sur un créneau qui chevauche : non proposé, refusé sans forçage', async () => {
      await createCoverage(prisma, {
        status: 'ACCEPTED',
        source: 'ADMIN_DIRECT',
        className: '2e année Bleu',
        startAt: minutesFrom(new Date(), 0),
        plannedEndAt: minutesFrom(new Date(), 40),
        assignee: 'surveillant',
        teacher: null,
      });
      const { startAt, endAt } = slot();
      const res = await get(
        'admin',
        `/api/coverage/candidates?classId=${violet}&startAt=${encodeURIComponent(startAt)}&endAt=${encodeURIComponent(endAt)}`,
      );
      expect(res.status).toBe(200);
      const byId = new Map(
        (
          res.body as Array<{
            id: string;
            available: boolean;
            reason: string | null;
            sameFloor: boolean;
          }>
        ).map((c) => [c.id, c]),
      );
      expect(byId.get(id.surveillant)).toMatchObject({ available: false, reason: 'ON_GUARD' });
      expect(byId.get(id.remplacant)).toMatchObject({ available: true, sameFloor: true });
      expect(byId.get(id.surveillant2)).toMatchObject({ available: true, sameFloor: false });
      // Étage de la classe d'abord, disponibles d'abord.
      expect(res.body[0].id).toBe(id.remplacant);

      const refused = await create('admin');
      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe('NOT_AVAILABLE');
      // Créneau qui ne chevauche pas : proposé et assignable.
      expect((await create('admin', slot(60, 120))).status).toBe(201);
    });

    it('paramètres requis ; réservé aux admins', async () => {
      expect((await get('admin', `/api/coverage/candidates?classId=${violet}`)).status).toBe(400);
      const { startAt, endAt } = slot();
      const query = `/api/coverage/candidates?classId=${violet}&startAt=${encodeURIComponent(startAt)}&endAt=${encodeURIComponent(endAt)}`;
      expect((await get('surveillant', query)).status).toBe(404);
    });
  });

  describe('refus (scénario 3)', () => {
    it.each(['enseignante', 'surveillant'])('%s : refusé et journalisé', async (who) => {
      const before = await prisma.auditLog.count({
        where: { action: 'ACCESS_DENIED', actorId: id[who] },
      });
      const res = await create(who);
      expect(res.status).toBe(404);
      expect(
        await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId: id[who] } }),
      ).toBe(before + 1);
      expect(await prisma.request.count({ where: { kind: 'COVERAGE' } })).toBe(0);
    });
  });

  describe('réassignation (FR-008j, FR-008k)', () => {
    it('assignée : statut inchangé, ancien libéré, nouveau notifié, ancien et nouveau tracés', async () => {
      const { id: coverageId } = await createOk();
      const res = await act('admin', coverageId, { action: 'REASSIGN', assigneeId: id.remplacant });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ACCEPTED', assignee: { id: id.remplacant } });
      expect(await types('surveillant', coverageId)).toEqual(['ASSIGNED', 'COVERAGE_LIFTED']);
      expect(await types('remplacant', coverageId)).toEqual(['ASSIGNED']);
      const event = await prisma.requestEvent.findFirstOrThrow({
        where: { requestId: coverageId, type: 'REASSIGNED' },
      });
      expect(event).toMatchObject({
        fromValue: { assigneeId: id.surveillant },
        toValue: { assigneeId: id.remplacant },
      });
      // Rappel de clôture reporté sur le nouveau surveillant.
      const open = await prisma.coverageReminder.findMany({
        where: { requestId: coverageId, resolvedAt: null },
      });
      expect(open).toMatchObject([{ kind: 'END_OF_SLOT', targetUserId: id.remplacant }]);
    });

    it('en cours : relève assignée au nouveau ; l’ancien libéré à sa présence ; « en cours » conservé', async () => {
      const { id: coverageId } = await createOk(slot(-5, 60));
      expect(
        (
          await act('surveillant', coverageId, {
            action: 'CONFIRM_PRESENCE',
            qrToken: await qrToken(violet),
          })
        ).status,
      ).toBe(200);
      const res = await act('admin', coverageId, { action: 'REASSIGN', assigneeId: id.remplacant });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'ON_DUTY',
        mainStatus: 'IN_PROGRESS',
        assignee: { id: id.surveillant },
      });
      const relief = await prisma.request.findFirstOrThrow({
        where: { coverage: { reliefForId: coverageId } },
      });
      expect(relief).toMatchObject({ status: 'ACCEPTED', assigneeId: id.remplacant });
      expect(await types('remplacant', relief.id)).toEqual(['ASSIGNED']);

      expect(
        (
          await act('remplacant', relief.id, {
            action: 'CONFIRM_PRESENCE',
            qrToken: await qrToken(violet),
          })
        ).status,
      ).toBe(200);
      const origin = await prisma.request.findUniqueOrThrow({ where: { id: coverageId } });
      expect(origin.status).toMatch(/^(DONE|CLOSED)$/);
      const relieved = await prisma.requestEvent.findMany({
        where: { requestId: coverageId, type: 'STATUS_CHANGED' },
        orderBy: { seq: 'asc' },
      });
      expect(relieved.at(-1)?.actorId).toBeNull(); // relève système à la présence du nouveau
      expect(await prisma.request.findUniqueOrThrow({ where: { id: relief.id } })).toMatchObject({
        status: 'ON_DUTY',
      });
    });

    it('réassignation vers un surveillant indisponible refusée', async () => {
      const { id: coverageId } = await createOk();
      await prisma.user.update({
        where: { id: id.remplacant },
        data: { availability: 'UNAVAILABLE' },
      });
      const res = await act('admin', coverageId, { action: 'REASSIGN', assigneeId: id.remplacant });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('NOT_AVAILABLE');
    });
  });
});
