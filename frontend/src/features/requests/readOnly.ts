import type { RequestStatus } from '../../api/types';

/**
 * Demande en lecture seule : travail terminé (en attente de clôture ou de validation finale) ou
 * statut final. Miroir de isReadOnlyStatus (backend/src/requests/domain/access-policy.ts), qui fait
 * foi : le serveur refuse messages, fichiers et changement de priorité dans ces statuts.
 */
export const READ_ONLY_STATUSES: readonly RequestStatus[] = ['DONE', 'PENDING_FINAL_VALIDATION', 'CLOSED', 'REJECTED', 'CANCELLED'];

export function isReadOnlyStatus(status: RequestStatus): boolean {
  return READ_ONLY_STATUSES.includes(status);
}

/** Bandeau affiché sur une demande en lecture seule. */
export function readOnlyNotice(status: RequestStatus): string {
  if (status === 'REJECTED') return 'Demande refusée, consultation uniquement.';
  if (status === 'CANCELLED') return 'Demande annulée, consultation uniquement.';
  return 'Demande terminée, consultation uniquement.';
}
