import { t } from '../../i18n';

/** Jours de la semaine dans l'ordre, du lundi au dimanche (codes des réglages). */
const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

const DAY_NAMES: Record<(typeof DAY_ORDER)[number], string> = {
  MON: t('lundi'),
  TUE: t('mardi'),
  WED: t('mercredi'),
  THU: t('jeudi'),
  FRI: t('vendredi'),
  SAT: t('samedi'),
  SUN: t('dimanche'),
};

/** « du lundi au vendredi », « tous les jours », ou « le lundi, le mercredi et le samedi ». */
function daysText(days: readonly string[]): string {
  const indexes = DAY_ORDER.map((day, index) => (days.includes(day) ? index : -1)).filter((index) => index >= 0);
  if (indexes.length === DAY_ORDER.length) return t('tous les jours');
  const contiguous = indexes.every((index, i) => i === 0 || index === indexes[i - 1] + 1);
  if (indexes.length >= 3 && contiguous) {
    return t('du {first} au {last}', { first: DAY_NAMES[DAY_ORDER[indexes[0]]], last: DAY_NAMES[DAY_ORDER[indexes.at(-1)!]] });
  }
  const parts = indexes.map((index) => t('le {day}', { day: DAY_NAMES[DAY_ORDER[index]] }));
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} ${t('et')} ${parts.at(-1)}`;
}

/**
 * Rappel de la plage d'envoi des notifications push (spec 014, US4, contracts/ui.md), dans « Mon profil ».
 */
export function pushWindowText(days: readonly string[], start: string, end: string): string {
  return t('Envoi {days}, de {start} à {end} (heure de l’école). En dehors, les notifications restent dans l’application.', {
    days: daysText(days),
    start,
    end,
  });
}
