import type { Permission, RequestKind, RequestStatus, Role } from '@prisma/client';
import { availableActions, type Actor, type MachineRequest, type RequestAction } from './request-state-machine';

/**
 * Politique d'accès — specs/001-demandes-travail-vocales/data-model.md §Matrice d'accès.
 * Fonctions pures : les mêmes règles servent aux routes REST, aux fichiers et aux salles Socket.IO ;
 * les listes utilisent l'équivalent SQL de canReadRequest (visibility.ts).
 */

export const ALL_PERMISSIONS: readonly Permission[] = [
  'REQUEST_CREATE',
  'PRIORITY_CHANGE_OWN',
  'PRIORITY_CHANGE_MANAGED',
  'REQUEST_REASSIGN',
  'AUDIT_READ',
  'ADMIN_MANAGE',
];

export interface PolicyUser {
  id: string;
  role: Role;
  active: boolean;
  permissions: ReadonlySet<Permission>;
}

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

/** Le super administrateur a toujours toutes les permissions (non stockées en base). */
export function permissionsFor(role: Role, configured: readonly Permission[]): ReadonlySet<Permission> {
  return new Set(role === 'SUPER_ADMIN' ? ALL_PERMISSIONS : configured);
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
    !isFinalStatus(req.status) &&
    req.status !== 'DONE' &&
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
  return req.status !== 'DRAFT' && !isFinalStatus(req.status) && canReadRequest(user, req, category);
}

export function canManageAdministration(user: Pick<PolicyUser, 'role' | 'active'>): boolean {
  return user.active && user.role === 'SUPER_ADMIN';
}

/** FR-030 : le journal d'audit est consultable par le super administrateur uniquement. */
export function canReadAudit(user: Pick<PolicyUser, 'role' | 'active'>): boolean {
  return user.active && user.role === 'SUPER_ADMIN';
}
