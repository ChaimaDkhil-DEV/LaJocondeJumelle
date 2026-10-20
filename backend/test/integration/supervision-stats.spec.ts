import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import {
  clearCoverages,
  createCoverage,
  minutesFrom,
  type CoverageFixture,
} from '../utils/coverage-fixtures';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * T076 — US5 : historique détaillé et statistiques (scénarios 1 et 2, FR-020 à FR-023, FR-008i,
 * FR-015b, FR-015h) ; réservés à l'admin et au super administrateur ; aucun export.
 */
describe('Historique et statistiques des affectations (US5)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookie: Record<string, string> = {};
  const id: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const get = (who: string, path: string) => api().get(path).set('Cookie', cookie[who]);
  const post = (who: string, path: string, body: Record<string, unknown>) =>
    api().post(path).set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).send(body);

  /** Septembre 2026, heures de Paris (UTC+2). */
  const sept = (day: number, hour = 10) => new Date(Date.UTC(2026, 8, day, hour - 2));

  async function finished(fixture: Partial<CoverageFixture> & { duration?: number | null }) {
    const { duration = 30, ...rest } = fixture;
    const coverageId = await createCoverage(prisma, {
      status: 'CLOSED',
      source: 'TEACHER_REQUEST',
      startAt: sept(14),
      plannedEndAt: null,
      assignee: 'surveillant',
      ...rest,
    });
    await prisma.coverageDetail.update({
      where: { requestId: coverageId },
      data: { durationMinutes: duration },
    });
    return coverageId;
  }

  const stats = (who: string, query: string) => get(who, `/api/coverage/stats?${query}`);

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    await prisma.category.updateMany({ where: { kind: 'COVERAGE' }, data: { proofMode: 'QR' } });
    app = await createTestApp();
    for (const who of ['enseignante', 'admin', 'superadmin', 'surveillant', 'remplacant']) {
      cookie[who] = await loginAs(app, who);
      id[who] = await userId(prisma, who);
    }
  });

  beforeEach(() => clearCoverages(prisma));

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('statistiques (scénario 2)', () => {
    beforeEach(async () => {
      await finished({ type: 'LATENESS', duration: 20 }); // lundi 14
      await finished({ type: 'ABSENCE', duration: 40, startAt: sept(15) });
      await finished({
        type: 'EMPTY_CLASS',
        source: 'SUPERVISOR_REPORT',
        teacher: null,
        requester: 'surveillant',
        duration: null,
        startAt: sept(22),
      });
      await finished({
        type: 'LATENESS',
        className: '2e année Bleu',
        status: 'UNFILLED',
        assignee: null,
        duration: null,
        startAt: sept(23),
      });
      await finished({ status: 'CANCELLED', startAt: sept(16) });
      // Hors période.
      await finished({ startAt: new Date(Date.UTC(2026, 9, 1, 8)) });
      await finished({ startAt: new Date(Date.UTC(2026, 7, 31, 8)) });
    });

    const SEPTEMBER = 'from=2026-09-01&to=2026-09-30';

    it('par enseignant : totaux, « enseignant non précisé », annulées à part', async () => {
      const res = await stats('admin', `${SEPTEMBER}&groupBy=teacher`);
      expect(res.status).toBe(200);
      expect(res.body.totals).toEqual({
        events: 4,
        lateness: 2,
        absence: 1,
        emptyClass: 1,
        cancelled: 1,
        unfilled: 1,
        unfilledRate: 0.25,
        averageDurationMinutes: 30,
        undecidedDuplicates: 0,
      });
      expect(
        res.body.rows.map((r: { label: string; events: number; cancelled: number }) => [
          r.label,
          r.events,
          r.cancelled,
        ]),
      ).toEqual([
        ['Enseignante', 3, 1],
        ['Enseignant non précisé', 1, 0],
      ]);
    });

    it('par classe et par période (semaine, mois)', async () => {
      const byClass = await stats('admin', `${SEPTEMBER}&groupBy=class`);
      expect(
        byClass.body.rows.map((r: { label: string; events: number }) => [r.label, r.events]),
      ).toEqual([
        ['1ère année Violet', 3],
        ['2e année Bleu', 1],
      ]);
      const byWeek = await stats('superadmin', `${SEPTEMBER}&groupBy=period&period=week`);
      expect(byWeek.status).toBe(200);
      expect(
        byWeek.body.rows.map((r: { key: string; events: number }) => [r.key, r.events]),
      ).toEqual([
        ['2026-09-14', 2],
        ['2026-09-21', 2],
      ]);
      const byMonth = await stats(
        'admin',
        'from=2026-08-01&to=2026-10-31&groupBy=period&period=month',
      );
      expect(
        byMonth.body.rows.map((r: { key: string; events: number }) => [r.key, r.events]),
      ).toEqual([
        ['2026-08', 1],
        ['2026-09', 4],
        ['2026-10', 1],
      ]);
    });

    it('doublon en suspens compté une fois, « non tranché » à part ; décision prise en compte', async () => {
      const target = await finished({ startAt: sept(24) });
      const source = await finished({
        type: 'EMPTY_CLASS',
        source: 'SUPERVISOR_REPORT',
        teacher: null,
        requester: 'surveillant',
        startAt: sept(24),
      });
      const proposal = await prisma.coverageMergeProposal.create({
        data: { sourceRequestId: source, targetRequestId: target, finalPresentedAt: new Date() },
      });
      const pending = await stats('admin', `${SEPTEMBER}&groupBy=teacher`);
      expect(pending.body.totals).toMatchObject({ events: 5, undecidedDuplicates: 1 });

      const decided = await post('admin', `/api/coverage/merge-proposals/${proposal.id}/decision`, {
        decision: 'REJECT',
      });
      expect(decided.status).toBe(200);
      const after = await stats('admin', `${SEPTEMBER}&groupBy=teacher`);
      expect(after.body.totals).toMatchObject({ events: 6, undecidedDuplicates: 0 });
    });

    it('période par défaut ; paramètres invalides refusés ; aucun export', async () => {
      expect((await stats('admin', '')).status).toBe(200);
      expect((await stats('admin', 'from=2026-09-30&to=2026-09-01')).body.error.code).toBe(
        'INVALID_RANGE',
      );
      expect((await stats('admin', 'groupBy=enseignant')).status).toBe(400);
      expect((await stats('admin', 'from=2026-09-01&to=2026-09-30&format=csv')).status).toBe(400);
      expect((await get('admin', '/api/coverage/stats/export')).status).toBe(404);
    });

    it.each(['surveillant', 'enseignante'])('%s : 404 journalisé', async (who) => {
      const before = await prisma.auditLog.count({
        where: { action: 'ACCESS_DENIED', actorId: id[who] },
      });
      expect((await stats(who, SEPTEMBER)).status).toBe(404);
      expect(
        await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId: id[who] } }),
      ).toBe(before + 1);
    });
  });

  describe('historique (scénario 1)', () => {
    it('enseignant, classe, créneau, surveillant, source, statuts successifs avec auteurs et heures, durée', async () => {
      const violet = (
        await prisma.schoolClass.findUniqueOrThrow({ where: { name: '1ère année Violet' } })
      ).id;
      const created = await post('admin', '/api/coverage', {
        clientId: randomUUID(),
        classId: violet,
        type: 'ABSENCE',
        teacherId: id.enseignante,
        assigneeId: id.surveillant,
        startAt: minutesFrom(new Date(), -5).toISOString(),
        endAt: minutesFrom(new Date(), 55).toISOString(),
      });
      expect(created.status).toBe(201);
      const coverageId = created.body.id as string;
      const qr = await get('superadmin', `/api/admin/coverage/classes/${violet}/qr`);
      const qrToken = new URL(qr.body.url).searchParams.get('c');
      const act = async (who: string, body: Record<string, unknown>) => {
        const { version } = await prisma.request.findUniqueOrThrow({ where: { id: coverageId } });
        return post(who, `/api/coverage/${coverageId}/actions`, { version, ...body });
      };
      expect((await act('surveillant', { action: 'CONFIRM_PRESENCE', qrToken })).status).toBe(200);
      expect((await act('surveillant', { action: 'RELIEVE' })).status).toBe(200);

      const res = await get('admin', `/api/coverage/${coverageId}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        teacher: { id: id.enseignante },
        class: { id: violet },
        assignee: { id: id.surveillant },
        source: 'ADMIN_DIRECT',
        durationMinutes: expect.any(Number),
      });
      expect(res.body.startAt).toBeDefined();
      expect(res.body.plannedEndAt).toBeDefined();
      const statuses = (
        res.body.history as Array<{
          type: string;
          toValue: { status?: string };
          actor: { id: string } | null;
          createdAt: string;
        }>
      )
        .filter((e) => e.type === 'STATUS_CHANGED')
        .map((e) => [e.toValue.status, e.actor?.id ?? null, Boolean(e.createdAt)]);
      expect(statuses).toEqual([
        ['ACCEPTED', id.admin, true],
        ['ON_DUTY', id.surveillant, true],
        ['DONE', id.surveillant, true],
        ['CLOSED', null, true],
      ]);
    });
  });
});
