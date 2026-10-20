/**
 * Heures de l'école côté navigateur : le poste peut être réglé sur un autre fuseau que l'école
 * (`SCHOOL_TIMEZONE`, renvoyé par le serveur dans le profil du module).
 */

/** Décalage (ms) du fuseau `timeZone` par rapport à UTC à l'instant `utcMs`. */
function offsetAt(utcMs: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, Number(p.value)]),
  );
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Instant ISO d'une date (AAAA-MM-JJ) et d'une heure (HH:MM) locales de l'école. */
export function schoolDateTime(date: string, time: string, timeZone: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  // Deux passes : le décalage peut changer entre l'estimation et l'instant réel (changement d'heure).
  const first = guess - offsetAt(guess, timeZone);
  return new Date(guess - offsetAt(first, timeZone)).toISOString();
}
