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

/** FR-030 : le journal d'audit est consultable par le super administrateur uniquement. */
export function canReadAudit(user: Pick<PolicyUser, 'role' | 'active'>): boolean {
  return user.active && user.role === 'SUPER_ADMIN';
}
