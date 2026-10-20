/**
 * Types partagés avec l'API, écrits à la main. Les énumérations sont comparées au schéma Prisma
 * par tests/api/enums-sync.test.ts.
 */

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE';

export type Priority = 'NORMAL' | 'MEDIUM' | 'HIGH' | 'URGENT';

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
  displayName: string;
  role: Role;
  permissions: string[];
  mustChangePassword: boolean;
}
