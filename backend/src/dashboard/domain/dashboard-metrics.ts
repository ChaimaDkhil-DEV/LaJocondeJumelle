import type { Priority, RequestStatus } from '@prisma/client';

/**
 * Tableau de bord du super administrateur — règles de calcul (module pur, sans base).
 * Périmètre : demandes de travail (kind = WORK) hors brouillons ; les couvertures de classe ont
 * leur propre suivi (coverage/coverage-admin.service.ts).
 *
 * Délais, mesurés sur l'historique des statuts (RequestEvent STATUS_CHANGED, ordre `seq`) :
 * - validation : entrée en « À valider » → statut suivant ;
 * - prise en charge (première réponse) : premier « Envoyée » → première acceptation ;
 * - traitement net : du premier « Envoyée » au dernier « Terminée », temps passé dans les seuls
 *   statuts Envoyée, Acceptée et En cours. Les suspensions (À corriger, Terminée en attente,
 *   À valider en fin de traitement) sont exclues ;
 * - traitement brut : même intervalle, suspensions comprises.
 * Les moyennes ne portent que sur les demandes pour lesquelles la mesure existe (n indiqué).
 */

/** Chaque statut d'une demande de travail soumise appartient à exactement un groupe. */
export const STATUS_GROUPS = {
  pendingValidation: ['PENDING_ADMIN_VALIDATION'],
  pendingTakeover: ['SENT'],
  inProgress: ['ACCEPTED', 'IN_PROGRESS', 'TO_CORRECT'],
  done: ['DONE', 'PENDING_FINAL_VALIDATION', 'CLOSED'],
  rejected: ['REJECTED'],
  cancelled: ['CANCELLED'],
} as const satisfies Record<string, readonly RequestStatus[]>;

export type StatusGroup = keyof typeof STATUS_GROUPS;

export const STATUS_GROUP_KEYS = Object.keys(STATUS_GROUPS) as StatusGroup[];

/** Demandes encore à traiter (ni terminées, ni rejetées, ni annulées). */
export const ACTIVE_STATUSES: readonly RequestStatus[] = [
  ...STATUS_GROUPS.pendingValidation,
  ...STATUS_GROUPS.pendingTakeover,
  ...STATUS_GROUPS.inProgress,
];

/** Statuts où un employé devrait être affecté. */
export const ASSIGNED_STATUSES: readonly RequestStatus[] = [...STATUS_GROUPS.pendingTakeover, ...STATUS_GROUPS.inProgress];

export const DONE_STATUSES: readonly RequestStatus[] = STATUS_GROUPS.done;

export function groupOf(status: RequestStatus): StatusGroup | null {
  for (const key of STATUS_GROUP_KEYS) {
    if ((STATUS_GROUPS[key] as readonly RequestStatus[]).includes(status)) return key;
  }
  return null;
}

export type GroupCounts = Record<StatusGroup, number> & { total: number };

/** Compteurs par groupe à partir d'un comptage par statut (les statuts hors groupe sont ignorés). */
export function countByGroup(byStatus: ReadonlyArray<{ status: RequestStatus; count: number }>): GroupCounts {
  const counts = Object.fromEntries(STATUS_GROUP_KEYS.map((k) => [k, 0])) as GroupCounts;
  counts.total = 0;
  for (const { status, count } of byStatus) {
    const group = groupOf(status);
    if (!group) continue;
    counts[group] += count;
    counts.total += count;
  }
  return counts;
}

export interface StatusTransition {
  to: RequestStatus;
  at: Date;
}

export interface RequestDurations {
  validationMs: number | null;
  takeoverMs: number | null;
  resolutionMs: number | null;
  grossResolutionMs: number | null;
}

const WORKING: ReadonlySet<RequestStatus> = new Set<RequestStatus>(['SENT', 'ACCEPTED', 'IN_PROGRESS']);

/** Délais d'une demande à partir de ses changements de statut, dans l'ordre d'écriture. */
export function durationsOf(transitions: readonly StatusTransition[]): RequestDurations {
  const result: RequestDurations = { validationMs: null, takeoverMs: null, resolutionMs: null, grossResolutionMs: null };

  const validation = transitions.findIndex((t) => t.to === 'PENDING_ADMIN_VALIDATION');
  if (validation >= 0 && validation + 1 < transitions.length) {
    result.validationMs = transitions[validation + 1].at.getTime() - transitions[validation].at.getTime();
  }

  const firstSent = transitions.findIndex((t) => t.to === 'SENT');
  if (firstSent < 0) return result;

  const accepted = transitions.findIndex((t, i) => i > firstSent && t.to === 'ACCEPTED');
  if (accepted >= 0) result.takeoverMs = transitions[accepted].at.getTime() - transitions[firstSent].at.getTime();

  const lastDone = transitions.findLastIndex((t) => t.to === 'DONE');
  if (lastDone > firstSent) {
    result.grossResolutionMs = transitions[lastDone].at.getTime() - transitions[firstSent].at.getTime();
    let net = 0;
    for (let i = firstSent; i < lastDone; i += 1) {
      if (WORKING.has(transitions[i].to)) net += transitions[i + 1].at.getTime() - transitions[i].at.getTime();
    }
    result.resolutionMs = net;
  }
  return result;
}

export interface DurationStats {
  /** Moyenne en millisecondes, null sans mesure. */
  avgMs: number | null;
  /** Nombre de demandes mesurées. */
  count: number;
}

export function average(values: ReadonlyArray<number | null>): DurationStats {
  const measured = values.filter((v): v is number => v !== null);
  if (measured.length === 0) return { avgMs: null, count: 0 };
  return { avgMs: Math.round(measured.reduce((a, b) => a + b, 0) / measured.length), count: measured.length };
}

/** Durées copiées dans l'instantané des règles (FR-022). */
export interface SnapshotDeadlines {
  validationMinutes?: number | null;
  takeoverMinutes?: number | null;
  completionMinutes?: number | null;
}

/** Vrai si au moins une étape de la demande avait un délai. */
export function hasTrackedDeadline(snapshot: SnapshotDeadlines | null | undefined): boolean {
  if (!snapshot) return false;
  return [snapshot.validationMinutes, snapshot.takeoverMinutes, snapshot.completionMinutes].some(
    (m) => typeof m === 'number' && m > 0,
  );
}

export interface PerformanceRow {
  priority: Priority;
  status: RequestStatus;
  /** Au moins un événement OVERDUE dans l'historique. */
  overdue: boolean;
  /** Au moins une étape suivie (délai défini dans l'instantané). */
  tracked: boolean;
  durations: RequestDurations;
}

export interface Compliance {
  /** Demandes terminées dont au moins une étape avait un délai. */
  evaluated: number;
  /** Parmi elles, demandes sans aucun retard. */
  onTime: number;
  /** onTime / evaluated, null si aucune demande évaluée. */
  rate: number | null;
}

export interface PerformanceStats {
  validation: DurationStats;
  takeover: DurationStats;
  resolution: DurationStats;
  grossResolution: DurationStats;
  compliance: Compliance;
}

/**
 * Taux de respect des délais : parmi les demandes terminées ayant au moins une étape suivie,
 * part de celles qui n'ont jamais été en retard. Une demande en cours n'est jamais comptée.
 */
export function summarizePerformance(rows: readonly PerformanceRow[]): PerformanceStats {
  const evaluatedRows = rows.filter((r) => r.tracked && DONE_STATUSES.includes(r.status));
  const onTime = evaluatedRows.filter((r) => !r.overdue).length;
  return {
    validation: average(rows.map((r) => r.durations.validationMs)),
    takeover: average(rows.map((r) => r.durations.takeoverMs)),
    resolution: average(rows.map((r) => r.durations.resolutionMs)),
    grossResolution: average(rows.map((r) => r.durations.grossResolutionMs)),
    compliance: {
      evaluated: evaluatedRows.length,
      onTime,
      rate: evaluatedRows.length === 0 ? null : onTime / evaluatedRows.length,
    },
  };
}

/** Jour calendaire (AAAA-MM-JJ) d'un instant dans un fuseau IANA. */
export function dayIn(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Vrai si le fuseau IANA est connu de l'environnement d'exécution. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export interface DayPoint {
  day: string;
  created: number;
  completed: number;
}

/** Série quotidienne continue de `fromDay` à `toDay` inclus ; les jours sans donnée valent 0. */
export function fillDays(
  fromDay: string,
  toDay: string,
  created: ReadonlyMap<string, number>,
  completed: ReadonlyMap<string, number>,
): DayPoint[] {
  const points: DayPoint[] = [];
  const cursor = new Date(`${fromDay}T00:00:00.000Z`);
  const end = new Date(`${toDay}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    const day = cursor.toISOString().slice(0, 10);
    points.push({ day, created: created.get(day) ?? 0, completed: completed.get(day) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return points;
}
