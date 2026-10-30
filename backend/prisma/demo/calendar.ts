import { addDays, atLocalTime, localDate, localTime } from '../../src/common/school-time';

/**
 * Calendrier scolaire de la démonstration (heure locale de l'école) : les demandes naissent et
 * avancent pendant les heures d'ouverture ; les délais, eux, restent en minutes calendaires comme
 * dans l'application (un week-end peut donc faire passer une demande en retard).
 */
const MINUTE_MS = 60_000;

/** Lundi à vendredi 7 h 30 – 17 h 30 ; samedi matin 8 h – 12 h 30 ; dimanche fermé. */
const WINDOWS: Record<number, readonly [string, string] | null> = {
  0: null,
  1: ['07:30', '17:30'],
  2: ['07:30', '17:30'],
  3: ['07:30', '17:30'],
  4: ['07:30', '17:30'],
  5: ['07:30', '17:30'],
  6: ['08:00', '12:30'],
};

/** Jour de la semaine d'une date locale « AAAA-MM-JJ » (0 = dimanche). */
export function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function openingWindow(date: string, timeZone: string): { start: Date; end: Date } | null {
  const window = WINDOWS[weekday(date)];
  return window ? { start: atLocalTime(date, window[0], timeZone), end: atLocalTime(date, window[1], timeZone) } : null;
}

/** Ajoute des minutes ouvrées : le temps hors ouverture (nuits, dimanche) ne compte pas. */
export function addWorkingMinutes(from: Date, minutes: number, timeZone: string): Date {
  let cursor = from;
  let remaining = minutes;
  for (let guard = 0; guard < 400; guard += 1) {
    const date = localDate(cursor, timeZone);
    const window = openingWindow(date, timeZone);
    if (window && cursor.getTime() < window.end.getTime()) {
      const start = Math.max(cursor.getTime(), window.start.getTime());
      const available = (window.end.getTime() - start) / MINUTE_MS;
      if (remaining <= available) return new Date(start + remaining * MINUTE_MS);
      remaining -= available;
    }
    cursor = atLocalTime(addDays(date, 1), '00:00', timeZone);
  }
  throw new RangeError('Calendrier : durée trop longue');
}

/** Ouverture du jour ouvré suivant (demande traitée « le lendemain matin »). */
export function nextOpening(from: Date, timeZone: string): Date {
  let date = localDate(from, timeZone);
  for (let guard = 0; guard < 8; guard += 1) {
    date = addDays(date, 1);
    const window = openingWindow(date, timeZone);
    if (window) return window.start;
  }
  throw new RangeError('Calendrier : aucune ouverture');
}

/** Ajoute des minutes calendaires (urgences, règles automatiques). */
export function addMinutes(from: Date, minutes: number): Date {
  return new Date(from.getTime() + minutes * MINUTE_MS);
}

/** « 14:05 » local d'un instant (contrôles des tests). */
export function clock(instant: Date, timeZone: string): string {
  return localTime(instant, timeZone);
}
