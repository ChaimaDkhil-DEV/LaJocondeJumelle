import type { RequestTransferStatus, RequestTransferType } from '@prisma/client';

/**
 * Propositions de transfert entre administrateurs (018) — data-model.md §Rules. Fonctions pures. Qui
 * peut proposer est dans requests/domain/ownership.ts (canProposeDelegation, canAskTakeover).
 */

export interface PolicyTransfer {
  type: RequestTransferType;
  status: RequestTransferStatus;
  initiatorId: string;
  recipientId: string;
  /** Responsable de la demande au moment de la proposition. */
  currentOwnerId: string;
  expiresAt: Date;
}

/**
 * Qui devient responsable si la proposition est acceptée : le collègue choisi (délégation) ou celui qui
 * a demandé la reprise. Dans les deux cas, ce n'est jamais le responsable actuel.
 */
export function newOwnerOf(transfer: Pick<PolicyTransfer, 'type' | 'initiatorId' | 'recipientId'>): string {
  return transfer.type === 'TAKEOVER_REQUEST' ? transfer.initiatorId : transfer.recipientId;
}

/** Délai de réponse atteint sur une proposition encore en attente. */
export function isOverdue(transfer: Pick<PolicyTransfer, 'status' | 'expiresAt'>, now: Date): boolean {
  return transfer.status === 'PENDING' && transfer.expiresAt.getTime() <= now.getTime();
}

/** Accepter ou refuser : le destinataire seulement, sur une proposition en attente et non échue. */
export function canAnswer(userId: string, transfer: PolicyTransfer, now: Date): boolean {
  return transfer.status === 'PENDING' && transfer.recipientId === userId && !isOverdue(transfer, now);
}

/** Annuler : l'auteur seulement, tant que la proposition est en attente. */
export function canCancel(userId: string, transfer: Pick<PolicyTransfer, 'status' | 'initiatorId'>): boolean {
  return transfer.status === 'PENDING' && transfer.initiatorId === userId;
}
