import type { Permission, Role } from '@prisma/client';

/** Permissions par défaut provisoires (à valider avec l'établissement) ; le super administrateur a tout. */
export const DEFAULT_PERMISSIONS: Record<Exclude<Role, 'SUPER_ADMIN'>, Permission[]> = {
  EMPLOYEE: ['REQUEST_CREATE', 'PRIORITY_CHANGE_OWN'],
  /** La surveillante générale valide aussi les communications aux parents (015), retirable dans les réglages. */
  ADMIN: [
    'REQUEST_CREATE',
    'PRIORITY_CHANGE_OWN',
    'PRIORITY_CHANGE_MANAGED',
    'REQUEST_REASSIGN',
    'PARENT_COMMUNICATION_VALIDATE',
  ],
  /** Représentant légal (015) : aucune permission ; il ne lit que ses « Messages de l'école ». */
  PARENT: [],
};
