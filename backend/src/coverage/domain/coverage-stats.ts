import type { CoverageType, MergeProposalStatus, RequestStatus } from '@prisma/client';
import { addDays, localDate } from '../../common/school-time';

/**
 * Statistiques des affectations (data-model §7, FR-022, FR-008i, FR-015b, FR-015h). Pur : calcul à
 * la demande sur les affectations de la période, sans table d'agrégats.
 *
 * - événement : affectation finale (terminée ou non pourvue), hors annulées, hors absorbées par un
 *   rattachement (`mergedIntoId`) et hors relèves (comptées avec l'affectation d'origine) ;
 * - doublon en suspens : la paire compte pour un seul événement ; « non tranché » une fois
 *   présentée une dernière fois ; refusé : deux ; confirmé : un ;
 * - annulées : comptées à part.
 */

export interface StatsCoverage {
  id: string;
  status: RequestStatus;
  type: CoverageType | null;
  teacher: { id: string; displayName: string } | null;
  class: { id: string; name: string };
  startAt: Date;
  durationMinutes: number | null;
  mergedIntoId: string | null;
  reliefForId: string | null;
  anonymizedAt: Date | null;
}

export interface StatsProposal {
  sourceId: string;
  targetId: string;
  status: MergeProposalStatus;
  finalPresentedAt: Date | null;
}

export interface StatsOptions {
  groupBy: 'teacher' | 'class' | 'period';
  period: 'week' | 'month';
  timezone: string;
}

export interface StatsCounters {
  events: number;
  lateness: number;
  absence: number;
  emptyClass: number;
  cancelled: number;
  unfilled: number;
  /** Non pourvues / événements (0 sans événement). */
  unfilledRate: number;
  /** Moyenne des durées des affectations terminées ; null sans durée connue. */
  averageDurationMinutes: number | null;
}

export interface StatsRow extends StatsCounters {
  key: string;
  label: string;
}

export interface CoverageStats {
  totals: StatsCounters & { undecidedDuplicates: number };
  rows: StatsRow[];
}

export const NO_TEACHER_LABEL = 'Enseignant non précisé';
export const ANONYMIZED_TEACHER_LABEL = 'Enseignant anonymisé';

const EVENT_STATUSES: readonly RequestStatus[] = ['DONE', 'CLOSED', 'UNFILLED'];
const FINISHED: readonly RequestStatus[] = ['DONE', 'CLOSED'];

const MONTH_LABEL = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

interface Accumulator {
  events: number;
  lateness: number;
  absence: number;
  emptyClass: number;
  cancelled: number;
  unfilled: number;
  durations: number[];
}

const empty = (): Accumulator => ({ events: 0, lateness: 0, absence: 0, emptyClass: 0, cancelled: 0, unfilled: 0, durations: [] });

function counters(a: Accumulator): StatsCounters {
  return {
    events: a.events,
    lateness: a.lateness,
    absence: a.absence,
    emptyClass: a.emptyClass,
    cancelled: a.cancelled,
    unfilled: a.unfilled,
    unfilledRate: a.events === 0 ? 0 : Math.round((a.unfilled / a.events) * 1000) / 1000,
    averageDurationMinutes: a.durations.length === 0 ? null : Math.round(a.durations.reduce((s, d) => s + d, 0) / a.durations.length),
  };
}

/** Lundi (AAAA-MM-JJ) de la semaine d'une date locale. */
function mondayOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = dimanche
  return addDays(date, -((day + 6) % 7));
}

function groupOf(c: StatsCoverage, options: StatsOptions): { key: string; label: string } {
  switch (options.groupBy) {
    case 'teacher':
      if (c.teacher) return { key: c.teacher.id, label: c.teacher.displayName };
      return c.anonymizedAt ? { key: 'anonymized', label: ANONYMIZED_TEACHER_LABEL } : { key: 'none', label: NO_TEACHER_LABEL };
    case 'class':
      return { key: c.class.id, label: c.class.name };
    case 'period': {
      const date = localDate(c.startAt, options.timezone);
      if (options.period === 'month') {
        const key = date.slice(0, 7);
        return { key, label: MONTH_LABEL.format(new Date(`${key}-01T12:00:00Z`)) };
      }
      const monday = mondayOf(date);
      const [y, m, d] = monday.split('-');
      return { key: monday, label: `Semaine du ${d}/${m}/${y}` };
    }
  }
}

export function computeCoverageStats(coverages: readonly StatsCoverage[], proposals: readonly StatsProposal[], options: StatsOptions): CoverageStats {
  const byId = new Map(coverages.map((c) => [c.id, c]));
  const isEvent = (c: StatsCoverage | undefined) => Boolean(c && !c.mergedIntoId && !c.reliefForId && EVENT_STATUSES.includes(c.status));

  // Paire en suspens : un seul événement (la demande conservée si elle en est un, sinon la déclaration).
  const excluded = new Set<string>();
  let undecided = 0;
  for (const p of proposals) {
    if (p.status !== 'PENDING') continue;
    const source = byId.get(p.sourceId);
    const target = byId.get(p.targetId);
    if (isEvent(source) && isEvent(target)) excluded.add(p.sourceId);
    if (p.finalPresentedAt && (source || target)) undecided += 1;
  }

  const total = empty();
  const groups = new Map<string, { label: string; acc: Accumulator }>();
  for (const c of coverages) {
    const cancelled = c.status === 'CANCELLED' && !c.mergedIntoId && !c.reliefForId;
    const event = isEvent(c) && !excluded.has(c.id);
    if (!cancelled && !event) continue;
    const { key, label } = groupOf(c, options);
    const group = groups.get(key) ?? { label, acc: empty() };
    groups.set(key, group);
    for (const acc of [total, group.acc]) {
      if (cancelled) {
        acc.cancelled += 1;
        continue;
      }
      acc.events += 1;
      if (c.type === 'LATENESS') acc.lateness += 1;
      if (c.type === 'ABSENCE') acc.absence += 1;
      if (c.type === 'EMPTY_CLASS') acc.emptyClass += 1;
      if (c.status === 'UNFILLED') acc.unfilled += 1;
      if (FINISHED.includes(c.status) && c.durationMinutes !== null) acc.durations.push(c.durationMinutes);
    }
  }

  const rows = [...groups.entries()].map(([key, g]) => ({ key, label: g.label, ...counters(g.acc) }));
  rows.sort((a, b) =>
    options.groupBy === 'period' ? a.key.localeCompare(b.key) : b.events - a.events || a.label.localeCompare(b.label, 'fr'),
  );
  return { totals: { ...counters(total), undecidedDuplicates: undecided }, rows };
}
