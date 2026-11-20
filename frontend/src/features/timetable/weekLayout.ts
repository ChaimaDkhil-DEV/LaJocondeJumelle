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

/** Heures pleines de la première à la dernière ligne de la grille (la fin est exclue de la dernière séance). */
export function hourRange(sessions: TimetableSession[]): { start: number; end: number } {
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
}

/** Chiffres de la semaine : les séances annulées ne comptent ni dans les séances, ni dans les classes, ni dans les heures. */
export function weekStats(sessions: TimetableSession[]): WeekStats {
  const held = sessions.filter((s) => s.status !== 'CANCELLED');
  return {
    sessions: held.length,
    classes: new Set(held.map((s) => s.class.id)).size,
    minutes: held.reduce((sum, s) => sum + minutesOf(s.endTime) - minutesOf(s.startTime), 0),
    cancelled: sessions.length - held.length,
  };
}

/** Teinte stable d'une classe dans la palette des séances. */
export function paletteIndex(classId: string): number {
  let hash = 0;
  for (const char of classId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % sessionPalette.light.length;
}
