import type { RequestKind, RequestStatus, Role, RoutingMode } from '@prisma/client';

/**
 * Administrateur responsable d'une demande (018) — specs/018-multi-admin-transferts/data-model.md §Rules.
 * Fonctions pures. Le responsable (`adminOwnerId`) est l'administrateur qui traite la demande ; à ne
 * pas confondre avec l'employé affecté (`assigneeId`), qui réalise le travail.
 */

export interface OwnershipUser {
  id: string;
  role: Role;
  active: boolean;
}

export interface OwnershipCategory {
  routingMode: RoutingMode;
  /** Admins de la catégorie. */
  managerIds: ReadonlySet<string>;
}

export interface OwnershipRequest {
  kind: RequestKind;
  status: RequestStatus;
  adminOwnerId: string | null;
}

const FINISHED_STATUSES: readonly RequestStatus[] = ['CLOSED', 'REJECTED', 'CANCELLED'];

/** Demande terminée : clôturée, refusée ou annulée (« Demandes terminées »). */
export function isFinishedStatus(status: RequestStatus): boolean {
  return FINISHED_STATUSES.includes(status);
}

/**
 * Seules les demandes de travail des catégories « via l'administration » peuvent avoir un responsable :
 * ailleurs (directes, entre enseignants, gardes), l'administration n'a pas la demande à traiter.
 */
export function isOwnable(request: Pick<OwnershipRequest, 'kind' | 'status'>, category: Pick<OwnershipCategory, 'routingMode'>): boolean {
  return request.kind === 'WORK' && category.routingMode === 'VIA_ADMIN' && request.status !== 'DRAFT';
}

/**
 * Peut être responsable : compte Admin actif, admin de la catégorie. Le super administrateur supervise
 * et n'est jamais responsable ; une ligne restée sur un compte rétrogradé ne donne rien.
 */
export function isEligibleAdmin(user: OwnershipUser, category: Pick<OwnershipCategory, 'managerIds'>): boolean {
  return user.active && user.role === 'ADMIN' && category.managerIds.has(user.id);
}

/** File commune : demande en attente de validation, sans responsable. */
export function inCommonQueue(request: OwnershipRequest, category: OwnershipCategory): boolean {
  return isOwnable(request, category) && request.status === 'PENDING_ADMIN_VALIDATION' && request.adminOwnerId === null;
}

/** La file commune d'un admin se limite à ses catégories ; le super administrateur la voit entière. */
export function canSeeInCommonQueue(user: OwnershipUser, request: OwnershipRequest, category: OwnershipCategory): boolean {
  if (!inCommonQueue(request, category)) return false;
  return (user.active && user.role === 'SUPER_ADMIN') || isEligibleAdmin(user, category);
}

/** « Prendre en charge ». */
export function canClaim(user: OwnershipUser, request: OwnershipRequest, category: OwnershipCategory): boolean {
  return inCommonQueue(request, category) && isEligibleAdmin(user, category);
}

/**
 * Une fois la demande prise, seul son responsable agit au titre de l'administration ; les autres admins
 * de la catégorie la consultent. Demande libre et super administrateur : inchangés.
 */
export function actsAsAdministration(user: Pick<OwnershipUser, 'id' | 'role'>, request: Pick<OwnershipRequest, 'adminOwnerId'>): boolean {
  return user.role === 'SUPER_ADMIN' || request.adminOwnerId === null || request.adminOwnerId === user.id;
}

/**
 * D4 : une action d'administration sur une demande libre vaut prise en charge, y compris pour une
 * demande déjà validée avant l'arrivée des responsables.
 */
export function takesByActing(user: OwnershipUser, request: OwnershipRequest, category: OwnershipCategory): boolean {
  return isOwnable(request, category) && request.adminOwnerId === null && isEligibleAdmin(user, category);
}

/**
 * Une proposition de transfert (reprise ou délégation) n'a de sens que sur une demande prise en charge
 * et pas encore terminée.
 */
export function isTransferable(request: OwnershipRequest, category: OwnershipCategory): boolean {
  return isOwnable(request, category) && request.adminOwnerId !== null && !isFinishedStatus(request.status);
}

/** « Proposer une délégation » : le responsable, tant qu'aucune proposition n'attend déjà sur la demande. */
export function canProposeDelegation(user: OwnershipUser, request: OwnershipRequest, category: OwnershipCategory, hasPendingTransfer: boolean): boolean {
  return isTransferable(request, category) && !hasPendingTransfer && isEligibleAdmin(user, category) && request.adminOwnerId === user.id;
}

/** « Demander la reprise » : un autre admin de la catégorie, tant qu'aucune proposition n'attend déjà. */
export function canAskTakeover(user: OwnershipUser, request: OwnershipRequest, category: OwnershipCategory, hasPendingTransfer: boolean): boolean {
  return isTransferable(request, category) && !hasPendingTransfer && isEligibleAdmin(user, category) && request.adminOwnerId !== user.id;
}
