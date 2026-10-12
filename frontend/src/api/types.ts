/**
 * Types partagés avec l'API. Ils seront remplacés progressivement par les types générés
 * depuis l'OpenAPI du backend (`npm run -w frontend api:types` → src/api/schema.d.ts).
 */

export type Role = 'SUPER_ADMIN' | 'MANAGER' | 'EMPLOYEE';

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
