const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const shortDateWithYear = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const relative = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function toDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

/** « 12 oct. 2026, 14:05 » dans le fuseau du navigateur. */
export function formatDateTime(value: string | Date): string {
  return dateTime.format(toDate(value));
}

/**
 * Date relative courte : « à l'instant », « il y a 5 min », « il y a 3 h », « hier »,
 * puis la date (« 12 oct. ») au-delà d'une semaine.
 */
export function formatRelative(value: string | Date, now: Date = new Date()): string {
  const date = toDate(value);
  const diff = now.getTime() - date.getTime();
  if (diff < MINUTE) return 'à l’instant';
  if (diff < HOUR) return relative.format(-Math.floor(diff / MINUTE), 'minute').replace('minutes', 'min').replace('minute', 'min');
  if (diff < DAY) return relative.format(-Math.floor(diff / HOUR), 'hour').replace('heures', 'h').replace('heure', 'h');
  if (diff < 7 * DAY) return relative.format(-Math.floor(diff / DAY), 'day');
  return (date.getFullYear() === now.getFullYear() ? shortDate : shortDateWithYear).format(date);
}
