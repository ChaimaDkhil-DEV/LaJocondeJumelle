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
