import { locale, t } from '../../i18n';

/** Dates locales de l'école (AAAA-MM-JJ), manipulées sans fuseau : minuit UTC représente le jour. */

const toDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  const d = toDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

/** Jour ISO : 1 (lundi) … 7 (dimanche). */
export function isoWeekday(date: string): number {
  const day = toDate(date).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Lundi de la semaine d'une date. */
export function weekStart(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** Les sept jours d'une semaine, du lundi au dimanche. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_v, i) => addDays(monday, i));
}

/** Date du jour dans le fuseau du navigateur (le poste de l'école). */
export function todayOf(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return parts;
}

const longDay = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const shortWeekday = new Intl.DateTimeFormat(locale(), { weekday: 'short', timeZone: 'UTC' });

/** « lun. » → « lun » (en-tête de colonne de la grille). */
export function weekdayShort(date: string): string {
  return shortWeekday.format(toDate(date)).replace('.', '');
}

/** « 23 » */
export function dayOfMonth(date: string): string {
  return String(toDate(date).getUTCDate());
}

/** « lundi 23 novembre » */
export function dayLabel(date: string): string {
  return longDay.format(toDate(date));
}

/** « 23 novembre 2026 » */
export function dateLabel(date: string): string {
  return shortDate.format(toDate(date));
}

export const WEEKDAY_LABELS: Record<number, string> = {
  1: t('Lundi'),
  2: t('Mardi'),
  3: t('Mercredi'),
  4: t('Jeudi'),
  5: t('Vendredi'),
  6: t('Samedi'),
  7: t('Dimanche'),
};
