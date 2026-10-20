/**
 * Jours et heures locales de l'école (R4) : fonctions pures sur `Intl`, sans dépendance et sans
 * toucher au fuseau du processus Node (qui reste UTC). Une date locale s'écrit `YYYY-MM-DD`, une
 * heure locale `HH:MM`.
 */

const MINUTE_MS = 60_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(timeZone, fmt);
  }
  return fmt;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function wallClock(instant: Date, timeZone: string): WallClock {
  const parts: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

/** Décalage du fuseau à cet instant, en minutes (Paris l'été : +120). */
function offsetMinutes(instant: number, timeZone: string): number {
  const w = wallClock(new Date(instant), timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  return Math.round((asUtc - Math.floor(instant / MINUTE_MS) * MINUTE_MS) / MINUTE_MS);
}

const pad = (n: number) => String(n).padStart(2, '0');

function parseDate(date: string): [number, number, number] {
  const match = DATE_RE.exec(date);
  if (!match) throw new RangeError(`Date locale invalide : ${date}`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new RangeError(`Date locale invalide : ${date}`);
  }
  return [year, month, day];
}

/** Date locale de l'instant dans le fuseau de l'école. */
export function localDate(instant: Date, timeZone: string): string {
  const w = wallClock(instant, timeZone);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** Heure locale (HH:MM) de l'instant dans le fuseau de l'école. */
export function localTime(instant: Date, timeZone: string): string {
  const w = wallClock(instant, timeZone);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

/** Ajoute des jours à une date locale (calendrier, indépendant du fuseau). */
export function addDays(date: string, days: number): string {
  const [year, month, day] = parseDate(date);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** « Aujourd'hui » ou « demain » par rapport à `now`, dans le fuseau de l'école ; sinon null. */
export function relativeDay(
  date: string,
  now: Date,
  timeZone: string,
): 'TODAY' | 'TOMORROW' | null {
  const today = localDate(now, timeZone);
  if (date === today) return 'TODAY';
  if (date === addDays(today, 1)) return 'TOMORROW';
  return null;
}

/**
 * Instant correspondant à une date et une heure locales. Heure inexistante (passage à l'heure
 * d'été) : décalée vers l'avant ; heure ambiguë (passage à l'heure d'hiver) : première occurrence.
 */
export function atLocalTime(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = parseDate(date);
  const match = TIME_RE.exec(time);
  if (!match) throw new RangeError(`Heure locale invalide : ${time}`);
  const wall = Date.UTC(year, month - 1, day, Number(match[1]), Number(match[2]));

  // Décalages en vigueur de part et d'autre d'un éventuel changement d'heure.
  const before = offsetMinutes(wall - 12 * 60 * MINUTE_MS, timeZone);
  const after = offsetMinutes(wall + 12 * 60 * MINUTE_MS, timeZone);
  const candidates = [before, after]
    .map((offset) => wall - offset * MINUTE_MS)
    .filter(
      (instant) => offsetMinutes(instant, timeZone) === Math.round((wall - instant) / MINUTE_MS),
    );
  if (candidates.length > 0) return new Date(Math.min(...candidates));
  // Heure sautée : appliquer le décalage d'avant le changement la place après le saut.
  return new Date(wall - before * MINUTE_MS);
}

/** Fin de la journée locale de l'instant : minuit local du lendemain (exclu). */
export function endOfLocalDay(instant: Date, timeZone: string): Date {
  return atLocalTime(addDays(localDate(instant, timeZone), 1), '00:00', timeZone);
}
