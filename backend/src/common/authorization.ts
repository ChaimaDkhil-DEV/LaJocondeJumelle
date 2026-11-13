import type { Permission, Role } from '@prisma/client';

/**
 * Règles d'autorisation transverses (permissions par rôle, administration, audit), communes à
 * tous les domaines ; les règles propres aux demandes restent dans requests/domain/access-policy.ts.
 */

export const ALL_PERMISSIONS: readonly Permission[] = [
  'REQUEST_CREATE',
  'PRIORITY_CHANGE_OWN',
  'PRIORITY_CHANGE_MANAGED',
  'REQUEST_REASSIGN',
  'AUDIT_READ',
  'ADMIN_MANAGE',
  'PARENT_COMMUNICATION_VALIDATE',
  'PARENT_COMM_SEND_DIRECT',
  'PARENT_COMM_SUBMIT_FOR_APPROVAL',
];

export interface PolicyUser {
  id: string;
  role: Role;
  active: boolean;
  permissions: ReadonlySet<Permission>;
}

/** Le super administrateur a toujours toutes les permissions (non stockées en base). */
export function permissionsFor(role: Role, configured: readonly Permission[]): ReadonlySet<Permission> {
  return new Set(role === 'SUPER_ADMIN' ? ALL_PERMISSIONS : configured);
}

export function canManageAdministration(user: Pick<PolicyUser, 'role' | 'active'>): boolean {
  return user.active && user.role === 'SUPER_ADMIN';
}


/**
 * Données de référence (étages, niveaux, classes, élèves) et liste des employés en lecture (011) :
 * admin et super administrateur actifs. Règle de rôle, pas la permission configurable ADMIN_MANAGE,
 * qui pourrait être accordée à un employé depuis les réglages.
 */
export function canUseAdministrationSpace(user: Pick<PolicyUser, 'role' | 'active'>): boolean {
  return user.active && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN');
}
