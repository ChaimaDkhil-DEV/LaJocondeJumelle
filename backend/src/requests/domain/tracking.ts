import type { RequestStatus } from '@prisma/client';

/**
 * « Suivi de mes demandes » (016, accueil de l'enseignant) : les statuts d'une demande envoyée,
 * regroupés en trois groupes. Seule source de cette correspondance : l'interface passe le nom du
 * groupe, jamais la liste des statuts.
 *   - pending : validation attendue ou traitement en cours ;
 *   - handled : acceptée ou terminée ;
 *   - archived : clôturée, refusée ou annulée.
 * Le brouillon n'est d'aucun groupe (il n'est pas envoyé).
 */
export const TRACKING_GROUPS = {
  pending: ['PENDING_ADMIN_VALIDATION', 'SENT', 'IN_PROGRESS', 'TO_CORRECT', 'PENDING_FINAL_VALIDATION'],
  handled: ['ACCEPTED', 'DONE'],
  archived: ['CLOSED', 'REJECTED', 'CANCELLED'],
} as const satisfies Record<string, readonly RequestStatus[]>;

export type TrackingGroup = keyof typeof TRACKING_GROUPS;
export const TRACKING_GROUP_NAMES = Object.keys(TRACKING_GROUPS) as TrackingGroup[];

/** Groupe d'un statut ; null pour un brouillon. */
export function trackingGroupOf(status: RequestStatus): TrackingGroup | null {
  return TRACKING_GROUP_NAMES.find((g) => (TRACKING_GROUPS[g] as readonly RequestStatus[]).includes(status)) ?? null;
}
