import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import { coverageKeys } from '../coverage/api';
import type {
  ArrivalResolution,
  ArrivalResult,
  AttendanceDay,
  AttendanceItem,
  CorrectionInput,
  ManualInput,
} from './types';

/** Toutes les clés commencent par « attendance » : une saisie ou un scan invalide le module. */
export const attendanceKeys = {
  all: ['attendance'] as const,
  mine: ['attendance', 'mine'] as const,
  day: (date: string) => ['attendance', 'day', date] as const,
  resolve: (token: string) => ['attendance', 'resolve', token] as const,
};

/** Page du QR pour un enseignant : classe, pointage du jour, rattachement prévu. N'enregistre rien. */
export function useResolveArrival(token: string) {
  return useQuery({
    queryKey: attendanceKeys.resolve(token),
    queryFn: () => apiFetch<ArrivalResolution>('/api/attendance/resolve', { method: 'POST', body: { token } }),
    enabled: Boolean(token),
    retry: false,
    staleTime: 0,
  });
}

/** Enregistre l'arrivée : l'identité vient de la session et l'heure du serveur, jamais du navigateur. */
export function useArrive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => apiFetch<ArrivalResult>('/api/attendance/arrive', { method: 'POST', body: { token } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: attendanceKeys.all }),
  });
}

export function useMyAttendance(enabled = true) {
  return useQuery({ queryKey: attendanceKeys.mine, queryFn: () => apiFetch<AttendanceItem[]>('/api/attendance/mine'), enabled });
}

/** Suivi d'une journée (admins) ; `date` vide : aujourd'hui, dans le fuseau de l'école. */
export function useAttendanceDay(date: string) {
  return useQuery({
    queryKey: attendanceKeys.day(date),
    queryFn: () => apiFetch<AttendanceDay>(`/api/attendance/day${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  });
}

export function useRecordManual() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ManualInput) => apiFetch<AttendanceItem>('/api/attendance/manual', { method: 'POST', body: input }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: attendanceKeys.all }),
  });
}

export function useCorrectAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CorrectionInput) => apiFetch<AttendanceItem>(`/api/attendance/${id}`, { method: 'PATCH', body }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: attendanceKeys.all }),
  });
}

/** Désigne (ou retire, avec null) le remplaçant d'une absence annoncée. */
export function useSetSubstitute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, teacherId }: { requestId: string; teacherId: string | null }) =>
      apiFetch<{ requestId: string; substituteTeacherId: string | null }>(`/api/attendance/substitutes/${requestId}`, {
        method: 'PATCH',
        body: { teacherId },
      }),
    onSettled: () => Promise.all([queryClient.invalidateQueries({ queryKey: attendanceKeys.all }), queryClient.invalidateQueries({ queryKey: coverageKeys.all })]),
  });
}
