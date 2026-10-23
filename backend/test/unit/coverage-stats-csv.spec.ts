import {
  statsCsvFilename,
  statsToCsvRows,
  type StatsExport,
} from '../../src/coverage/domain/coverage-stats-csv';
import type { StatsCounters } from '../../src/coverage/domain/coverage-stats';

/** Spec 008 (FR-002 à FR-005, research R2 à R4) : fichier identique à la page des statistiques. */

function counters(extra: Partial<StatsCounters> = {}): StatsCounters {
  return {
    events: 0,
    lateness: 0,
    absence: 0,
    emptyClass: 0,
    cancelled: 0,
    unfilled: 0,
    unfilledRate: 0,
    averageDurationMinutes: null,
    ...extra,
  };
}

function exportOf(extra: Partial<StatsExport> = {}): StatsExport {
  return {
    from: '2026-10-01',
    to: '2026-10-23',
    groupBy: 'teacher',
    period: 'week',
    timezone: 'Europe/Paris',
    totals: { ...counters(), undecidedDuplicates: 0 },
    rows: [],
    ...extra,
  };
}

const COLUMNS = [
  'Événements',
  'Retards',
  'Absences',
  'Classes vides',
  'Non pourvues',
  'Annulées',
  'Durée moyenne',
];

describe('statsToCsvRows', () => {
  it('par enseignant : en-tête, lignes dans l’ordre reçu, total, puis contexte', () => {
    const { header, rows } = statsToCsvRows(
      exportOf({
        totals: {
          ...counters({
            events: 6,
            lateness: 4,
            absence: 1,
            emptyClass: 1,
            unfilled: 1,
            cancelled: 1,
            unfilledRate: 0.166,
            averageDurationMinutes: 55,
          }),
          undecidedDuplicates: 2,
        },
        rows: [
          {
            key: 'ens-2',
            label: 'Mme Durand',
            ...counters({ events: 4, lateness: 3, absence: 1, unfilled: 1, averageDurationMinutes: 65 }),
          },
          { key: 'anonymized', label: 'Enseignant anonymisé', ...counters({ events: 1, lateness: 1, averageDurationMinutes: 45 }) },
          { key: 'none', label: 'Enseignant non précisé', ...counters({ events: 1, emptyClass: 1, cancelled: 1 }) },
        ],
      }),
    );
    expect(header).toEqual(['Enseignant', ...COLUMNS]);
    expect(rows).toEqual([
      ['Mme Durand', 4, 3, 1, 0, 1, 0, '1 h 05'],
      ['Enseignant anonymisé', 1, 1, 0, 0, 0, 0, '45 min'],
      ['Enseignant non précisé', 1, 0, 0, 1, 0, 1, ''],
      ['Total de la période', 6, 4, 1, 1, 1, 1, '55 min'],
      [],
      ['Du', '2026-10-01'],
      ['Au', '2026-10-23'],
      ['Fuseau', 'Europe/Paris'],
      ['Regroupement', 'Enseignant'],
      ['Taux de non pourvue', '17 %'],
      ['Doublons non tranchés (comptés une fois)', 2],
    ]);
  });

  it('par classe : en-tête « Classe », sans ligne « Période »', () => {
    const { header, rows } = statsToCsvRows(
      exportOf({ groupBy: 'class', rows: [{ key: 'k1', label: '6e A', ...counters({ events: 2, lateness: 2 }) }] }),
    );
    expect(header[0]).toBe('Classe');
    expect(rows[0]).toEqual(['6e A', 2, 2, 0, 0, 0, 0, '']);
    expect(rows).toContainEqual(['Regroupement', 'Classe']);
    expect(rows.find((r) => r[0] === 'Période')).toBeUndefined();
  });

  it.each([
    ['week', 'Semaine', 'Semaine du 06/10/2026'],
    ['month', 'Mois', 'octobre 2026'],
  ] as const)('par période (%s) : libellé de ligne repris tel quel, granularité dans le contexte', (period, granularity, label) => {
    const { header, rows } = statsToCsvRows(
      exportOf({ groupBy: 'period', period, rows: [{ key: 'p', label, ...counters({ events: 1 }) }] }),
    );
    expect(header[0]).toBe('Période');
    expect(rows[0][0]).toBe(label);
    expect(rows).toContainEqual(['Regroupement', 'Période']);
    expect(rows).toContainEqual(['Période', granularity]);
  });

  it.each([
    [null, ''],
    [45, '45 min'],
    [60, '1 h'],
    [65, '1 h 05'],
    [125, '2 h 05'],
  ])('durée moyenne %s → « %s » (comme formatDuration de la page)', (minutes, text) => {
    const { rows } = statsToCsvRows(
      exportOf({ totals: { ...counters({ averageDurationMinutes: minutes }), undecidedDuplicates: 0 } }),
    );
    expect(rows[0]).toEqual(['Total de la période', 0, 0, 0, 0, 0, 0, text]);
  });

  it.each([
    [0, '0 %'],
    [0.166, '17 %'],
    [0.5, '50 %'],
    [1, '100 %'],
  ])('taux de non pourvue %s → « %s » (comme la page)', (rate, text) => {
    const { rows } = statsToCsvRows(
      exportOf({ totals: { ...counters({ unfilledRate: rate }), undecidedDuplicates: 0 } }),
    );
    expect(rows).toContainEqual(['Taux de non pourvue', text]);
  });

  it('période vide : total à zéro et contexte, sans ligne de détail', () => {
    const { rows } = statsToCsvRows(exportOf());
    expect(rows[0]).toEqual(['Total de la période', 0, 0, 0, 0, 0, 0, '']);
    expect(rows[1]).toEqual([]);
    expect(rows).toContainEqual(['Doublons non tranchés (comptés une fois)', 0]);
  });
});

describe('statsCsvFilename', () => {
  it.each([
    [{ groupBy: 'teacher' }, 'statistiques-affectations-enseignant-2026-10-01-au-2026-10-23.csv'],
    [{ groupBy: 'class' }, 'statistiques-affectations-classe-2026-10-01-au-2026-10-23.csv'],
    [{ groupBy: 'period', period: 'week' }, 'statistiques-affectations-semaine-2026-10-01-au-2026-10-23.csv'],
    [{ groupBy: 'period', period: 'month' }, 'statistiques-affectations-mois-2026-10-01-au-2026-10-23.csv'],
  ] as const)('%o → %s', (extra, name) => {
    expect(statsCsvFilename(exportOf(extra))).toBe(name);
  });
});
