/**
 * Statut d'une séance d'emploi du temps (020, research R5). Fonction pure : aucune base, aucune horloge
 * (« maintenant » et les réglages sont des paramètres). Le statut n'est jamais stocké : il se lit dans les
 * faits que le pointage enregistre déjà (arrivées par scan ou saisie, départs et retours de 019, retards et
 * absences annoncés, classes déclarées vides de 013). « Non arrivé » est un constat calculé, jamais une
 * absence : l'absence reste une saisie faite par une personne.
 */

const MINUTE_MS = 60_000;

export type SessionStatus = 'UPCOMING' | 'EXPECTED' | 'PRESENT' | 'LATE' | 'NOT_ARRIVED' | 'EXCUSED' | 'CANCELLED';

/** Origine d'un retard : arrivée tardive, classe déclarée vide, retard annoncé, qualification par une personne. */
export type LateReason = 'ARRIVAL' | 'EMPTY_CLASS' | 'ANNOUNCED' | 'QUALIFIED';

export interface StatusSession {
  startAt: Date;
  endAt: Date;
  classId: string;
  cancelled: boolean;
}

/** Un pointage du jour de l'enseignant attendu (une ligne par classe). */
export interface StatusArrival {
  status: 'ARRIVED' | 'ON_TIME' | 'LATE' | 'ABSENT';
  /** Heure réelle ; null pour une saisie sans heure. */
  arrivedAt: Date | null;
  recordedAt: Date;
  classId: string;
}

export interface StatusDeparture {
  departedAt: Date;
  returnedAt: Date | null;
}

/** Demande annoncée par l'enseignant attendu (ni annulée ni fusionnée). `plannedEndAt` null : jusqu'à la fin du jour. */
export interface StatusAnnounced {
  requestId: string;
  type: 'LATENESS' | 'ABSENCE';
  startAt: Date;
  plannedEndAt: Date | null;
}

export interface StatusFacts {
  arrivals: readonly StatusArrival[];
  departures: readonly StatusDeparture[];
  announced: readonly StatusAnnounced[];
  /** Heures des déclarations « classe vide » du jour pour la classe de la séance. */
  emptyClassAt: readonly Date[];
}

export interface StatusRules {
  lateThresholdMinutes: number;
  toleranceMinutes: number;
}

export interface SessionStatusResult {
  status: SessionStatus;
  arrivedAt: Date | null;
  lateMinutes: number | null;
  lateReason: LateReason | null;
  /** Demande annoncée rattachée (absence qui justifie, retard annoncé). */
  requestId: string | null;
}

const instantOf = (a: StatusArrival): Date => a.arrivedAt ?? a.recordedAt;
const minutesBetween = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / MINUTE_MS));
const overlaps = (r: StatusAnnounced, s: StatusSession) => r.startAt < s.endAt && (r.plannedEndAt === null || r.plannedEndAt > s.startAt);

function result(status: SessionStatus, over: Partial<SessionStatusResult> = {}): SessionStatusResult {
  return { status, arrivedAt: null, lateMinutes: null, lateReason: null, requestId: null, ...over };
}

/** Présent dans l'établissement à l'instant `t` : arrivé avant, et pas sur un départ en cours à cet instant. */
function presentAt(t: Date, arrivals: readonly StatusArrival[], departures: readonly StatusDeparture[]): boolean {
  if (!arrivals.some((a) => instantOf(a) <= t)) return false;
  return !departures.some((d) => d.departedAt <= t && (d.returnedAt === null || d.returnedAt > t));
}

export function sessionStatus(session: StatusSession, facts: StatusFacts, now: Date, rules: StatusRules): SessionStatusResult {
  const S = session.startAt;
  const E = session.endAt;
  if (session.cancelled) return result('CANCELLED');

  // Absence justifiée : annoncée par l'enseignant sur la séance, ou saisie par l'administration ce jour-là.
  const absence = facts.announced.find((r) => r.type === 'ABSENCE' && overlaps(r, session));
  if (absence) return result('EXCUSED', { requestId: absence.requestId });
  if (facts.arrivals.some((a) => a.status === 'ABSENT')) return result('EXCUSED');

  const lateness = facts.announced.find((r) => r.type === 'LATENESS' && overlaps(r, session));
  const requestId = lateness?.requestId ?? null;
  // Avant le début, rien n'est encore constaté : même arrivé, l'enseignant peut repartir d'ici là.
  if (now < S) return result('UPCOMING', { requestId });
  const arrivals = facts.arrivals.filter((a) => a.status !== 'ABSENT');

  // Qualification par une personne (saisie ou correction « à l'heure » / « en retard ») dans la classe de la
  // séance : elle l'emporte, si elle date d'avant la fin de la séance et qu'aucun départ ne l'a suivie avant le début.
  const qualified = arrivals.find((a) => {
    if (a.classId !== session.classId || (a.status !== 'ON_TIME' && a.status !== 'LATE')) return false;
    if (a.arrivedAt === null) return true;
    if (a.arrivedAt >= E) return false;
    return !facts.departures.some((d) => d.departedAt >= a.arrivedAt! && d.departedAt <= S && (d.returnedAt === null || d.returnedAt > S));
  });
  if (qualified) {
    if (qualified.status === 'ON_TIME') return result('PRESENT', { arrivedAt: qualified.arrivedAt, requestId });
    return result('LATE', {
      arrivedAt: qualified.arrivedAt,
      lateMinutes: qualified.arrivedAt ? minutesBetween(S, qualified.arrivedAt) : null,
      lateReason: 'QUALIFIED',
      requestId,
    });
  }

  const emptyDuring = facts.emptyClassAt.filter((d) => d >= S && d < E).sort((a, b) => a.getTime() - b.getTime());
  const inClass = arrivals.filter((a) => a.classId === session.classId).map(instantOf);

  // Déjà dans l'établissement au début de la séance.
  if (presentAt(S, arrivals, facts.departures)) {
    // Classe déclarée vide alors qu'il n'y était pas encore arrivé : retard signalé ; jamais « Non arrivé ».
    const declared = emptyDuring.find((d) => !inClass.some((i) => i <= d));
    if (declared) {
      const later = inClass.filter((i) => i > declared && i < E).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
      return result('LATE', { arrivedAt: later, lateMinutes: later ? minutesBetween(S, later) : null, lateReason: 'EMPTY_CLASS', requestId });
    }
    const first = arrivals.map(instantOf).sort((a, b) => a.getTime() - b.getTime())[0];
    return result('PRESENT', { arrivedAt: first, requestId });
  }

  // Arrivée (ou retour) pendant la séance : premier instant où il devient présent.
  const candidates = [...arrivals.map(instantOf), ...facts.departures.flatMap((d) => (d.returnedAt ? [d.returnedAt] : []))]
    .filter((c) => c > S && c < E && c <= now)
    .sort((a, b) => a.getTime() - b.getTime());
  const arrival = candidates.find((c) => presentAt(c, arrivals, facts.departures));
  if (arrival) {
    const minutes = minutesBetween(S, arrival);
    if (emptyDuring.some((d) => d < arrival)) return result('LATE', { arrivedAt: arrival, lateMinutes: minutes, lateReason: 'EMPTY_CLASS', requestId });
    if (arrival.getTime() <= S.getTime() + rules.lateThresholdMinutes * MINUTE_MS) return result('PRESENT', { arrivedAt: arrival, requestId });
    return result('LATE', { arrivedAt: arrival, lateMinutes: minutes, lateReason: 'ARRIVAL', requestId });
  }

  // Pas encore arrivé (la séance a commencé).
  if (lateness && now < E) return result('LATE', { lateReason: 'ANNOUNCED', requestId });
  const toleranceEnd = S.getTime() + rules.toleranceMinutes * MINUTE_MS;
  if (now.getTime() < toleranceEnd) {
    if (emptyDuring.some((d) => d <= now)) return result('LATE', { lateReason: 'EMPTY_CLASS', requestId });
    return result('EXPECTED', { requestId });
  }
  return result('NOT_ARRIVED', { requestId });
}
