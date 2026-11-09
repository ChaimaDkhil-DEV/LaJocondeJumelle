import { localDate, localTime } from '../../common/school-time';

/**
 * Plage d'envoi des notifications push (spec 014, D6, FR-010, research R4), commune à l'établissement :
 * jours de la semaine et heures, dans le fuseau de l'école. Début inclus, fin exclue. Hors plage, aucun
 * push, sans exception ni envoi différé (NC-7).
 */
export interface PushWindow {
  /** Codes de jour : MON, TUE, WED, THU, FRI, SAT, SUN. */
  days: readonly string[];
  /** HH:MM, inclus. */
  start: string;
  /** HH:MM, exclu ; strictement après le début (contrôlé à l'enregistrement). */
  end: string;
}

const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export function isWithinPushWindow(instant: Date, window: PushWindow, timeZone: string): boolean {
  // Jour de la semaine de la date locale de l'école (midi UTC : aucun effet de fuseau sur le jour).
  const day = DAY_CODES[new Date(`${localDate(instant, timeZone)}T12:00:00Z`).getUTCDay()];
  if (!window.days.includes(day)) return false;
  const time = localTime(instant, timeZone);
  return time >= window.start && time < window.end;
}
