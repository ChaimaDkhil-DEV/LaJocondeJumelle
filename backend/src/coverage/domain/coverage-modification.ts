import { addDays, atLocalTime, localDate } from '../../common/school-time';
import type { CoverageStatus } from './coverage-state-machine';

/** Champ d'une affectation modifiable par l'admin (spec 006). */
export type ModifiableField = 'classId' | 'date' | 'startTime' | 'endTime';

const BEFORE_PRESENCE_FIELDS: readonly ModifiableField[] = ['classId', 'date', 'startTime', 'endTime'];

/**
 * Champs que l'admin peut modifier selon le statut (FR-002, FR-005, clarification Q1) : tout avant
 * la présence ; pendant la présence, l'heure de fin seulement (le surveillant est déjà en classe) ;
 * rien sur une affectation terminée, clôturée, annulée ou non pourvue.
 */
export function modifiableFields(status: CoverageStatus): ModifiableField[] {
  switch (status) {
    case 'PENDING':
    case 'ACCEPTED':
    case 'EN_ROUTE':
    case 'LATE':
      return [...BEFORE_PRESENCE_FIELDS];
    case 'ON_DUTY':
    case 'RELIEF_PENDING':
      return ['endTime'];
    default:
      return [];
  }
}

/**
 * Heure de fin saisie pendant la présence (date non modifiable) : l'occurrence de cette heure la
 * plus proche de la fin prévue (à 12 h près ; à égalité, la plus tardive). Une garde qui finit après
 * minuit garde ainsi « 23:59 » la veille et « 00:30 » le lendemain, et une heure de la veille au
 * soir n'est jamais reportée au soir suivant.
 */
export function presenceEndAt(endTime: string, plannedEndAt: Date, timeZone: string): Date {
  const day = localDate(plannedEndAt, timeZone);
  let best: Date | null = null;
  for (const offset of [-1, 0, 1]) {
    const candidate = atLocalTime(addDays(day, offset), endTime, timeZone);
    const distance = Math.abs(candidate.getTime() - plannedEndAt.getTime());
    if (!best || distance <= Math.abs(best.getTime() - plannedEndAt.getTime())) best = candidate;
  }
  return best!;
}
