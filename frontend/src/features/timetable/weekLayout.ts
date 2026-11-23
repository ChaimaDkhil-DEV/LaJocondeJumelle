import { sessionPalette } from '../../design/tokens';
import type { TimetableSession } from './types';

/** Plage affichée par défaut ; élargie aux séances qui en sortent. */
const MIN_START_HOUR = 8;
const MIN_END_HOUR = 17;

/** « 08:30 » → 510 (minutes depuis minuit). */
export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Heures pleines de la première à la dernière ligne de la grille (la fin est exclue de la dernière séance).
 * `fit` : plage ajustée aux séances (au moins deux heures), au lieu de 8 h – 17 h au minimum ; sans séance, 8 h – 17 h.
 */
export function hourRange(sessions: TimetableSession[], fit = false): { start: number; end: number } {
  if (fit && sessions.length > 0) {
    const start = Math.min(...sessions.map((s) => Math.floor(minutesOf(s.startTime) / 60)));
    const end = Math.max(...sessions.map((s) => Math.ceil(minutesOf(s.endTime) / 60)));
    return { start, end: Math.max(end, start + 2) };
  }
  let start = MIN_START_HOUR;
  let end = MIN_END_HOUR;
  for (const s of sessions) {
    start = Math.min(start, Math.floor(minutesOf(s.startTime) / 60));
    end = Math.max(end, Math.ceil(minutesOf(s.endTime) / 60));
  }
  return { start, end };
}

/** 420 → « 7 h » ; 450 → « 7 h 30 ». */
export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

export interface WeekStats {
  sessions: number;
  classes: number;
  minutes: number;
  cancelled: number;
  /** Matières distinctes des séances tenues (une séance sans matière n'en compte aucune). */
  subjects: number;
}

/** Chiffres de la semaine : les séances annulées ne comptent ni dans les séances, ni dans les classes, ni dans les heures. */
export function weekStats(sessions: TimetableSession[]): WeekStats {
  const held = sessions.filter((s) => s.status !== 'CANCELLED');
  return {
    sessions: held.length,
    classes: new Set(held.map((s) => s.class.id)).size,
    minutes: held.reduce((sum, s) => sum + minutesOf(s.endTime) - minutesOf(s.startTime), 0),
    cancelled: sessions.length - held.length,
    subjects: new Set(held.map((s) => s.subject).filter((subject): subject is string => Boolean(subject))).size,
  };
}

const durationOf = (s: TimetableSession) => minutesOf(s.endTime) - minutesOf(s.startTime);

/** Heures par matière des séances tenues, la plus longue d'abord ; les séances sans matière sont regroupées (null). */
export function subjectBreakdown(sessions: TimetableSession[]): Array<{ subject: string | null; minutes: number }> {
  const totals = new Map<string | null, number>();
  for (const s of sessions) {
    if (s.status === 'CANCELLED') continue;
    totals.set(s.subject, (totals.get(s.subject) ?? 0) + durationOf(s));
  }
  return [...totals].map(([subject, minutes]) => ({ subject, minutes })).sort((a, b) => b.minutes - a.minutes);
}

export interface NextSession {
  session: TimetableSession;
  inProgress: boolean;
}

/**
 * La séance en cours, sinon la prochaine (les séances annulées ne comptent pas), quel que soit l'ordre reçu ;
 * null après la dernière. Une séance qui se termine à l'instant n'est plus en cours.
 */
export function nextSession(sessions: TimetableSession[], now: Date): NextSession | null {
  const upcoming = sessions
    .filter((s) => s.status !== 'CANCELLED' && new Date(s.endAt) > now)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  return upcoming ? { session: upcoming, inProgress: new Date(upcoming.startAt) <= now } : null;
}

/** Clé de teinte d'une séance : sa matière (les séances d'une même matière se ressemblent), sinon une teinte commune. */
export function tintKey(s: TimetableSession): string {
  return s.subject ?? '';
}

/** Teinte stable d'une classe dans la palette des séances. */
export function paletteIndex(classId: string): number {
  let hash = 0;
  for (const char of classId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % sessionPalette.light.length;
}
