import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { CoverageRemindersJob } from '../../src/scheduler/coverage-reminders.job';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import {
  clearCoverages,
  createCoverage,
  minutesFrom,
  notificationsOf,
} from '../utils/coverage-fixtures';
import { useMiddayTimezone } from '../utils/school-timezone';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * T061 — US2 : un surveillant déclare une classe vide pendant son tour (scénarios 1 à 4,
 * FR-008h, FR-015 à FR-015j, R6, R10).
 */
describe('Déclaration d’une classe vide par un surveillant (US2)', () => {
  let restoreTz = () => undefined as void;
  const prisma = new PrismaClient();
  let app: INestApplication;
  let job: CoverageRemindersJob;
  const cookie: Record<string, string> = {};
  const id: Record<string, string> = {};
  let violet: string;
  let bleu: string;

  const api = () => request(app.getHttpServer());
  const get = (who: string, path: string) => api().get(path).set('Cookie', cookie[who]);
  const post = (who: string, path: string, body: Record<string, unknown>) =>
    api().post(path).set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).send(body);

  function declare(who = 'surveillant', body: Record<string, unknown> = {}) {
    return post(who, '/api/coverage/empty-class', {
      clientId: randomUUID(),
      classId: violet,
      teacherId: null,
      ...body,
    });
  }

  async function declareOk(who = 'surveillant', body: Record<string, unknown> = {}) {
    const res = await declare(who, body);
    if (res.status !== 201)
      throw new Error(`Déclaration : ${res.status} ${JSON.stringify(res.body)}`);
    return res.body as {
      outcome: string;
      coverage: { id: string; version: number } | null;
      assignedTo: { id: string } | null;
      doubleAssignment: boolean;
    };
  }

  async function act(who: string, requestId: string, body: Record<string, unknown>) {
    const { version } = await prisma.request.findUniqueOrThrow({ where: { id: requestId } });
    return post(who, `/api/coverage/${requestId}/actions`, { version, ...body });
  }

  const types = async (who: string, requestId?: string) =>
    (await notificationsOf(prisma, who, requestId)).map((n) => n.type);

  /** Disponibilité d'un surveillant vue par l'admin (candidats d'une demande en attente du jour). */
  async function availabilityOf(who: string) {
    const pending = await createCoverage(prisma, {
      status: 'PENDING',
      className: '2e année Bleu',
      startAt: minutesFrom(new Date(), 5),
      plannedEndAt: minutesFrom(new Date(), 50),
      teacher: null,
    });
    const res = await get('admin', `/api/coverage/${pending}/candidates`);
    expect(res.status).toBe(200);
    const candidate = (
      res.body as Array<{ id: string; available: boolean; reason: string | null }>
    ).find((c) => c.id === id[who]);
    await prisma.coverageReminder.deleteMany({ where: { requestId: pending } });
    await prisma.coverageDetail.delete({ where: { requestId: pending } });
    await prisma.request.delete({ where: { id: pending } });
    return candidate;
  }

  async function adminList() {
    const res = await get('admin', '/api/coverage');
    expect(res.status).toBe(200);
    return res.body as Array<{ id: string; alerts: string[] }>;
  }

  /** Demande d'enseignante sur la classe, en cours de journée. */
  const teacherRequest = (
    status: 'PENDING' | 'ACCEPTED' | 'ON_DUTY',
    assignee: string | null = null,
  ) =>
    createCoverage(prisma, {
      status,
      startAt: minutesFrom(new Date(), -5),
      plannedEndAt: minutesFrom(new Date(), 55),
      assignee,
    });

  beforeAll(async () => {
    // Créneaux « du jour » sans passage de minuit, quelle que soit l'heure d'exécution.
    ({ restore: restoreTz } = useMiddayTimezone());
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    job = app.get(CoverageRemindersJob);
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
    bleu = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '2e année Bleu' } })).id;
  });

  beforeEach(() => clearCoverages(prisma));

  afterAll(async () => {
    restoreTz();
    await app.close();
    await prisma.$disconnect();
  });

  describe('création directe (scénarios 1 et 2, FR-015, FR-015a)', () => {
    it('1. « en cours » au nom du déclarant, sans enseignant, admins alertés ; renvoi idempotent', async () => {
      const clientId = randomUUID();
      const res = await declare('surveillant', { clientId });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        outcome: 'CREATED',
        doubleAssignment: false,
        assignedTo: { id: id.surveillant },
        coverage: {
          status: 'ON_DUTY',
          mainStatus: 'IN_PROGRESS',
          source: 'SUPERVISOR_REPORT',
          type: 'EMPTY_CLASS',
          view: 'SUPERVISOR',
          class: { id: violet },
          floor: { name: '1er étage' },
          teacher: null,
          assignee: { id: id.surveillant },
        },
      });
      expect(res.body.coverage.reason).toBeNull(); // jamais de motif côté surveillant (FR-023c)
      const coverageId = res.body.coverage.id as string;
      const detail = await prisma.coverageDetail.findUniqueOrThrow({
        where: { requestId: coverageId },
      });
      expect(detail.presenceAt).not.toBeNull();
      expect(detail.plannedEndAt).toBeNull(); // jusqu'à la clôture
      const reminders = await prisma.coverageReminder.findMany({
        where: { requestId: coverageId },
      });
      expect(reminders.map((r) => r.kind)).toEqual(['END_OF_SLOT']);
      expect(await notificationsOf(prisma, 'admin', coverageId)).toEqual([
        { type: 'COVERAGE_EMPTY_CLASS', priority: 'URGENT' },
      ]);
      expect(await types('surveillant', coverageId)).toEqual([]);

      const again = await declare('surveillant', { clientId });
      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({ outcome: 'CREATED', coverage: { id: coverageId } });
      expect(await prisma.request.count({ where: { kind: 'COVERAGE' } })).toBe(1);
    });

    it('2. clôture par le surveillant : « terminée », heure de fin, de nouveau disponible', async () => {
      const { coverage } = await declareOk();
      expect((await availabilityOf('surveillant'))?.available).toBe(false);
      const res = await act('surveillant', coverage!.id, { action: 'RELIEVE' });
      expect(res.status).toBe(200);
      const row = await prisma.request.findUniqueOrThrow({
        where: { id: coverage!.id },
        include: { coverage: true },
      });
      expect(row.status).toMatch(/^(DONE|CLOSED)$/); // « terminée » (clôture automatique sans validation finale)
      expect(row.coverage!.relievedAt).not.toBeNull();
      expect((await availabilityOf('surveillant'))?.available).toBe(true);
    });

    it('enseignant facultatif, choisi dans le groupe Enseignants ; sinon refusé', async () => {
      const ok = await declareOk('surveillant', { teacherId: id.enseignante });
      expect(
        await prisma.coverageDetail.findUniqueOrThrow({ where: { requestId: ok.coverage!.id } }),
      ).toMatchObject({
        teacherId: id.enseignante,
      });
      const res = await declare('surveillant2', { classId: bleu, teacherId: id.reprographie });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.fields[0].field).toBe('teacherId');
      const missing = await post('surveillant2', '/api/coverage/empty-class', {
        clientId: randomUUID(),
      });
      expect(missing.status).toBe(400);
      expect(missing.body.error.details.fields.map((f: { field: string }) => f.field)).toContain(
        'classId',
      );
    });

    it('non-surveillant : 404 journalisé ; classe désactivée refusée', async () => {
      const before = await prisma.auditLog.count({
        where: { action: 'ACCESS_DENIED', actorId: id.enseignante },
      });
      expect((await declare('enseignante')).status).toBe(404);
      expect(
        await prisma.auditLog.count({
          where: { action: 'ACCESS_DENIED', actorId: id.enseignante },
        }),
      ).toBe(before + 1);
      await prisma.schoolClass.update({ where: { id: bleu }, data: { active: false } });
      try {
        const res = await declare('surveillant2', { classId: bleu });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('CLASS_INACTIVE');
      } finally {
        await prisma.schoolClass.update({ where: { id: bleu }, data: { active: true } });
      }
    });

    it('QR facultatif : enregistré comme présence (R10) ; QR d’une autre classe refusé', async () => {
      const qr = await get('superadmin', `/api/admin/coverage/classes/${violet}/qr`);
      const token = new URL(qr.body.url).searchParams.get('c')!;
      const { coverage } = await declareOk('surveillant', { qrToken: token });
      const presences = await prisma.coveragePresence.findMany({
        where: { requestId: coverage!.id },
      });
      expect(presences).toMatchObject([{ userId: id.surveillant, method: 'QR' }]);
      const mismatch = await declare('surveillant2', { classId: bleu, qrToken: token });
      expect(mismatch.status).toBe(422);
      expect(mismatch.body.error.code).toBe('QR_CLASS_MISMATCH');
      expect(
        (await declare('surveillant2', { classId: bleu, qrToken: 'faux' })).body.error.code,
      ).toBe('QR_INVALID');
    });
  });

  describe('surveillant déjà occupé (scénario 3, FR-015j)', () => {
    it('affectation demain : pas une double affectation (fin inconnue = fin de journée, constat T085)', async () => {
      const tomorrow = minutesFrom(new Date(), 24 * 60);
      const planned = await createCoverage(prisma, {
        status: 'ACCEPTED',
        source: 'ADMIN_DIRECT',
        className: '2e année Bleu',
        startAt: tomorrow,
        plannedEndAt: minutesFrom(tomorrow, 60),
        assignee: 'surveillant',
        teacher: null,
      });
      // Avant la déclaration : disponible maintenant dans l'équipe, malgré l'affectation de demain.
      const team = await get('admin', '/api/coverage/team');
      expect(team.body.find((m: { id: string }) => m.id === id.surveillant)).toMatchObject({
        available: true,
      });

      const res = await declareOk();
      expect(res).toMatchObject({ outcome: 'CREATED', doubleAssignment: false });
      expect(await types('admin', res.coverage!.id)).toEqual(['COVERAGE_EMPTY_CLASS']);
      const list = await adminList();
      expect(list.find((c) => c.id === res.coverage!.id)?.alerts).not.toContain(
        'DOUBLE_ASSIGNMENT',
      );
      expect(list.find((c) => c.id === planned)?.alerts).not.toContain('DOUBLE_ASSIGNMENT');
    });

    it('affectation créée quand même, admins alertés en URGENT, alerte sur les deux affectations', async () => {
      const other = await createCoverage(prisma, {
        status: 'ON_DUTY',
        source: 'SUPERVISOR_REPORT',
        className: '2e année Bleu',
        startAt: minutesFrom(new Date(), -20),
        plannedEndAt: null,
        assignee: 'surveillant',
        requester: 'surveillant',
        teacher: null,
      });
      const res = await declareOk();
      expect(res).toMatchObject({
        outcome: 'CREATED',
        doubleAssignment: true,
        coverage: { status: 'ON_DUTY' },
      });
      // Même transaction, même horodatage : l'ordre n'est pas significatif.
      const sent = await notificationsOf(prisma, 'admin', res.coverage!.id);
      expect(sent.sort((a, b) => a.type.localeCompare(b.type))).toEqual([
        { type: 'COVERAGE_DOUBLE_ASSIGNMENT', priority: 'URGENT' },
        { type: 'COVERAGE_EMPTY_CLASS', priority: 'URGENT' },
      ]);
      const list = await adminList();
      expect(list.find((c) => c.id === res.coverage!.id)?.alerts).toContain('DOUBLE_ASSIGNMENT');
      expect(list.find((c) => c.id === other)?.alerts).toContain('DOUBLE_ASSIGNMENT');
      // L'admin met fin à l'une des deux : l'alerte disparaît.
      expect(
        (await act('admin', other, { action: 'CANCEL', reason: 'Classe reprise' })).status,
      ).toBe(200);
      expect((await adminList()).find((c) => c.id === res.coverage!.id)?.alerts).not.toContain(
        'DOUBLE_ASSIGNMENT',
      );
    });
  });

  describe('classe déjà couverte : renfort (scénario 4, FR-015f, FR-015i)', () => {
    it('rattaché sans seconde affectation ; occupé ; rappels à l’admin puis escalade ; libéré par l’admin', async () => {
      const existing = await teacherRequest('ON_DUTY', 'remplacant');
      const clientId = randomUUID();
      const res = await declare('surveillant', { clientId });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        outcome: 'SUPPORT',
        coverage: { id: existing },
        assignedTo: { id: id.remplacant },
      });
      expect(res.body.coverage.reason).toBeNull(); // jamais de motif côté surveillant (FR-023c)
      expect(await prisma.request.count({ where: { kind: 'COVERAGE' } })).toBe(1);
      const [support] = await prisma.coverageSupport.findMany({ where: { requestId: existing } });
      expect(support).toMatchObject({ userId: id.surveillant, releasedAt: null });
      expect(await types('admin', existing)).toEqual(['COVERAGE_DUPLICATE']);
      expect((await availabilityOf('surveillant'))?.reason).toBe('SUPPORT');
      const events = await prisma.requestEvent.findMany({
        where: { requestId: existing, type: 'SUPPORT_JOINED' },
      });
      expect(events).toHaveLength(1);

      const again = await declare('surveillant', { clientId });
      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({ outcome: 'SUPPORT', coverage: { id: existing } });
      expect(await prisma.coverageSupport.count({ where: { requestId: existing } })).toBe(1);

      const t0 = support.joinedAt;
      for (const minutes of [10.5, 20.5, 30.5]) await job.runOnce(minutesFrom(t0, minutes));
      expect(await types('admin', existing)).toEqual([
        'COVERAGE_DUPLICATE',
        'COVERAGE_SUPPORT_REMINDER',
        'COVERAGE_SUPPORT_REMINDER',
        'COVERAGE_SUPPORT_REMINDER',
      ]);
      expect(await types('superadmin', existing)).toEqual([]);
      await job.runOnce(minutesFrom(t0, 40.5));
      expect(await types('superadmin', existing)).toEqual(['COVERAGE_ESCALATED']);

      const release = await act('admin', existing, {
        action: 'RELEASE_SUPPORT',
        supportId: support.id,
      });
      expect(release.status).toBe(200);
      expect(
        (await prisma.coverageSupport.findUniqueOrThrow({ where: { id: support.id } }))
          .releasedById,
      ).toBe(id.admin);
      expect(await types('surveillant', existing)).toContain('COVERAGE_LIFTED');
      expect((await availabilityOf('surveillant'))?.available).toBe(true);
      expect(
        await prisma.coverageReminder.count({
          where: { requestId: existing, supportId: support.id, resolvedAt: null },
        }),
      ).toBe(0);
    });

    it('renfort libéré quand l’affectation passe « terminée »', async () => {
      const existing = await teacherRequest('ON_DUTY', 'remplacant');
      await declareOk();
      expect((await act('remplacant', existing, { action: 'RELIEVE' })).status).toBe(200);
      const support = await prisma.coverageSupport.findFirstOrThrow({
        where: { requestId: existing },
      });
      expect(support.releasedAt).not.toBeNull();
      expect(support.releasedById).toBeNull();
      expect((await availabilityOf('surveillant'))?.available).toBe(true);
    });
  });

  describe('demande de l’enseignant sur la classe (FR-015d, FR-015e)', () => {
    it('enseignant précisé, demande en attente : elle passe « en cours » avec le déclarant', async () => {
      const existing = await teacherRequest('PENDING');
      await prisma.coverageReminder.create({
        data: { requestId: existing, kind: 'TAKEOVER', dueAt: minutesFrom(new Date(), 2) },
      });
      const res = await declareOk('surveillant', { teacherId: id.enseignante });
      expect(res).toMatchObject({
        outcome: 'ATTACHED',
        coverage: { id: existing, status: 'ON_DUTY' },
        assignedTo: { id: id.surveillant },
      });
      expect(await prisma.request.count({ where: { kind: 'COVERAGE' } })).toBe(1);
      expect(
        await prisma.coverageReminder.findFirstOrThrow({
          where: { requestId: existing, kind: 'TAKEOVER' },
        }),
      ).toMatchObject({
        resolution: 'ASSIGNED',
      });
      expect(await types('enseignante', existing)).toEqual(['ASSIGNED']);
      expect(await types('admin', existing)).toEqual(['COVERAGE_DUPLICATE']);
      expect(await types('surveillant', existing)).toEqual([]);
    });

    it('enseignant précisé, demande déjà assignée : rien de modifié, déclarant informé, admins notifiés', async () => {
      const existing = await teacherRequest('ACCEPTED', 'remplacant');
      const before = await prisma.request.findUniqueOrThrow({ where: { id: existing } });
      const res = await declareOk('surveillant', { teacherId: id.enseignante });
      expect(res).toMatchObject({
        outcome: 'ALREADY_ASSIGNED',
        coverage: null,
        assignedTo: { id: id.remplacant, displayName: expect.any(String) },
      });
      const after = await prisma.request.findUniqueOrThrow({ where: { id: existing } });
      expect(after).toMatchObject({
        status: 'ACCEPTED',
        assigneeId: id.remplacant,
        version: before.version,
      });
      expect(await prisma.request.count({ where: { kind: 'COVERAGE' } })).toBe(1);
      expect(await types('admin', existing)).toEqual(['COVERAGE_DUPLICATE']);
    });
  });

  describe('doublon possible : proposition à l’admin (FR-015g, FR-015h, R6)', () => {
    async function proposal() {
      const target = await teacherRequest('PENDING');
      const res = await declareOk();
      expect(res).toMatchObject({ outcome: 'MERGE_PROPOSED', coverage: { status: 'ON_DUTY' } });
      expect(res.coverage!.id).not.toBe(target);
      const row = await prisma.coverageMergeProposal.findFirstOrThrow();
      expect(row).toMatchObject({
        sourceRequestId: res.coverage!.id,
        targetRequestId: target,
        status: 'PENDING',
      });
      return { target, source: res.coverage!.id, proposalId: row.id };
    }
    const decide = (proposalId: string, decision: string, who = 'admin') =>
      post(who, `/api/coverage/merge-proposals/${proposalId}/decision`, { decision });

    it('affectations distinctes marquées « doublon possible » ; liste des propositions ; confirmation', async () => {
      const { target, source, proposalId } = await proposal();
      expect(await types('admin', source)).toEqual(['COVERAGE_EMPTY_CLASS']);
      expect(await types('admin', target)).toEqual(['COVERAGE_DUPLICATE']);
      const list = await adminList();
      expect(list.find((c) => c.id === source)?.alerts).toContain('POSSIBLE_DUPLICATE');
      expect(list.find((c) => c.id === target)?.alerts).toContain('POSSIBLE_DUPLICATE');

      const proposals = await get('admin', '/api/coverage/merge-proposals?status=PENDING');
      expect(proposals.status).toBe(200);
      expect(proposals.body).toMatchObject([
        {
          id: proposalId,
          status: 'PENDING',
          unresolved: false,
          source: { id: source },
          target: { id: target },
        },
      ]);
      expect((await get('surveillant', '/api/coverage/merge-proposals')).status).toBe(404);
      expect((await decide(proposalId, 'CONFIRM', 'surveillant')).status).toBe(404);

      const res = await decide(proposalId, 'CONFIRM');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'CONFIRMED',
        source: { id: source, status: 'CANCELLED', mergedIntoId: target },
        target: { id: target },
      });
      // Le déclarant est reporté sur la demande conservée, « en attente » : il la prend en charge.
      expect(await prisma.request.findUniqueOrThrow({ where: { id: target } })).toMatchObject({
        status: 'ON_DUTY',
        assigneeId: id.surveillant,
      });
      expect(
        await prisma.coverageMergeProposal.findUniqueOrThrow({ where: { id: proposalId } }),
      ).toMatchObject({
        status: 'CONFIRMED',
        decidedById: id.admin,
      });
      for (const requestId of [source, target]) {
        expect(
          await prisma.requestEvent.count({ where: { requestId, type: 'MERGE_DECIDED' } }),
        ).toBe(1);
      }
      expect(
        await prisma.auditLog.count({
          where: { action: 'COVERAGE_MERGE_DECIDED', targetId: proposalId },
        }),
      ).toBe(1);
      expect((await decide(proposalId, 'REJECT')).status).toBe(409);
      expect((await adminList()).find((c) => c.id === target)?.alerts).not.toContain(
        'POSSIBLE_DUPLICATE',
      );
    });

    it('refus : deux affectations distinctes, sans changement', async () => {
      const { target, source, proposalId } = await proposal();
      const res = await decide(proposalId, 'REJECT');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('REJECTED');
      expect(await prisma.request.findUniqueOrThrow({ where: { id: source } })).toMatchObject({
        status: 'ON_DUTY',
      });
      expect(await prisma.request.findUniqueOrThrow({ where: { id: target } })).toMatchObject({
        status: 'PENDING',
        assigneeId: null,
      });
      expect(
        (await prisma.coverageDetail.findUniqueOrThrow({ where: { requestId: source } }))
          .mergedIntoId,
      ).toBeNull();
      expect((await decide(proposalId, 'pas-une-decision')).status).toBe(400);
    });

    it('sans décision : présentée une dernière fois quand les deux sont finales, « non tranché », décidable après coup', async () => {
      const { target, source, proposalId } = await proposal();
      expect((await act('surveillant', source, { action: 'RELIEVE' })).status).toBe(200);
      expect(
        (await prisma.coverageMergeProposal.findUniqueOrThrow({ where: { id: proposalId } }))
          .finalPresentedAt,
      ).toBeNull();
      expect(
        (await act('admin', target, { action: 'CANCEL', reason: 'Enseignante arrivée' })).status,
      ).toBe(200);
      expect(
        (await prisma.coverageMergeProposal.findUniqueOrThrow({ where: { id: proposalId } }))
          .finalPresentedAt,
      ).not.toBeNull();
      expect((await types('admin', target)).filter((t) => t === 'COVERAGE_DUPLICATE')).toHaveLength(
        2,
      );
      const pending = await get('admin', '/api/coverage/merge-proposals?status=PENDING');
      expect(pending.body).toMatchObject([{ id: proposalId, unresolved: true }]);

      const res = await decide(proposalId, 'CONFIRM');
      expect(res.status).toBe(200);
      // Après coup : statuts finaux inchangés, rattachement noté pour les statistiques.
      expect((await prisma.request.findUniqueOrThrow({ where: { id: source } })).status).toMatch(
        /^(DONE|CLOSED)$/,
      );
      expect(
        (await prisma.coverageDetail.findUniqueOrThrow({ where: { requestId: source } }))
          .mergedIntoId,
      ).toBe(target);
      expect(await prisma.request.findUniqueOrThrow({ where: { id: target } })).toMatchObject({
        status: 'CANCELLED',
      });
    });
  });

  describe('actions de l’admin (FR-015c, FR-008h)', () => {
    it('correction de l’enseignant tracée ; réservée à l’admin', async () => {
      const { coverage } = await declareOk();
      expect(
        (
          await act('surveillant', coverage!.id, {
            action: 'SET_TEACHER',
            teacherId: id.enseignante,
          })
        ).status,
      ).toBe(403);
      const res = await act('admin', coverage!.id, {
        action: 'SET_TEACHER',
        teacherId: id.enseignante,
      });
      expect(res.status).toBe(200);
      expect(res.body.teacher).toMatchObject({ id: id.enseignante });
      const event = await prisma.requestEvent.findFirstOrThrow({
        where: { requestId: coverage!.id, type: 'TEACHER_SET' },
      });
      expect(event).toMatchObject({
        actorId: id.admin,
        fromValue: { teacherId: null },
        toValue: { teacherId: id.enseignante },
      });
      expect(
        await prisma.auditLog.count({
          where: { action: 'COVERAGE_MANAGED', targetId: coverage!.id, actorId: id.admin },
        }),
      ).toBe(1);
    });

    it('annulation d’une affectation en cours : admin seulement', async () => {
      const { coverage } = await declareOk();
      expect(
        (await act('surveillant', coverage!.id, { action: 'CANCEL', reason: 'Erreur' })).status,
      ).toBe(403);
      const res = await act('admin', coverage!.id, {
        action: 'CANCEL',
        reason: 'Déclaration en double',
      });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
      expect(await types('surveillant', coverage!.id)).toEqual(['COVERAGE_LIFTED']);
    });
  });
});
