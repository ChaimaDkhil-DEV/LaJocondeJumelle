import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { endOfLocalDay } from '../../src/common/school-time';
import { CoverageDeadlinesJob } from '../../src/scheduler/coverage-deadlines.job';
import { CoverageRemindersJob } from '../../src/scheduler/coverage-reminders.job';
import { seedDemo } from '../utils/auth-helpers';
import { fixedNow, type TestClock } from '../utils/clock';
import {
  addReminder,
  addSupport,
  createCoverage,
  minutesFrom,
  notificationsOf,
} from '../utils/coverage-fixtures';
import { createTestApp } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * T013 — Job des échéances des affectations (R2, R3, contracts/realtime-events.md) : chaque type
 * part une seule fois vers le bon destinataire, la condition est revérifiée avant l'envoi, les
 * exécutions concurrentes ne doublent rien ; « non pourvue » en fin de créneau ; le job des délais
 * ne garde que le délai d'arrivée.
 */
describe('Échéances des affectations : CoverageRemindersJob (004)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let job: CoverageRemindersJob;
  let deadlines: CoverageDeadlinesJob;
  let clock: TestClock;

  const reminder = (id: string) => prisma.coverageReminder.findUniqueOrThrow({ where: { id } });
  const openReminders = (requestId: string) =>
    prisma.coverageReminder.findMany({
      where: { requestId, resolvedAt: null },
      orderBy: { dueAt: 'asc' },
    });
  const events = async (requestId: string) =>
    (
      await prisma.requestEvent.findMany({
        where: { requestId },
        orderBy: [{ createdAt: 'asc' }, { seq: 'asc' }],
      })
    ).map((e) => e.type);

  beforeAll(async () => {
    app = await createTestApp();
    job = app.get(CoverageRemindersJob);
    deadlines = app.get(CoverageDeadlinesJob);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    clock = fixedNow('2026-10-20T08:00:00Z'); // 10:00 à Paris
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function pending(startInMinutes = 30, endInMinutes = 90): Promise<string> {
    return createCoverage(prisma, {
      status: 'PENDING',
      startAt: minutesFrom(clock.now(), startInMinutes),
      plannedEndAt: minutesFrom(clock.now(), endInMinutes),
      createdAt: clock.now(),
    });
  }

  describe('délai de prise en charge et escalade (FR-011d, FR-011e)', () => {
    it('alerte URGENT aux admins à l’échéance, une seule fois, puis escalade aux super administrateurs', async () => {
      const id = await pending();
      const takeover = await addReminder(prisma, id, 'TAKEOVER', minutesFrom(clock.now(), 2));

      expect(await job.runOnce(clock.advanceMinutes(1))).toBe(0);
      expect(await notificationsOf(prisma, 'admin', id)).toEqual([]);

      expect(await job.runOnce(clock.advanceMinutes(1))).toBe(1);
      expect(await notificationsOf(prisma, 'admin', id)).toEqual([
        { type: 'COVERAGE_TAKEOVER_EXPIRED', priority: 'URGENT' },
      ]);
      expect(await notificationsOf(prisma, 'superadmin', id)).toEqual([]);
      expect(await reminder(takeover)).toMatchObject({
        attempts: 1,
        resolution: 'SENT',
        resolvedAt: expect.any(Date),
      });
      const [escalation] = await openReminders(id);
      expect(escalation).toMatchObject({
        kind: 'TAKEOVER_ESCALATION',
        dueAt: minutesFrom(clock.now(), 5),
      });

      // Rejouer au même instant n'envoie rien de plus (idempotence).
      expect(await job.runOnce(clock.now())).toBe(0);
      expect(await notificationsOf(prisma, 'admin', id)).toHaveLength(1);

      expect(await job.runOnce(clock.advanceMinutes(5))).toBe(1);
      expect(await notificationsOf(prisma, 'superadmin', id)).toEqual([
        { type: 'COVERAGE_ESCALATED', priority: 'URGENT' },
      ]);
      expect(await events(id)).toEqual(['REMINDER_SENT', 'ESCALATED']);
      expect(await openReminders(id)).toEqual([]);
    });

    it('sans admin actif, l’alerte va aux super administrateurs (R11)', async () => {
      await prisma.user.update({ where: { username: 'admin' }, data: { active: false } });
      const id = await pending();
      await addReminder(prisma, id, 'TAKEOVER', clock.now());
      await job.runOnce(clock.advanceMinutes(1));
      expect(await notificationsOf(prisma, 'superadmin', id)).toEqual([
        { type: 'COVERAGE_TAKEOVER_EXPIRED', priority: 'URGENT' },
      ]);
    });

    it('condition revérifiée : demande déjà assignée, l’échéance est close « sans objet » sans envoi', async () => {
      const id = await createCoverage(prisma, {
        status: 'ACCEPTED',
        assignee: 'surveillant',
        startAt: minutesFrom(clock.now(), 30),
        plannedEndAt: minutesFrom(clock.now(), 90),
      });
      const takeover = await addReminder(prisma, id, 'TAKEOVER', clock.now());
      expect(await job.runOnce(clock.advanceMinutes(1))).toBe(0);
      expect(await reminder(takeover)).toMatchObject({ resolution: 'OBSOLETE', attempts: 0 });
      expect(await notificationsOf(prisma, 'admin', id)).toEqual([]);
    });

    it('deux exécutions simultanées n’envoient pas en double', async () => {
      const id = await pending();
      await addReminder(prisma, id, 'TAKEOVER', clock.now());
      const at = clock.advanceMinutes(1);
      const sent = await Promise.all([job.runOnce(at), job.runOnce(at), job.runOnce(at)]);
      expect(sent.reduce((a: number, b: number) => a + b, 0)).toBe(1);
      expect(await notificationsOf(prisma, 'admin', id)).toHaveLength(1);
    });
  });

  describe('rappel du matin (FR-011f)', () => {
    it('envoyé aux admins si la demande est encore en attente ; sinon clos sans envoi', async () => {
      const stillPending = await pending(24 * 60, 25 * 60);
      const assigned = await createCoverage(prisma, {
        status: 'ACCEPTED',
        assignee: 'surveillant2',
        className: '2e année Bleu',
        startAt: minutesFrom(clock.now(), 24 * 60),
        plannedEndAt: minutesFrom(clock.now(), 25 * 60),
      });
      const morning = new Date('2026-10-21T05:00:00Z'); // 07:00 à Paris
      await addReminder(prisma, stillPending, 'MORNING', morning);
      const obsolete = await addReminder(prisma, assigned, 'MORNING', morning);
      await job.runOnce(clock.set('2026-10-21T05:00:30Z'));
      expect(await notificationsOf(prisma, 'admin', stillPending)).toEqual([
        { type: 'COVERAGE_MORNING_REMINDER', priority: 'URGENT' },
      ]);
      expect(await notificationsOf(prisma, 'admin', assigned)).toEqual([]);
      expect(await reminder(obsolete)).toMatchObject({ resolution: 'OBSOLETE' });
    });
  });

  describe('fin de créneau (FR-016a)', () => {
    it('rappel au surveillant à fin + 10 min, puis aux admins 10 min plus tard', async () => {
      const id = await createCoverage(prisma, {
        status: 'ON_DUTY',
        assignee: 'surveillant',
        startAt: minutesFrom(clock.now(), -60),
        plannedEndAt: clock.now(),
      });
      await addReminder(prisma, id, 'END_OF_SLOT', minutesFrom(clock.now(), 10), {
        target: 'surveillant',
      });
      await job.runOnce(clock.advanceMinutes(10));
      expect(await notificationsOf(prisma, 'surveillant', id)).toEqual([
        { type: 'COVERAGE_CLOSE_REMINDER', priority: 'URGENT' },
      ]);
      expect(await notificationsOf(prisma, 'admin', id)).toEqual([]);
      await job.runOnce(clock.advanceMinutes(10));
      expect(await notificationsOf(prisma, 'admin', id)).toEqual([
        { type: 'COVERAGE_CLOSE_REMINDER', priority: 'URGENT' },
      ]);
      expect(await openReminders(id)).toEqual([]);
    });

    it('affectation terminée entre-temps : aucun rappel', async () => {
      const id = await createCoverage(prisma, {
        status: 'CLOSED',
        assignee: 'surveillant',
        startAt: minutesFrom(clock.now(), -60),
        plannedEndAt: clock.now(),
      });
      const close = await addReminder(prisma, id, 'END_OF_SLOT', minutesFrom(clock.now(), 10), {
        target: 'surveillant',
      });
      await job.runOnce(clock.advanceMinutes(11));
      expect(await reminder(close)).toMatchObject({ resolution: 'OBSOLETE' });
      expect(await notificationsOf(prisma, 'surveillant', id)).toEqual([]);
    });

    it('garde « jusqu’à l’arrivée » (fin inconnue) : aucun rappel de clôture avant la fin de la journée locale + 10 min', async () => {
      const start = minutesFrom(clock.now(), -60);
      const id = await createCoverage(prisma, {
        status: 'ON_DUTY',
        source: 'ADMIN_DIRECT',
        assignee: 'surveillant',
        startAt: start,
        plannedEndAt: null,
      });
      // Échéance trop précoce (donnée antérieure) : le job la repousse au lieu d'envoyer.
      const close = await addReminder(prisma, id, 'END_OF_SLOT', minutesFrom(clock.now(), 10), {
        target: 'surveillant',
      });
      const endOfDay = endOfLocalDay(start, 'Europe/Paris'); // 2026-10-20T22:00:00Z
      await job.runOnce(clock.advanceMinutes(10));
      await job.runOnce(clock.set('2026-10-20T22:09:00Z'));
      expect(await notificationsOf(prisma, 'surveillant', id)).toEqual([]);
      expect(await reminder(close)).toMatchObject({
        resolvedAt: null,
        dueAt: minutesFrom(endOfDay, 10),
      });

      await job.runOnce(clock.set('2026-10-20T22:10:00Z'));
      expect(await notificationsOf(prisma, 'surveillant', id)).toEqual([
        { type: 'COVERAGE_CLOSE_REMINDER', priority: 'URGENT' },
      ]);
    });
  });

  describe('renfort (FR-015i)', () => {
    it('rappels aux admins toutes les 10 min, 3 au plus, puis escalade aux super administrateurs', async () => {
      const id = await createCoverage(prisma, {
        status: 'ON_DUTY',
        source: 'SUPERVISOR_REPORT',
        teacher: null,
        assignee: 'surveillant',
        startAt: clock.now(),
        plannedEndAt: minutesFrom(clock.now(), 60),
      });
      const support = await addSupport(prisma, id, 'remplacant', clock.now());
      const decision = await addReminder(
        prisma,
        id,
        'SUPPORT_DECISION',
        minutesFrom(clock.now(), 10),
        {
          supportId: support,
          maxAttempts: 3,
          intervalMinutes: 10,
        },
      );
      for (const attempt of [1, 2, 3]) {
        await job.runOnce(clock.advanceMinutes(10));
        expect(await notificationsOf(prisma, 'admin', id)).toHaveLength(attempt);
        expect((await reminder(decision)).attempts).toBe(attempt);
      }
      expect(await notificationsOf(prisma, 'admin', id)).toEqual(
        Array(3).fill({ type: 'COVERAGE_SUPPORT_REMINDER', priority: 'URGENT' }),
      );
      expect(await reminder(decision)).toMatchObject({ resolution: 'SENT' });
      expect(await notificationsOf(prisma, 'superadmin', id)).toEqual([]);
      await job.runOnce(clock.advanceMinutes(10));
      expect(await notificationsOf(prisma, 'superadmin', id)).toEqual([
        { type: 'COVERAGE_ESCALATED', priority: 'URGENT' },
      ]);
    });

    it('renfort libéré entre-temps : rappel clos sans envoi', async () => {
      const id = await createCoverage(prisma, {
        status: 'ON_DUTY',
        source: 'SUPERVISOR_REPORT',
        teacher: null,
        assignee: 'surveillant',
        startAt: clock.now(),
        plannedEndAt: minutesFrom(clock.now(), 60),
      });
      const support = await addSupport(prisma, id, 'remplacant', clock.now());
      await prisma.coverageSupport.update({
        where: { id: support },
        data: { releasedAt: clock.now() },
      });
      const decision = await addReminder(
        prisma,
        id,
        'SUPPORT_DECISION',
        minutesFrom(clock.now(), 10),
        {
          supportId: support,
          maxAttempts: 3,
          intervalMinutes: 10,
        },
      );
      await job.runOnce(clock.advanceMinutes(10));
      expect(await reminder(decision)).toMatchObject({ resolution: 'OBSOLETE', attempts: 0 });
    });
  });

  describe('« non pourvue » (FR-008a)', () => {
    it('demande jamais assignée : non pourvue à la fin du créneau ; admins et enseignant notifiés', async () => {
      const id = await pending(-60, 10);
      await addReminder(prisma, id, 'TAKEOVER', minutesFrom(clock.now(), 30));
      expect(await job.runOnce(clock.advanceMinutes(9))).toBe(0);
      expect((await prisma.request.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');

      await job.runOnce(clock.advanceMinutes(2));
      const row = await prisma.request.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe('UNFILLED');
      expect(await events(id)).toContain('STATUS_CHANGED');
      expect(await notificationsOf(prisma, 'admin', id)).toEqual([
        { type: 'COVERAGE_UNFILLED', priority: 'URGENT' },
      ]);
      expect(await notificationsOf(prisma, 'enseignante', id)).toEqual([
        { type: 'COVERAGE_UNFILLED', priority: 'URGENT' },
      ]);
      // Les échéances restantes deviennent sans objet.
      expect(await openReminders(id)).toEqual([]);
    });

    it('une affectation assignée n’est jamais « non pourvue »', async () => {
      const id = await createCoverage(prisma, {
        status: 'ACCEPTED',
        assignee: 'surveillant',
        startAt: minutesFrom(clock.now(), -60),
        plannedEndAt: minutesFrom(clock.now(), -1),
      });
      await job.runOnce(clock.now());
      expect((await prisma.request.findUniqueOrThrow({ where: { id } })).status).toBe('ACCEPTED');
    });
  });

  describe('CoverageDeadlinesJob : délai d’arrivée seulement', () => {
    it('assignée, délai d’arrivée dépassé → en retard ; plus aucune étape de prise en charge', async () => {
      const late = await createCoverage(prisma, {
        status: 'ACCEPTED',
        assignee: 'surveillant',
        startAt: minutesFrom(new Date(), -20),
        plannedEndAt: minutesFrom(new Date(), 40),
      });
      await prisma.request.update({
        where: { id: late },
        data: { currentStage: 'ARRIVAL', currentDueAt: minutesFrom(new Date(), -1) },
      });
      const legacy = await createCoverage(prisma, {
        status: 'PENDING',
        startAt: minutesFrom(new Date(), 20),
        plannedEndAt: minutesFrom(new Date(), 80),
      });
      await prisma.request.update({
        where: { id: legacy },
        data: { currentStage: 'TAKEOVER', currentDueAt: minutesFrom(new Date(), -1) },
      });
      await deadlines.runOnce(new Date());
      expect((await prisma.request.findUniqueOrThrow({ where: { id: late } })).status).toBe('LATE');
      expect((await prisma.request.findUniqueOrThrow({ where: { id: legacy } })).status).toBe(
        'PENDING',
      );
      expect(await notificationsOf(prisma, 'admin', late)).toEqual([
        { type: 'COVERAGE_LATE', priority: 'URGENT' },
      ]);
    });
  });
});
