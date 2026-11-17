import type { RequestSummary } from '../requests/types';

/** Administrateur tel qu'il est montré à ses collègues : nom et fonction seulement. */
export interface AdminRef {
  id: string;
  displayName: string;
  jobTitle: string | null;
}

/** Demande de la file commune : le résumé habituel, sa description et sa version (prise en charge). */
export interface QueueItem extends RequestSummary {
  description: string | null;
  version: number;
}

/** Compteurs du tableau de bord (GET /api/admin/requests/summary). */
export interface WorkspaceSummary {
  available: number;
  mine: number;
  active: number;
  finished: number;
  transfersReceivedPending: number;
  transfersSentPending: number;
}

/** Périmètre de « mes demandes » : toutes, en cours, terminées. */
export type OwnedScope = 'all' | 'active' | 'finished';

export type AssignmentOperation = 'CLAIMED' | 'REASSIGNED' | 'RELEASED' | 'TRANSFERRED';

/** Ligne de l'historique des responsables d'une demande. */
export interface AssignmentView {
  id: string;
  operation: AssignmentOperation;
  request: { id: string; reference: string; title: string };
  admin: AdminRef;
  previousAdmin: AdminRef | null;
  actor: AdminRef;
  reason: string | null;
  createdAt: string;
}

/** Proposition de transfert entre administrateurs : demande de reprise ou délégation. */
export type TransferType = 'TAKEOVER_REQUEST' | 'DELEGATION_REQUEST';
export type TransferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
export type TransferCancelCause = 'INITIATOR' | 'REQUEST_FINISHED' | 'OWNER_CHANGED' | 'REASSIGNED_BY_SUPER_ADMIN' | 'PARTICIPANT_UNAVAILABLE';

export interface Transfer {
  id: string;
  type: TransferType;
  status: TransferStatus;
  reason: string;
  responseReason: string | null;
  cancelCause: TransferCancelCause | null;
  request: { id: string; reference: string; title: string; priority: string; status: string };
  initiator: AdminRef;
  recipient: AdminRef;
  /** Qui avait la demande à sa charge au moment de la proposition. */
  currentOwner: AdminRef;
  createdAt: string;
  respondedAt: string | null;
  expiresAt: string;
  cancelledAt: string | null;
  /** Ce que l'utilisateur connecté peut faire maintenant, calculé par le serveur. */
  canAccept: boolean;
  canReject: boolean;
  canCancel: boolean;
}
