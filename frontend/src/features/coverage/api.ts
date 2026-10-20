import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import type {
  ActionInput,
  Availability,
  Candidate,
  CoverageDetail,
  CoverageProfile,
  CoverageSummary,
  CoverageType,
  Named,
  PersonalHistory,
  Person,
  QrResolution,
  SchoolClass,
  TeamMember,
} from './types';

/** Formulaire d'affectation directe : classes (avec étage) et enseignants. */
export interface FormOptions {
  classes: Array<SchoolClass & { floor: Named | null }>;
  teachers: Person[];
}

/** Toutes les clés commencent par « coverage » : un événement temps réel invalide tout le module. */
export const coverageKeys = {
  all: ['coverage'] as const,
  profile: ['coverage', 'profile'] as const,
  mine: ['coverage', 'mine'] as const,
  myRequests: ['coverage', 'my-requests'] as const,
  classes: ['coverage', 'classes'] as const,
  history: ['coverage', 'history'] as const,
  list: (query: string) => ['coverage', 'list', query] as const,
  detail: (id: string) => ['coverage', 'detail', id] as const,
  candidates: (id: string) => ['coverage', 'detail', id, 'candidates'] as const,
  formOptions: ['coverage', 'form-options'] as const,
  team: ['coverage', 'team'] as const,
};

export function useCoverageProfile() {
  return useQuery({ queryKey: coverageKeys.profile, queryFn: () => apiFetch<CoverageProfile>('/api/coverage/availability') });
}

/** « Mes signalements » de l'enseignant. */
export function useMyRequests(enabled = true) {
  return useQuery({ queryKey: coverageKeys.myRequests, queryFn: () => apiFetch<CoverageSummary[]>('/api/coverage/my-requests'), enabled });
}

/** Toutes les classes actives, avec leur étage. */
export function useCoverageClasses() {
  return useQuery({
    queryKey: coverageKeys.classes,
    queryFn: () => apiFetch<Array<SchoolClass & { floor: Named | null }>>('/api/coverage/classes'),
  });
}

/** Demande d'un enseignant (création) ; `id` présent : modification tant qu'elle est en attente. */
export interface TeacherRequestInput {
  type: 'LATENESS' | 'ABSENCE';
  classId: string;
  date: string;
  startTime: string;
  endTime?: string;
  durationMinutes?: number;
}

export function useSaveTeacherRequest(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TeacherRequestInput & { clientId?: string; version?: number; reason?: string | null }) =>
      id
        ? apiFetch<CoverageDetail>(`/api/coverage/${id}/teacher-request`, { method: 'PATCH', body: input })
        : apiFetch<CoverageDetail>('/api/coverage/teacher-requests', { method: 'POST', body: input }),
    onSuccess: (detail) => queryClient.setQueryData(coverageKeys.detail(detail.id), detail),
    onSettled: () => queryClient.invalidateQueries({ queryKey: coverageKeys.all }),
  });
}

export function useMyGuards(enabled = true) {
  return useQuery({
    queryKey: coverageKeys.mine,
    queryFn: () => apiFetch<{ availability: CoverageProfile; items: CoverageDetail[] }>('/api/coverage/mine'),
    enabled,
  });
}

export function useCoverageHistory(enabled = true) {
  return useQuery({ queryKey: coverageKeys.history, queryFn: () => apiFetch<PersonalHistory>('/api/coverage/history'), enabled });
}

export function useCoverageList(query: string, enabled = true) {
  return useQuery({
    queryKey: coverageKeys.list(query),
    queryFn: () => apiFetch<CoverageSummary[]>(`/api/coverage${query ? `?${query}` : ''}`),
    enabled,
  });
}

export function useCoverage(id: string, enabled = true) {
  return useQuery({
    queryKey: coverageKeys.detail(id),
    queryFn: () => apiFetch<CoverageDetail>(`/api/coverage/${id}`),
    enabled,
  });
}

export function useCandidates(id: string, enabled: boolean) {
  return useQuery({
    queryKey: coverageKeys.candidates(id),
    queryFn: () => apiFetch<Candidate[]>(`/api/coverage/${id}/candidates`),
    enabled,
    staleTime: 0,
  });
}

export function useFormOptions() {
  return useQuery({ queryKey: coverageKeys.formOptions, queryFn: () => apiFetch<FormOptions>('/api/coverage/form-options') });
}

export function useTeam(enabled = true) {
  return useQuery({ queryKey: coverageKeys.team, queryFn: () => apiFetch<TeamMember[]>('/api/coverage/team'), enabled });
}

/** Action de la machine à états ; renvoie la couverture à jour. Toujours suivie d'un rafraîchissement du module. */
export function useCoverageAction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ActionInput) =>
      apiFetch<CoverageDetail>(`/api/coverage/${id}/actions`, { method: 'POST', body: input }),
    onSuccess: (detail) => queryClient.setQueryData(coverageKeys.detail(id), detail),
    onSettled: () => queryClient.invalidateQueries({ queryKey: coverageKeys.all }),
  });
}

/** Affectation directe (contracts/rest-api.md `POST /coverage`). */
export interface NewCoverageInput {
  clientId: string;
  classId: string;
  type: CoverageType;
  teacherId?: string | null;
  startAt: string;
  endAt: string;
  assigneeId: string;
  reason?: string;
  note?: string;
  voiceFileId?: string;
}

export function useCreateCoverage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewCoverageInput) =>
      apiFetch<CoverageDetail>('/api/coverage', { method: 'POST', body: input }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: coverageKeys.all }),
  });
}

export function useSetOwnAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (availability: 'AVAILABLE' | 'UNAVAILABLE') =>
      apiFetch<CoverageProfile>('/api/coverage/availability', { method: 'PATCH', body: { availability } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: coverageKeys.all }),
  });
}

export function useSetAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, availability }: { userId: string; availability: Availability }) =>
      apiFetch(`/api/coverage/team/${userId}/availability`, { method: 'PATCH', body: { availability } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: coverageKeys.all }),
  });
}

export function resolveQr(token: string): Promise<QrResolution> {
  return apiFetch<QrResolution>('/api/coverage/presence/resolve', { method: 'POST', body: { token } });
}

