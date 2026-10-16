import type { RequestKind, RequestStatus, Role } from '@prisma/client';
import type { PolicyUser } from '../../common/authorization';
import { availableActions, type Actor, type MachineRequest, type RequestAction } from './request-state-machine';

/**
 * Politique d'accès — specs/001-demandes-travail-vocales/data-model.md §Matrice d'accès.
 * Fonctions pures : les mêmes règles servent aux routes REST, aux fichiers et aux salles Socket.IO ;
 * les listes utilisent l'équivalent SQL de canReadRequest (visibility.ts).
 */

export interface PolicyCategory {
  id: string;
  active: boolean;
  creatorRoles: readonly Role[];
  /** Destinataires possibles (circuit A) et employés affectables (circuit B). */
  recipientIds: ReadonlySet<string>;
  /** Responsables de la catégorie. */
  managerIds: ReadonlySet<string>;
}

export interface PolicyRequest extends MachineRequest {
  /** Les couvertures de classe (COVERAGE) ont leur propre politique : coverage/domain/coverage-policy.ts. */
  kind: RequestKind;
  requesterId: string;
  categoryId: string;
}

/** Action supplémentaire, hors machine à états, exposée dans `allowedActions`. */
export type PolicyAction = RequestAction | 'CHANGE_PRIORITY';

const FINAL_STATUSES: readonly RequestStatus[] = ['CLOSED', 'REJECTED', 'CANCELLED'];
const OWN_PRIORITY_STATUSES: readonly RequestStatus[] = ['DRAFT', 'PENDING_ADMIN_VALIDATION', 'SENT'];

export function isFinalStatus(status: RequestStatus): boolean {
  return FINAL_STATUSES.includes(status);
}

/**
 * Demande en lecture seule : finale, ou travail terminé (en attente de clôture ou de validation
 * finale). Discussion, pièces jointes et priorité sont figées ; seules restent les actions du
 * circuit (clôturer, valider, renvoyer à corriger), dont le motif est saisi avec l'action.
 */
const READ_ONLY_STATUSES: readonly RequestStatus[] = [...FINAL_STATUSES, 'DONE', 'PENDING_FINAL_VALIDATION'];

export function isReadOnlyStatus(status: RequestStatus): boolean {
  return READ_ONLY_STATUSES.includes(status);
}

/** Relations de l'utilisateur avec la demande. Le super administrateur agit comme responsable. */
export function actorsFor(user: PolicyUser, req: PolicyRequest, category: PolicyCategory): Actor[] {
  if (!user.active) return [];
  const actors: Actor[] = [];
  if (req.requesterId === user.id) actors.push('REQUESTER');
  if (req.assigneeId !== null && req.assigneeId === user.id) actors.push('ASSIGNEE');
  if (user.role === 'SUPER_ADMIN' || category.managerIds.has(user.id)) actors.push('MANAGER');
  return actors;
}

export function canReadRequest(user: PolicyUser, req: PolicyRequest, category: PolicyCategory): boolean {
  if (!user.active) return false;
  // Les couvertures ne sont jamais exposées par les routes des demandes de travail.
  if (req.kind !== 'WORK') return false;
  // Un brouillon n'est visible que de son auteur.
  if (req.status === 'DRAFT') return req.requesterId === user.id;
  return actorsFor(user, req, category).length > 0;
}

export function allowedActions(user: PolicyUser, req: PolicyRequest, category: PolicyCategory): PolicyAction[] {
  if (!canReadRequest(user, req, category)) return [];
  const actors = actorsFor(user, req, category);

  const actions: PolicyAction[] = availableActions(req, actors).filter(
    (action) => action !== 'REASSIGN' || user.permissions.has('REQUEST_REASSIGN'),
  );

  const ownPriority =
    actors.includes('REQUESTER') &&
    user.permissions.has('PRIORITY_CHANGE_OWN') &&
    OWN_PRIORITY_STATUSES.includes(req.status);
  const managedPriority =
    actors.includes('MANAGER') &&
    user.permissions.has('PRIORITY_CHANGE_MANAGED') &&
    !isReadOnlyStatus(req.status) &&
    req.status !== 'DRAFT';
  if (ownPriority || managedPriority) actions.push('CHANGE_PRIORITY');

  return actions;
}

export function canCreateInCategory(user: PolicyUser, category: PolicyCategory): boolean {
  if (!user.active || !category.active) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  return category.creatorRoles.includes(user.role) && user.permissions.has('REQUEST_CREATE');
}

/** Le destinataire choisi doit être un utilisateur actif parmi les destinataires de la catégorie. */
export function canPickRecipient(
  category: PolicyCategory,
  candidate: { id: string; active: boolean } | null,
): boolean {
  return candidate !== null && candidate.active && category.recipientIds.has(candidate.id);
}

export function canWriteInThread(user: PolicyUser, req: PolicyRequest, category: PolicyCategory): boolean {
  return req.status !== 'DRAFT' && !isReadOnlyStatus(req.status) && canReadRequest(user, req, category);
}
