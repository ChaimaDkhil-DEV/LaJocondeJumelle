import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { addDays, atLocalTime, localDate, localTime } from '../../src/common/school-time';
import { CoverageRemindersJob } from '../../src/scheduler/coverage-reminders.job';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { clearCoverages, minutesFrom } from '../utils/coverage-fixtures';
import { useMiddayTimezone } from '../utils/school-timezone';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * T050 — US1 : délai de prise en charge, escalade, rappel de 7 h, « non pourvue », rappels de
 * clôture (FR-008a, FR-011d, FR-011e, FR-011f, FR-016a, R11), de bout en bout par l'API et le job,
 * avec une horloge simulée passée au job.
 */
describe('Délais et rappels d’une demande d’enseignant (US1)', () => {
  const prisma = new PrismaClient();
  /** Fuseau de l'école pour la suite (voir useMiddayTimezone). */
  let TZ = '';
  let restoreTz = () => undefined as void;
  let app: INestApplication;
  let job: CoverageRemindersJob;
  const cookie: Record<string, string> = {};
  const id: Record<string, string> = {};
  let violet: string;

  const api = () => request(app.getHttpServer());
  const send = (who: string, path: string, body: Record<string, unknown>) =>
    api().post(path).set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).send(body);

  /** Plage du jour à partir de maintenant (minutes). */
  function today(startIn: number, endIn: number) {
    const now = new Date();
    return {
      date: localDate(minutesFrom(now, startIn), TZ),
      startTime: localTime(minutesFrom(now, startIn), TZ),
      endTime: localTime(minutesFrom(now, endIn), TZ),
    };
  }

  async function signal(
    range: Record<string, string>,
  ): Promise<{ id: string; startAt: string; plannedEndAt: string }> {
    const res = await send('enseignante', '/api/coverage/teacher-requests', {
      clientId: randomUUID(),
      type: 'ABSENCE',
      classId: violet,
      ...range,
    });
    if (res.status !== 201)
      throw new Error(`Signalement : ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }

  async function act(who: string, requestId: string, body: Record<string, unknown>) {
    const { version } = await prisma.request.findUniqueOrThrow({ where: { id: requestId } });
    const res = await send(who, `/api/coverage/${requestId}/actions`, { version, ...body });
    if (res.status !== 200)
      throw new Error(`${String(body.action)} : ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }

  async function received(who: string, requestId: string) {
    return prisma.notification.findMany({
      where: { userId: id[who], requestId },
      orderBy: { createdAt: 'asc' },
      select: { type: true, priority: true },
    });
  }

  const types = async (who: string, requestId: string) =>
    (await received(who, requestId)).map((n) => n.type);

  beforeAll(async () => {
    // Créneaux « du jour » sans passage de minuit, quelle que soit l'heure d'exécution.
    ({ tz: TZ, restore: restoreTz } = useMiddayTimezone());
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    job = app.get(CoverageRemindersJob);
    for (const who of ['enseignante', 'admin', 'superadmin', 'surveillant']) {
      cookie[who] = await loginAs(app, who);
      id[who] = await userId(prisma, who);
    }
    violet = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '1ère année Violet' } }))
      .id;
  });

  beforeEach(() => clearCoverages(prisma));

  afterAll(async () => {
    restoreTz();
    await app.close();
    await prisma.$disconnect();
  });

  describe('délai de prise en charge (FR-011d, FR-011e)', () => {
    it('créneau dans 30 min : alerte URGENT aux admins à +2 min, escalade aux super administrateurs 5 min plus tard', async () => {
      const t0 = new Date();
      const req = await signal(today(30, 90));
      expect(await job.runOnce(minutesFrom(t0, 1))).toBe(0);
      expect(await received('admin', req.id)).toEqual([
        { type: 'COVERAGE_REQUESTED', priority: 'URGENT' },
      ]);

      await job.runOnce(minutesFrom(t0, 2.5));
      expect(await received('admin', req.id)).toContainEqual({
        type: 'COVERAGE_TAKEOVER_EXPIRED',
        priority: 'URGENT',
      });
      expect(await types('superadmin', req.id)).toEqual([]);

      await job.runOnce(minutesFrom(t0, 7.5));
      expect(await received('superadmin', req.id)).toEqual([
        { type: 'COVERAGE_ESCALATED', priority: 'URGENT' },
      ]);
      // La demande reste « en attente », affichée en priorité.
      expect((await prisma.request.findUniqueOrThrow({ where: { id: req.id } })).status).toBe(
        'PENDING',
      );
    });

    it('consulter l’alerte n’arrête pas l’escalade ; l’assignation, l’annulation ou le retrait l’arrêtent', async () => {
      const t0 = new Date();
      const seen = await signal(today(30, 90));
      const assigned = await signal({ ...today(30, 90), startTime: today(31, 91).startTime });
      const cancelled = await signal({ ...today(32, 92) });
      const withdrawn = await signal({ ...today(33, 93) });
      await job.runOnce(minutesFrom(t0, 3));

      await api().get(`/api/coverage/${seen.id}`).set('Cookie', cookie.admin);
      await api()
        .post('/api/notifications/read')
        .set('Cookie', cookie.admin)
        .set('Origin', TEST_ORIGIN)
        .send({ all: true });
      await act('admin', assigned.id, { action: 'ASSIGN', assigneeId: id.surveillant });
      await act('admin', cancelled.id, { action: 'CANCEL' });
      await act('enseignante', withdrawn.id, { action: 'WITHDRAW' });

      await job.runOnce(minutesFrom(t0, 10));
      expect(await types('superadmin', seen.id)).toEqual(['COVERAGE_ESCALATED']);
      for (const stopped of [assigned, cancelled, withdrawn])
        expect(await types('superadmin', stopped.id)).toEqual([]);
    });

    it('créneau à 15 h demain : aucun délai avant 14 h, puis même alerte', async () => {
      const day = addDays(localDate(new Date(), TZ), 1);
      const req = await signal({ date: day, startTime: '15:00', endTime: '16:00' });
      await job.runOnce(atLocalTime(day, '14:01', TZ));
      expect(await types('admin', req.id)).not.toContain('COVERAGE_TAKEOVER_EXPIRED');
      await job.runOnce(new Date(atLocalTime(day, '14:02', TZ).getTime() + 30_000));
      expect(await types('admin', req.id)).toContain('COVERAGE_TAKEOVER_EXPIRED');
    });

    it('sans admin actif, l’alerte va aux super administrateurs (R11)', async () => {
      const t0 = new Date();
      const req = await signal(today(30, 90));
      await prisma.user.update({ where: { id: id.admin }, data: { active: false } });
      try {
        await job.runOnce(minutesFrom(t0, 3));
        expect(await types('superadmin', req.id)).toEqual(['COVERAGE_TAKEOVER_EXPIRED']);
      } finally {
        await prisma.user.update({ where: { id: id.admin }, data: { active: true } });
      }
    });

    it('file de l’admin : la demande au délai expiré passe en tête', async () => {
      const t0 = new Date();
      const later = await signal(today(20, 80));
      const urgent = await signal(today(40, 100));
      await prisma.coverageReminder.updateMany({
        where: { requestId: later.id },
        data: { dueAt: minutesFrom(t0, 600) },
      });
      await job.runOnce(minutesFrom(t0, 3));
      const list = await api().get('/api/coverage').set('Cookie', cookie.admin);
      expect(list.body[0]).toMatchObject({ id: urgent.id, alerts: ['TAKEOVER_EXPIRED'] });
      expect(list.body[1]).toMatchObject({ id: later.id, alerts: [] });
    });
  });

  describe('rappel du matin (FR-011f)', () => {
    it('demande pour demain : rappel à 07:00 si encore en attente, rien sinon', async () => {
      const day = addDays(localDate(new Date(), TZ), 1);
      const waiting = await signal({ date: day, startTime: '10:00', endTime: '11:00' });
      const handled = await signal({ date: day, startTime: '13:00', endTime: '14:00' });
      await act('admin', handled.id, { action: 'ASSIGN', assigneeId: id.surveillant });
      await job.runOnce(new Date(atLocalTime(day, '07:00', TZ).getTime() + 30_000));
      expect(await types('admin', waiting.id)).toContain('COVERAGE_MORNING_REMINDER');
      expect(await types('admin', handled.id)).not.toContain('COVERAGE_MORNING_REMINDER');
    });
  });

  describe('non pourvue et clôture (FR-008a, FR-016a)', () => {
    it('jamais assignée : « non pourvue » à la fin du créneau ; admins et enseignant prévenus', async () => {
      const t0 = new Date();
      const req = await signal(today(-10, 2));
      await job.runOnce(minutesFrom(t0, 1));
      expect((await prisma.request.findUniqueOrThrow({ where: { id: req.id } })).status).toBe(
        'PENDING',
      );
      await job.runOnce(minutesFrom(t0, 3));
      expect((await prisma.request.findUniqueOrThrow({ where: { id: req.id } })).status).toBe(
        'UNFILLED',
      );
      expect(await types('admin', req.id)).toContain('COVERAGE_UNFILLED');
      expect(await types('enseignante', req.id)).toContain('COVERAGE_UNFILLED');
    });

    it('fin de créneau sans clôture : rappel au surveillant à +10 min, puis aux admins à +20 min', async () => {
      const req = await signal(today(5, 20));
      await act('admin', req.id, { action: 'ASSIGN', assigneeId: id.surveillant });
      const end = new Date(req.plannedEndAt);
      await job.runOnce(minutesFrom(end, 9));
      expect(await types('surveillant', req.id)).not.toContain('COVERAGE_CLOSE_REMINDER');
      await job.runOnce(minutesFrom(end, 10.5));
      expect(await types('surveillant', req.id)).toContain('COVERAGE_CLOSE_REMINDER');
      expect(await types('admin', req.id)).not.toContain('COVERAGE_CLOSE_REMINDER');
      await job.runOnce(minutesFrom(end, 20.5));
      expect(await types('admin', req.id)).toContain('COVERAGE_CLOSE_REMINDER');
    });
  });
});
