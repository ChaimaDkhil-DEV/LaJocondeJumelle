import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import type { Priority, Role } from '../../api/types';

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  jobTitle: string | null;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export type Circuit = 'A_DIRECT' | 'B_ADMIN_VALIDATION';
export type ClosureMode = 'AUTO' | 'REQUESTER' | 'MANAGER';
export type AssignmentMode = 'MANUAL' | 'AUTO';

export interface DeadlineRule {
  priority: Priority;
  validationMinutes: number | null;
  takeoverMinutes: number | null;
  completionMinutes: number | null;
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
  creatorRoles: Role[];
  closureMode: ClosureMode;
  autoCloseAfterMinutes: number;
  finalValidation: boolean;
  assignmentMode: AssignmentMode;
  autoAssigneeId: string | null;
  photoRequired: boolean;
  recipients: Member[];
  managers: Member[];
  deadlineRules: DeadlineRule[];
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
}

export type ConfigurableRole = 'EMPLOYEE' | 'MANAGER';
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
  settings: ['admin', 'settings'] as const,
  rolePermissions: ['admin', 'role-permissions'] as const,
  audit: (filters: AuditFilters) => ['admin', 'audit', filters] as const,
};

export function useAdminUsers() {
  return useQuery({ queryKey: adminKeys.users, queryFn: () => apiFetch<AdminUser[]>('/api/admin/users') });
}

export function useAdminCategories() {
  return useQuery({ queryKey: adminKeys.categories, queryFn: () => apiFetch<AdminCategory[]>('/api/admin/categories') });
}

export function useAdminSettings() {
  return useQuery({ queryKey: adminKeys.settings, queryFn: () => apiFetch<AdminSettings>('/api/admin/settings') });
}

export function useRolePermissions() {
  return useQuery({ queryKey: adminKeys.rolePermissions, queryFn: () => apiFetch<RolePermissions>('/api/admin/role-permissions') });
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
      return apiFetch<{ items: AuditEntry[]; nextCursor: string | null }>(`/api/admin/audit${query ? `?${query}` : ''}`);
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}
