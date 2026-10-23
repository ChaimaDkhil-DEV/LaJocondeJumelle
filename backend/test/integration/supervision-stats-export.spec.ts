import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { clearCoverages, createCoverage, type CoverageFixture } from '../utils/coverage-fixtures';
import { createTestApp } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Spec 008 — export CSV des statistiques des affectations (`GET /api/coverage/stats/export.csv`) :
 * fichier identique à `GET /api/coverage/stats` (FR-002 à FR-005, SC-002).
 */
describe('Export des statistiques des affectations (008)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookie: Record<string, string> = {};
  const id: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const get = (who: string, path: string) => api().get(path).set('Cookie', cookie[who]);
  const stats = (who: string, query: string) => get(who, `/api/coverage/stats?${query}`);
  const exportCsv = (who: string, query: string) => get(who, `/api/coverage/stats/export.csv?${query}`);

  /** Septembre 2026, heures de Paris (UTC+2). */
  const sept = (day: number, hour = 10) => new Date(Date.UTC(2026, 8, day, hour - 2));
  const SEPTEMBER = 'from=2026-09-01&to=2026-09-30';

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

  /** Lignes du fichier (BOM retiré, séparateur « ; ») ; le fichier ne contient pas de « ; » cité ici. */
  const lines = (text: string) =>
    text
      .replace(String.fromCharCode(0xfeff), '')
      .split('\r\n')
      .slice(0, -1)
      .map((l) => (l === '' ? [] : l.split(';')));

  type Row = {
    label: string;
    events: number;
    lateness: number;
    absence: number;
    emptyClass: number;
    unfilled: number;
    cancelled: number;
  };
  const counts = (r: Row) =>
    [r.events, r.lateness, r.absence, r.emptyClass, r.unfilled, r.cancelled].map(String);

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    await prisma.category.updateMany({ where: { kind: 'COVERAGE' }, data: { proofMode: 'QR' } });
    app = await createTestApp();
    for (const who of ['enseignante', 'admin', 'superadmin', 'surveillant']) {
      cookie[who] = await loginAs(app, who);
      id[who] = await userId(prisma, who);
    }
  });

  beforeEach(async () => {
    await clearCoverages(prisma);
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
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('fichier (US1)', () => {
    it('admin, par enseignant : en-têtes, nom du fichier, BOM, en-tête de colonnes', async () => {
      const res = await exportCsv('admin', `${SEPTEMBER}&groupBy=teacher`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="statistiques-affectations-enseignant-2026-09-01-au-2026-09-30.csv"',
      );
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.text.charCodeAt(0)).toBe(0xfeff); // BOM UTF-8 pour les tableurs
      expect(lines(res.text)[0]).toEqual([
        'Enseignant',
        'Événements',
        'Retards',
        'Absences',
        'Classes vides',
        'Non pourvues',
        'Annulées',
        'Durée moyenne',
      ]);
    });

    it.each([
      ['groupBy=teacher', 'Enseignant'],
      ['groupBy=class', 'Classe'],
      ['groupBy=period&period=week', 'Période'],
      ['groupBy=period&period=month', 'Période'],
    ])('%s : chaque ligne et le total égaux à GET /api/coverage/stats (SC-002)', async (query, first) => {
      const json = (await stats('admin', `${SEPTEMBER}&${query}`)).body;
      const csv = lines((await exportCsv('admin', `${SEPTEMBER}&${query}`)).text);
      expect(csv[0][0]).toBe(first);
      const body = csv.slice(1, 1 + json.rows.length);
      expect(body.map((l) => l.slice(0, 7))).toEqual(
        json.rows.map((r: Row) => [r.label, ...counts(r)]),
      );
      expect(csv[1 + json.rows.length].slice(0, 7)).toEqual([
        'Total de la période',
        ...counts(json.totals),
      ]);
      expect(csv[1 + json.rows.length][7]).toBe('30 min');
      expect(csv).toContainEqual(['Taux de non pourvue', '25 %']);
      expect(csv).toContainEqual(['Doublons non tranchés (comptés une fois)', '0']);
      expect(csv).toContainEqual(['Du', '2026-09-01']);
      expect(csv).toContainEqual(['Au', '2026-09-30']);
    });

    it('nom commençant par « = » neutralisé ; enseignant anonymisé sous son libellé', async () => {
      const autre = await prisma.user.findUniqueOrThrow({ where: { username: 'autre' } });
      await prisma.user.update({ where: { id: autre.id }, data: { displayName: '=SOMME(A1)' } });
      try {
        await finished({ teacher: 'autre', startAt: sept(25) });
        const anonymized = await finished({ startAt: sept(26) });
        await prisma.coverageDetail.update({
          where: { requestId: anonymized },
          data: { teacherId: null, anonymizedAt: new Date() },
        });
        const csv = lines((await exportCsv('admin', `${SEPTEMBER}&groupBy=teacher`)).text);
        const labels = csv.map((l) => l[0]);
        expect(labels).toContain("'=SOMME(A1)");
        expect(labels).not.toContain('=SOMME(A1)');
        expect(labels).toContain('Enseignant anonymisé');
      } finally {
        await prisma.user.update({ where: { id: autre.id }, data: { displayName: autre.displayName } });
      }
    });

    it('super administrateur : fichier obtenu', async () => {
      const res = await exportCsv('superadmin', `${SEPTEMBER}&groupBy=class`);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('statistiques-affectations-classe-');
    });
  });

  describe('accès, période et journal (US2, FR-006, FR-007, FR-009)', () => {
    const exports = (actorId?: string) =>
      prisma.auditLog.findMany({
        where: { action: 'COVERAGE_STATS_EXPORTED', ...(actorId ? { actorId } : {}) },
        orderBy: { createdAt: 'asc' },
      });

    it.each(['surveillant', 'enseignante'])('%s : 404, refus journalisé, aucun export tracé', async (who) => {
      const denied = () =>
        prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId: id[who] } });
      const before = await denied();
      const res = await exportCsv(who, SEPTEMBER);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(await denied()).toBe(before + 1);
      const last = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'ACCESS_DENIED', actorId: id[who] },
        orderBy: { createdAt: 'desc' },
      });
      expect(last.details).toMatchObject({
        reason: 'NOT_COVERAGE_ADMIN',
        route: '/api/coverage/stats/export.csv',
      });
      expect(await exports(id[who])).toHaveLength(0);
    });

    it('sans session : 401', async () => {
      expect((await api().get(`/api/coverage/stats/export.csv?${SEPTEMBER}`)).status).toBe(401);
    });

    it('période inversée : INVALID_RANGE comme la page, aucun export tracé ; paramètre invalide : 400', async () => {
      const before = (await exports()).length;
      const inverted = 'from=2026-09-30&to=2026-09-01';
      const res = await exportCsv('admin', inverted);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_RANGE');
      expect(res.body.error.message).toBe((await stats('admin', inverted)).body.error.message);
      expect((await exportCsv('admin', 'groupBy=enseignant')).status).toBe(400);
      expect(await exports()).toHaveLength(before);
    });

    it('export réussi : une entrée COVERAGE_STATS_EXPORTED, période et regroupement seulement', async () => {
      const before = (await exports(id.admin)).length;
      expect((await exportCsv('admin', `${SEPTEMBER}&groupBy=period&period=month`)).status).toBe(200);
      expect((await exportCsv('admin', `${SEPTEMBER}&groupBy=teacher`)).status).toBe(200);
      const entries = (await exports(id.admin)).slice(before);
      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({ targetType: 'Request', targetId: 'coverage-stats' });
      expect(entries[0].details).toEqual({
        from: '2026-09-01',
        to: '2026-09-30',
        groupBy: 'period',
        period: 'month',
      });
      expect(entries[1].details).toEqual({ from: '2026-09-01', to: '2026-09-30', groupBy: 'teacher' });
      expect(JSON.stringify(entries)).not.toMatch(/Enseignante|events|lateness/);
    });
  });
});
