import type { RequestStatus } from '@prisma/client';
import {
  ACTIVE_STATUSES,
  average,
  countByGroup,
  dayIn,
  durationsOf,
  fillDays,
  groupOf,
  hasTrackedDeadline,
  isValidTimeZone,
  STATUS_GROUP_KEYS,
  STATUS_GROUPS,
  summarizePerformance,
  type PerformanceRow,
  type StatusTransition,
} from '../../src/dashboard/domain/dashboard-metrics';
import { ALL_STATUSES } from '../../src/requests/domain/request-state-machine';

const MIN = 60_000;
const T0 = new Date('2026-10-01T08:00:00.000Z').getTime();

/** Suite de statuts, chacun `minutes` après le précédent (la première à T0). */
function timeline(...steps: Array<[RequestStatus, number]>): StatusTransition[] {
  let at = T0;
  return steps.map(([to, minutes]) => {
    at += minutes * MIN;
    return { to, at: new Date(at) };
  });
}

function row(patch: Partial<PerformanceRow>): PerformanceRow {
  return {
    priority: 'NORMAL',
    status: 'CLOSED',
    overdue: false,
    tracked: true,
    durations: { validationMs: null, takeoverMs: null, resolutionMs: null, grossResolutionMs: null },
    firstReplyMs: null,
    ...patch,
  };
}

describe('Tableau de bord : groupes de statuts', () => {
  it('range chaque statut soumis dans exactement un groupe, et jamais le brouillon', () => {
    for (const status of ALL_STATUSES) {
      const groups = STATUS_GROUP_KEYS.filter((k) => (STATUS_GROUPS[k] as readonly string[]).includes(status));
      expect({ status, count: groups.length }).toEqual({ status, count: status === 'DRAFT' ? 0 : 1 });
    }
    expect(groupOf('DRAFT')).toBeNull();
    expect(groupOf('BROADCAST')).toBeNull();
  });

  it('compte chaque demande une seule fois, le total égale la somme des groupes', () => {
    const counts = countByGroup([
      { status: 'SENT', count: 2 },
      { status: 'ACCEPTED', count: 1 },
      { status: 'TO_CORRECT', count: 1 },
      { status: 'DONE', count: 1 },
      { status: 'CLOSED', count: 3 },
      { status: 'REJECTED', count: 1 },
      { status: 'DRAFT', count: 5 },
    ]);
    expect(counts).toEqual({
      pendingValidation: 0,
      pendingTakeover: 2,
      inProgress: 2,
      done: 4,
      rejected: 1,
      cancelled: 0,
      total: 9,
    });
    expect(STATUS_GROUP_KEYS.reduce((sum, k) => sum + counts[k], 0)).toBe(counts.total);
  });

  it('considère comme actives les demandes à valider, envoyées ou en cours', () => {
    expect([...ACTIVE_STATUSES].sort()).toEqual(['ACCEPTED', 'IN_PROGRESS', 'PENDING_ADMIN_VALIDATION', 'SENT', 'TO_CORRECT']);
  });
});

describe('Tableau de bord : délais', () => {
  it('mesure validation, prise en charge et traitement d’un parcours simple', () => {
    const d = durationsOf(
      timeline(['PENDING_ADMIN_VALIDATION', 0], ['SENT', 10], ['ACCEPTED', 5], ['IN_PROGRESS', 2], ['DONE', 30], ['CLOSED', 60]),
    );
    expect(d).toEqual({ validationMs: 10 * MIN, takeoverMs: 5 * MIN, resolutionMs: 37 * MIN, grossResolutionMs: 37 * MIN });
  });

  it('exclut les suspensions (à corriger, attente de validation finale) du traitement net', () => {
    const d = durationsOf(
      timeline(
        ['SENT', 0],
        ['ACCEPTED', 4],
        ['IN_PROGRESS', 1],
        ['DONE', 10],
        ['PENDING_FINAL_VALIDATION', 0],
        ['TO_CORRECT', 120],
        ['IN_PROGRESS', 60],
        ['DONE', 5],
      ),
    );
    expect(d.takeoverMs).toBe(4 * MIN);
    expect(d.resolutionMs).toBe(20 * MIN);
    expect(d.grossResolutionMs).toBe(200 * MIN);
  });

  it('garde la première prise en charge après une réaffectation', () => {
    const d = durationsOf(timeline(['SENT', 0], ['ACCEPTED', 3], ['SENT', 20], ['ACCEPTED', 7], ['IN_PROGRESS', 0], ['DONE', 10]));
    expect(d.takeoverMs).toBe(3 * MIN);
    expect(d.resolutionMs).toBe(40 * MIN);
  });

  it('ne mesure rien qui n’a pas eu lieu', () => {
    expect(durationsOf(timeline(['SENT', 0]))).toEqual({ validationMs: null, takeoverMs: null, resolutionMs: null, grossResolutionMs: null });
    expect(durationsOf(timeline(['PENDING_ADMIN_VALIDATION', 0])).validationMs).toBeNull();
    expect(durationsOf(timeline(['SENT', 0], ['CANCELLED', 3])).takeoverMs).toBeNull();
    expect(durationsOf([])).toEqual({ validationMs: null, takeoverMs: null, resolutionMs: null, grossResolutionMs: null });
  });

  it('calcule la moyenne sur les seules demandes mesurées', () => {
    expect(average([MIN, null, 3 * MIN])).toEqual({ avgMs: 2 * MIN, count: 2 });
    expect(average([null])).toEqual({ avgMs: null, count: 0 });
  });
});

describe('Tableau de bord : respect des délais', () => {
  it('ne compte que les demandes terminées ayant une étape suivie', () => {
    const stats = summarizePerformance([
      row({ status: 'CLOSED' }),
      row({ status: 'DONE', overdue: true }),
      row({ status: 'PENDING_FINAL_VALIDATION' }),
      row({ status: 'IN_PROGRESS', overdue: true }), // en cours : jamais compté
      row({ status: 'CLOSED', tracked: false }), // sans délai : non évaluable
      row({ status: 'CANCELLED', overdue: true }),
    ]);
    expect(stats.compliance).toEqual({ evaluated: 3, onTime: 2, rate: 2 / 3 });
  });

  it('moyenne la première réponse sur les seules demandes ayant reçu une réponse', () => {
    const stats = summarizePerformance([
      row({ firstReplyMs: 2 * MIN, durations: { validationMs: null, takeoverMs: 10 * MIN, resolutionMs: null, grossResolutionMs: null } }),
      row({ firstReplyMs: 4 * MIN }),
      row({ firstReplyMs: null }),
    ]);
    expect(stats.firstReply).toEqual({ avgMs: 3 * MIN, count: 2 });
    // Mesure distincte de la prise en charge.
    expect(stats.takeover).toEqual({ avgMs: 10 * MIN, count: 1 });
  });

  it('renvoie un taux nul sans demande évaluable', () => {
    expect(summarizePerformance([row({ status: 'SENT' })]).compliance).toEqual({ evaluated: 0, onTime: 0, rate: null });
  });

  it('reconnaît une étape suivie dans l’instantané des règles', () => {
    expect(hasTrackedDeadline({ validationMinutes: null, takeoverMinutes: 5, completionMinutes: null })).toBe(true);
    expect(hasTrackedDeadline({ validationMinutes: null, takeoverMinutes: null, completionMinutes: null })).toBe(false);
    expect(hasTrackedDeadline({ takeoverMinutes: 0 })).toBe(false);
    expect(hasTrackedDeadline(null)).toBe(false);
  });
});

describe('Tableau de bord : série quotidienne', () => {
  it('produit une série continue, jours vides compris', () => {
    const points = fillDays('2026-10-30', '2026-11-02', new Map([['2026-10-30', 2], ['2026-11-02', 1]]), new Map([['2026-10-31', 1]]));
    expect(points).toEqual([
      { day: '2026-10-30', created: 2, completed: 0 },
      { day: '2026-10-31', created: 0, completed: 1 },
      { day: '2026-11-01', created: 0, completed: 0 },
      { day: '2026-11-02', created: 1, completed: 0 },
    ]);
  });

  it('calcule le jour dans le fuseau demandé', () => {
    const lateEvening = new Date('2026-10-15T23:30:00.000Z');
    expect(dayIn(lateEvening, 'UTC')).toBe('2026-10-15');
    expect(dayIn(lateEvening, 'Europe/Paris')).toBe('2026-10-16');
    expect(isValidTimeZone('Africa/Tunis')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
