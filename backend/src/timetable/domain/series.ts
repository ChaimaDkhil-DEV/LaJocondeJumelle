import { addDays, atLocalTime } from '../../common/school-time';

/**
 * Emplois du temps (020) : fonctions pures sur les dates et heures locales de l'école (aucune base, aucune
 * horloge : « aujourd'hui » est un paramètre). Une date s'écrit `YYYY-MM-DD`, une heure `HH:MM`.
 */

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MIN_MINUTES = 5;
const MAX_MINUTES = 12 * 60;
/** Une série couvre au plus une année scolaire. */
const MAX_PERIOD_DAYS = 366;

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface WeeklyPattern {
  weekday: number;
  startDate: string;
  endDate: string;
}

const minutesOf = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/** Jour ISO d'une date locale : 1 (lundi) … 7 (dimanche). */
export function isoWeekday(date: string): Weekday {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (day === 0 ? 7 : day) as Weekday;
}

/**
 * Dates de la série, dans l'ordre : chaque date du jour demandé entre `startDate` et `endDate` (comprises),
 * à partir d'aujourd'hui (on ne crée pas de séance passée, R10) et, pour un changement de série, à partir de `from`.
 */
export function seriesDates(pattern: WeeklyPattern, today: string, from?: string): string[] {
  const lower = [pattern.startDate, today, from ?? pattern.startDate].sort().at(-1)!;
  let date = addDays(lower, (pattern.weekday - isoWeekday(lower) + 7) % 7);
  const dates: string[] = [];
  while (date <= pattern.endDate) {
    dates.push(date);
    date = addDays(date, 7);
  }
  return dates;
}

/** Période d'une série : message de refus, ou null. */
export function periodError(startDate: string, endDate: string): string | null {
  if (endDate < startDate) return 'La fin de la période doit être le même jour ou après son début.';
  if (endDate > addDays(startDate, MAX_PERIOD_DAYS)) return 'Une série couvre au plus un an : raccourcissez la période.';
  return null;
}

/** Heures d'une séance : message de refus, ou null. Une séance commence et finit le même jour. */
export function slotError(startTime: string, endTime: string): string | null {
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) return 'Indiquez les heures au format HH:MM (par exemple 08:30).';
  const length = minutesOf(endTime) - minutesOf(startTime);
  if (length <= 0) return 'L’heure de fin doit être après l’heure de début.';
  if (length < MIN_MINUTES) return 'Une séance dure au moins 5 minutes.';
  if (length > MAX_MINUTES) return 'Une séance dure au plus 12 heures.';
  return null;
}

/** Instants de début et de fin d'une séance, à partir de sa date et de ses heures locales. */
export function sessionRange(date: string, startTime: string, endTime: string, timeZone: string): { startAt: Date; endAt: Date } {
  return { startAt: atLocalTime(date, startTime, timeZone), endAt: atLocalTime(date, endTime, timeZone) };
}
