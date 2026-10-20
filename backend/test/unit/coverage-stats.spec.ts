import {
  computeCoverageStats,
  type StatsCoverage,
  type StatsProposal,
} from '../../src/coverage/domain/coverage-stats';

/** T075 — Statistiques des affectations (data-model §7, FR-022, FR-008i, FR-015b, FR-015h). */

const TZ = 'Europe/Paris';
let seq = 0;

function cov(extra: Partial<StatsCoverage> = {}): StatsCoverage {
  seq += 1;
  return {
    id: `c${seq}`,
    status: 'CLOSED',
    type: 'LATENESS',
    teacher: { id: 'ens-1', displayName: 'Enseignante' },
    class: { id: 'k1', name: '1ère année Violet' },
    // Mardi 20 octobre 2026, 10 h à Paris.
    startAt: new Date('2026-10-20T08:00:00Z'),
    durationMinutes: 30,
    mergedIntoId: null,
    reliefForId: null,
    anonymizedAt: null,
    ...extra,
  };
}

const stats = (
  coverages: StatsCoverage[],
  proposals: StatsProposal[] = [],
  groupBy: 'teacher' | 'class' | 'period' = 'teacher',
  period: 'week' | 'month' = 'week',
) => computeCoverageStats(coverages, proposals, { groupBy, period, timezone: TZ });

describe('Statistiques des affectations', () => {
  it('événements : affectations finales hors annulées ; types ; durée moyenne des terminées ; taux de non pourvue', () => {
    const { totals } = stats([
      cov({ type: 'LATENESS', durationMinutes: 20 }),
      cov({ type: 'ABSENCE', status: 'DONE', durationMinutes: 40 }),
      cov({ type: 'EMPTY_CLASS', durationMinutes: null }),
      cov({ type: 'ABSENCE', status: 'UNFILLED', durationMinutes: null }),
      cov({ status: 'CANCELLED' }),
      cov({ status: 'CANCELLED' }),
      cov({ status: 'ON_DUTY' }), // non finale : pas encore un événement
      cov({ status: 'PENDING' }),
    ]);
    expect(totals).toEqual({
      events: 4,
      lateness: 1,
      absence: 2,
      emptyClass: 1,
      cancelled: 2,
      unfilled: 1,
      unfilledRate: 0.25,
      averageDurationMinutes: 30,
      undecidedDuplicates: 0,
    });
  });

  it('aucune donnée : zéros, durée moyenne inconnue', () => {
    expect(stats([]).totals).toMatchObject({
      events: 0,
      unfilledRate: 0,
      averageDurationMinutes: null,
    });
  });

  it('par enseignant : « Enseignant non précisé » et « Enseignant anonymisé » à part ; tri par nombre', () => {
    const { rows } = stats([
      cov(),
      cov(),
      cov({ teacher: { id: 'ens-2', displayName: 'Collègue' } }),
      cov({ teacher: null }),
      cov({ teacher: null, anonymizedAt: new Date() }),
      cov({ status: 'CANCELLED', teacher: { id: 'ens-2', displayName: 'Collègue' } }),
    ]);
    expect(rows.map((r) => [r.label, r.events, r.cancelled])).toEqual([
      ['Enseignante', 2, 0],
      ['Collègue', 1, 1],
      ['Enseignant anonymisé', 1, 0],
      ['Enseignant non précisé', 1, 0],
    ]);
    expect(rows.find((r) => r.label === 'Enseignant non précisé')?.key).toBe('none');
  });

  it('par classe', () => {
    const { rows } = stats(
      [cov(), cov({ class: { id: 'k2', name: '2e année Bleu' } }), cov()],
      [],
      'class',
    );
    expect(rows.map((r) => [r.key, r.label, r.events])).toEqual([
      ['k1', '1ère année Violet', 2],
      ['k2', '2e année Bleu', 1],
    ]);
  });

  it('par période, dans le fuseau de l’école : semaine (lundi) et mois', () => {
    const coverages = [
      cov({ startAt: new Date('2026-10-20T08:00:00Z') }),
      // Dimanche 25 octobre 2026 à 23 h 30 à Paris (22 h 30 UTC, passage à l'heure d'hiver ce jour-là).
      cov({ startAt: new Date('2026-10-25T22:30:00Z') }),
      // Lundi 26 octobre à 0 h 30 à Paris (dimanche 23 h 30 UTC).
      cov({ startAt: new Date('2026-10-25T23:30:00Z') }),
      // 1er novembre à 0 h 30 à Paris (31 octobre 23 h 30 UTC).
      cov({ startAt: new Date('2026-10-31T23:30:00Z') }),
    ];
    expect(
      stats(coverages, [], 'period', 'week').rows.map((r) => [r.key, r.label, r.events]),
    ).toEqual([
      ['2026-10-19', 'Semaine du 19/10/2026', 2],
      ['2026-10-26', 'Semaine du 26/10/2026', 2],
    ]);
    expect(
      stats(coverages, [], 'period', 'month').rows.map((r) => [r.key, r.label, r.events]),
    ).toEqual([
      ['2026-10', 'octobre 2026', 3],
      ['2026-11', 'novembre 2026', 1],
    ]);
  });

  it('relève : comptée avec l’affectation d’origine, pas comme un second retard', () => {
    const origin = cov();
    expect(stats([origin, cov({ reliefForId: origin.id })]).totals.events).toBe(1);
  });

  describe('doublons (FR-015h, R6)', () => {
    it('proposition en suspens : la paire compte pour un ; « non tranché » une fois présentée', () => {
      const source = cov({ type: 'EMPTY_CLASS', teacher: null });
      const target = cov();
      const pending: StatsProposal = {
        sourceId: source.id,
        targetId: target.id,
        status: 'PENDING',
        finalPresentedAt: null,
      };
      expect(stats([source, target], [pending]).totals).toMatchObject({
        events: 1,
        undecidedDuplicates: 0,
      });
      const presented = { ...pending, finalPresentedAt: new Date() };
      expect(stats([source, target], [presented]).totals).toMatchObject({
        events: 1,
        undecidedDuplicates: 1,
      });
    });

    it('refusée : deux ; confirmée : un (l’absorbée a mergedIntoId), ni retard ni annulation', () => {
      const source = cov({ type: 'EMPTY_CLASS', teacher: null });
      const target = cov();
      const rejected: StatsProposal = {
        sourceId: source.id,
        targetId: target.id,
        status: 'REJECTED',
        finalPresentedAt: null,
      };
      expect(stats([source, target], [rejected]).totals.events).toBe(2);

      const absorbed = { ...source, status: 'CANCELLED' as const, mergedIntoId: target.id };
      const confirmed: StatsProposal = { ...rejected, status: 'CONFIRMED' };
      expect(stats([absorbed, target], [confirmed]).totals).toMatchObject({
        events: 1,
        cancelled: 0,
      });
    });

    it('en suspens, demande annulée : la déclaration compte (la paire reste un événement)', () => {
      const source = cov({ type: 'EMPTY_CLASS', teacher: null });
      const target = cov({ status: 'CANCELLED' });
      const pending: StatsProposal = {
        sourceId: source.id,
        targetId: target.id,
        status: 'PENDING',
        finalPresentedAt: new Date(),
      };
      expect(stats([source, target], [pending]).totals).toMatchObject({
        events: 1,
        emptyClass: 1,
        cancelled: 1,
        undecidedDuplicates: 1,
      });
    });

    it('correction après coup : décider change le décompte', () => {
      const source = cov({ type: 'EMPTY_CLASS', teacher: null });
      const target = cov();
      const before = stats(
        [source, target],
        [
          {
            sourceId: source.id,
            targetId: target.id,
            status: 'PENDING',
            finalPresentedAt: new Date(),
          },
        ],
      );
      const after = stats(
        [source, target],
        [
          {
            sourceId: source.id,
            targetId: target.id,
            status: 'REJECTED',
            finalPresentedAt: new Date(),
          },
        ],
      );
      expect([before.totals.events, before.totals.undecidedDuplicates]).toEqual([1, 1]);
      expect([after.totals.events, after.totals.undecidedDuplicates]).toEqual([2, 0]);
    });
  });
});
