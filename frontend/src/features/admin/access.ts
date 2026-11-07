import type { Me } from '../../api/types';

/**
 * Espace « Administrateur » (011) : admin et super administrateur. L'interface ne fait que masquer ;
 * le serveur vérifie chaque route (AdministrationGuard, SuperAdminGuard).
 */
export function canUseAdministrationSpace(me: Pick<Me, 'role'> | undefined): boolean {
  return me?.role === 'ADMIN' || me?.role === 'SUPER_ADMIN';
}

export function isSuperAdmin(me: Pick<Me, 'role'> | undefined): boolean {
  return me?.role === 'SUPER_ADMIN';
}

