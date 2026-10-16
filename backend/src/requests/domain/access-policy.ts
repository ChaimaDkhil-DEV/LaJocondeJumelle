import type { RequestKind, RequestStatus, Role, RoutingMode } from '@prisma/client';
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
  /** VIA_ADMIN : l'administration valide et affecte ; DIRECT, PEER : elle consulte en lecture seule. */
  routingMode: RoutingMode;
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

/** Administration : comptes Responsable (Admin) et super administrateur. */
export function isAdministration(user: Pick<PolicyUser, 'role'>): boolean {
  return user.role === 'MANAGER' || user.role === 'SUPER_ADMIN';
}

/** L'administration n'a d'action à faire qu'en mode « via l'administration » (validation, affectation). */
export function administrationActs(category: Pick<PolicyCategory, 'routingMode'>): boolean {
  return category.routingMode === 'VIA_ADMIN';
}

/**
 * Relations de l'utilisateur avec la demande. Le super administrateur agit comme responsable, mais
 * seulement en mode « via l'administration » : en DIRECT et PEER, l'administration n'agit pas (sauf la
 * clôture, si elle lui a été confiée dans une catégorie antérieure au mode de routage).
 */
export function actorsFor(user: PolicyUser, req: PolicyRequest, category: PolicyCategory): Actor[] {
  if (!user.active) return [];
  const actors: Actor[] = [];
  if (req.requesterId === user.id) actors.push('REQUESTER');
  if (req.assigneeId !== null && req.assigneeId === user.id) actors.push('ASSIGNEE');
  const manages = user.role === 'SUPER_ADMIN' || category.managerIds.has(user.id);
  if (manages && (administrationActs(category) || req.rules.closureMode === 'MANAGER')) actors.push('MANAGER');
  return actors;
}

/**
 * Administration en consultation : en DIRECT et PEER, tout compte Responsable (Admin) et le super
 * administrateur voient les demandes soumises, en lecture seule, sans en être destinataires.
 */
export function isObserver(user: PolicyUser, req: PolicyRequest, category: PolicyCategory): boolean {
  return user.active && req.kind === 'WORK' && req.status !== 'DRAFT' && !administrationActs(category) && isAdministration(user);
}

export function canReadRequest(user: PolicyUser, req: PolicyRequest, category: PolicyCategory): boolean {
  if (!user.active) return false;
  // Les couvertures ne sont jamais exposées par les routes des demandes de travail.
  if (req.kind !== 'WORK') return false;
  // Un brouillon n'est visible que de son auteur.
  if (req.status === 'DRAFT') return req.requesterId === user.id;
  return actorsFor(user, req, category).length > 0 || isObserver(user, req, category);
}

export function allowedActions(user: PolicyUser, req: PolicyRequest, category: PolicyCategory): PolicyAction[] {
  if (!canReadRequest(user, req, category)) return [];
  const actors = actorsFor(user, req, category);

  const actions: PolicyAction[] = availableActions(req, actors).filter(
    (action) => action !== 'REASSIGN' || (user.permissions.has('REQUEST_REASSIGN') && administrationActs(category)),
  );

  const ownPriority =
    actors.includes('REQUESTER') &&
    user.permissions.has('PRIORITY_CHANGE_OWN') &&
    OWN_PRIORITY_STATUSES.includes(req.status);
  const managedPriority =
    actors.includes('MANAGER') &&
    administrationActs(category) &&
    user.permissions.has('PRIORITY_CHANGE_MANAGED') &&
    !isReadOnlyStatus(req.status) &&
    req.status !== 'DRAFT';
  if (ownPriority || managedPriority) actions.push('CHANGE_PRIORITY');

  return actions;
}

export function canCreateInCategory(user: PolicyUser, category: PolicyCategory): boolean {
  if (!user.active || !category.active) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  // L'administration peut créer dans toutes les catégories (sans y être tenue).
  if (user.role === 'MANAGER') return user.permissions.has('REQUEST_CREATE');
  return category.creatorRoles.includes(user.role) && user.permissions.has('REQUEST_CREATE');
}

/** Le destinataire choisi doit être un utilisateur actif parmi les destinataires de la catégorie. */
export function canPickRecipient(
  category: PolicyCategory,
  candidate: { id: string; active: boolean } | null,
): boolean {
  return candidate !== null && candidate.active && category.recipientIds.has(candidate.id);
}

/** Écrivent : le demandeur, l'employé affecté et, en mode « via l'administration » seulement, ses responsables. */
export function canWriteInThread(user: PolicyUser, req: PolicyRequest, category: PolicyCategory): boolean {
  if (req.status === 'DRAFT' || isReadOnlyStatus(req.status) || !canReadRequest(user, req, category)) return false;
  const actors = actorsFor(user, req, category);
  if (actors.includes('REQUESTER') || actors.includes('ASSIGNEE')) return true;
  return administrationActs(category) && actors.includes('MANAGER');
}
