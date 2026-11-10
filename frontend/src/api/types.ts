/**
 * Types partagés avec l'API, écrits à la main. Les énumérations sont comparées au schéma Prisma
 * par tests/api/enums-sync.test.ts.
 */

/** PARENT : représentant légal d'élève (015), limité à « Messages de l'école ». */
export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE' | 'PARENT';

/** Deux priorités métier (016) ; MEDIUM et HIGH, converties par la migration 0024, ne restent que dans l'historique. */
export type Priority = 'NORMAL' | 'URGENT';

export type RequestStatus =
  | 'DRAFT'
  | 'PENDING_ADMIN_VALIDATION'
  | 'SENT'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'PENDING_FINAL_VALIDATION'
  | 'TO_CORRECT'
  | 'CLOSED'
  | 'REJECTED'
  | 'CANCELLED';

export interface Me {
  id: string;
  /** Identifiant de connexion et fonction (« Mon profil », spec 005). */
  username: string;
  displayName: string;
  jobTitle: string | null;
  role: Role;
  permissions: string[];
  mustChangePassword: boolean;
  /** Affectations (004) : membre des groupes Enseignants et Surveillants. */
  isTeacher?: boolean;
  isSupervisor?: boolean;
}
