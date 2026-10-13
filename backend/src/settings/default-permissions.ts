import type { Permission, Role } from '@prisma/client';

/** Permissions par défaut provisoires (à valider avec l'établissement) ; le super administrateur a tout. */
export const DEFAULT_PERMISSIONS: Record<Exclude<Role, 'SUPER_ADMIN'>, Permission[]> = {
  EMPLOYEE: ['REQUEST_CREATE', 'PRIORITY_CHANGE_OWN'],
  MANAGER: ['REQUEST_CREATE', 'PRIORITY_CHANGE_OWN', 'PRIORITY_CHANGE_MANAGED', 'REQUEST_REASSIGN'],
};
