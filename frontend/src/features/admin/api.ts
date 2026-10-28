import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import type { Priority, Role } from '../../api/types';
import type { RoutingMode } from '../requests/types';

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  jobTitle: string | null;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  /** Catégories dont le compte est destinataire (sans catégorie : jamais proposé à l'affectation). */
  recipientCategories: Array<{ id: string; name: string }>;
  /** Affectations : étage de rattachement d'un surveillant (004). */
  floor?: { id: string; name: string } | null;
}

export type Circuit = 'A_DIRECT' | 'B_ADMIN_VALIDATION';
export type { RoutingMode };
export type ClosureMode = 'AUTO' | 'REQUESTER' | 'MANAGER';
export type AssignmentMode = 'MANUAL' | 'AUTO';
/** Demandes de travail ou couverture de classe ; fixé à la création. */
export type CategoryKind = 'WORK' | 'COVERAGE';
export type ProofMode = 'PHOTO' | 'QR' | 'BOTH';

export interface DeadlineRule {
  priority: Priority;
  validationMinutes: number | null;
  takeoverMinutes: number | null;
  completionMinutes: number | null;
  /** Couverture : arrivée en classe après acceptation. */
  arrivalMinutes?: number | null;
}

export interface Member {
  id: string;
  displayName: string;
}

export interface AdminCategory {
  id: string;
  name: string;
  active: boolean;
  circuit: Circuit;
  routingMode: RoutingMode;
  creatorRoles: Role[];
  closureMode: ClosureMode;
  autoCloseAfterMinutes: number;
  finalValidation: boolean;
  assignmentMode: AssignmentMode;
  autoAssigneeId: string | null;
  photoRequired: boolean;
  kind: CategoryKind;
  proofMode: ProofMode;
  recipients: Member[];
  managers: Member[];
  deadlineRules: DeadlineRule[];
}

/** Consigne (spec 009) : utilisée pour les propositions automatiques ; `categoryId` null = générale. */
export interface AdminGuideline {
  id: string;
  title: string;
  body: string;
  categoryId: string | null;
  categoryName: string | null;
  active: boolean;
  updatedAt: string;
  updatedBy: Member;
}

export interface GuidelineInput {
  title: string;
  body: string;
  categoryId: string | null;
  active: boolean;
}

export interface AdminSettings {
  voiceMaxSeconds: number;
  voiceMaxBytes: number;
  attachmentMaxBytes: number;
  attachmentMaxPerMessage: number;
  allowedPhotoTypes: string[];
  allowedDocumentTypes: string[];
  draftsEnabled: boolean;
  deadlineWarnPercent: number;
  sessionIdleMinutes: number;
  sessionMaxHours: number;
  coverageUrgencyThresholdMinutes: number;
  coverageEscalationMinutes: number;
  /** Heure locale du rappel du matin (HH:MM). */
  coverageMorningReminderTime: string;
  coverageCloseReminderMinutes: number;
  coverageCloseEscalationMinutes: number;
  coverageSupportReminderMinutes: number;
  coverageSupportReminderMax: number;
  coverageRetentionMonths: number;
}

export type ConfigurableRole = 'EMPLOYEE' | 'ADMIN';
export type RolePermissions = Record<ConfigurableRole, string[]>;

export interface AuditEntry {
  id: string;
  action: string;
  actor: Member | null;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface AuditFilters {
  actorId: string;
  action: string;
  from: string;
  to: string;
}

export const adminKeys = {
  all: ['admin'] as const,
  users: ['admin', 'users'] as const,
  categories: ['admin', 'categories'] as const,
  guidelines: ['admin', 'guidelines'] as const,
  settings: ['admin', 'settings'] as const,
  rolePermissions: ['admin', 'role-permissions'] as const,
  audit: (filters: AuditFilters) => ['admin', 'audit', filters] as const,
};

export function useAdminUsers() {
  return useQuery({
    queryKey: adminKeys.users,
    queryFn: () => apiFetch<AdminUser[]>('/api/admin/users'),
  });
}

export function useAdminCategories() {
  return useQuery({
    queryKey: adminKeys.categories,
    queryFn: () => apiFetch<AdminCategory[]>('/api/admin/categories'),
  });
}

export function useAdminGuidelines() {
  return useQuery({
    queryKey: adminKeys.guidelines,
    queryFn: () => apiFetch<AdminGuideline[]>('/api/admin/guidelines'),
  });
}

export function saveGuideline(id: string | null, input: Partial<GuidelineInput>): Promise<AdminGuideline> {
  return id
    ? apiFetch<AdminGuideline>(`/api/admin/guidelines/${id}`, { method: 'PATCH', body: input })
    : apiFetch<AdminGuideline>('/api/admin/guidelines', { method: 'POST', body: input });
}

export function deleteGuideline(id: string): Promise<void> {
  return apiFetch<void>(`/api/admin/guidelines/${id}`, { method: 'DELETE' });
}

export function useAdminSettings() {
  return useQuery({
    queryKey: adminKeys.settings,
    queryFn: () => apiFetch<AdminSettings>('/api/admin/settings'),
  });
}

export function useRolePermissions() {
  return useQuery({
    queryKey: adminKeys.rolePermissions,
    queryFn: () => apiFetch<RolePermissions>('/api/admin/role-permissions'),
  });
}

export function useAuditLog(filters: AuditFilters) {
  return useInfiniteQuery({
    queryKey: adminKeys.audit(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
      if (pageParam) params.set('cursor', pageParam);
      const query = params.toString();
      return apiFetch<{ items: AuditEntry[]; nextCursor: string | null }>(
        `/api/admin/audit${query ? `?${query}` : ''}`,
      );
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}
