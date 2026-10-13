import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import type { Availability, CoverageStatus, CoverageSummary, Named, Person, SchoolClass } from './types';

/** Administration des couvertures (super administrateur). Préfixe « coverage » : rafraîchie en direct. */
export const coverageAdminKeys = {
  groups: ['coverage', 'admin', 'groups'] as const,
  classes: ['coverage', 'admin', 'classes'] as const,
  qr: (id: string) => ['coverage', 'admin', 'classes', id, 'qr'] as const,
  dashboard: (query: string) => ['coverage', 'admin', 'dashboard', query] as const,
};

export interface AdminGroup {
  id: string;
  name: string;
  active: boolean;
  members: Person[];
  memberCount: number;
  availableCount: number;
}

export interface AdminClass extends SchoolClass {
  active: boolean;
  qrVersion: number;
  updatedAt: string;
}

export interface ClassQr {
  classId: string;
  name: string;
  room: string | null;
  version: number;
  url: string;
}

export interface EmployeeStats {
  id: string;
  displayName: string;
  jobTitle: string | null;
  availability: Availability;
  available: boolean;
  currentGuard: { requestId: string; reference: string; status: CoverageStatus; class: SchoolClass; since: string | null } | null;
  activeWorkTasks: number;
  guardsDone: number;
  averageTakeoverSeconds: number | null;
  lates: number;
  releases: number;
}

export interface Dashboard {
  generatedAt: string;
  counts: {
    open: number;
    unfilled: number;
    taken: number;
    late: number;
    onDuty: number;
    reliefPending: number;
    relieved: number;
    cancelled: number;
    total: number;
  };
  active: CoverageSummary[];
  employees: EmployeeStats[];
  emptyGroups: Array<Named & { memberCount: number; availableCount: number }>;
}

export function useAdminGroups() {
  return useQuery({ queryKey: coverageAdminKeys.groups, queryFn: () => apiFetch<AdminGroup[]>('/api/admin/coverage/groups') });
}

export function useSaveGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string; name: string; active: boolean; memberIds: string[] }) =>
      apiFetch<AdminGroup[]>(id ? `/api/admin/coverage/groups/${id}` : '/api/admin/coverage/groups', {
        method: id ? 'PATCH' : 'POST',
        body,
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['coverage'] }),
  });
}

export function useAdminClasses() {
  return useQuery({ queryKey: coverageAdminKeys.classes, queryFn: () => apiFetch<AdminClass[]>('/api/admin/coverage/classes') });
}

export function useSaveClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string; name: string; room?: string; active: boolean }) =>
      apiFetch<AdminClass[]>(id ? `/api/admin/coverage/classes/${id}` : '/api/admin/coverage/classes', {
        method: id ? 'PATCH' : 'POST',
        body,
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['coverage'] }),
  });
}

export function useClassQr(id: string | null) {
  return useQuery({
    queryKey: coverageAdminKeys.qr(id ?? ''),
    queryFn: () => apiFetch<ClassQr>(`/api/admin/coverage/classes/${id}/qr`),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

export function useRevokeQr() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<ClassQr>(`/api/admin/coverage/classes/${id}/qr/revoke`, { method: 'POST' }),
    onSuccess: (qr) => queryClient.setQueryData(coverageAdminKeys.qr(qr.classId), qr),
    onSettled: () => queryClient.invalidateQueries({ queryKey: coverageAdminKeys.classes }),
  });
}

export function useDashboard(query: string) {
  return useQuery({
    queryKey: coverageAdminKeys.dashboard(query),
    queryFn: () => apiFetch<Dashboard>(`/api/admin/coverage/dashboard${query ? `?${query}` : ''}`),
  });
}
