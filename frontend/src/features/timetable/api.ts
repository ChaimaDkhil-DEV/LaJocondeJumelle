import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from '../../api/client';
import type { MyTimetable, SeriesInput, SessionInput, TimetableConflict, TimetableSeries, TimetableSession } from './types';

/** Toutes les clés commencent par « timetable » : une écriture (ou l'événement temps réel) invalide le module. */
export const timetableKeys = {
  all: ['timetable'] as const,
  sessions: (q: SessionsFilter) => ['timetable', 'sessions', q] as const,
  mine: (from: string, to: string) => ['timetable', 'mine', from, to] as const,
};

export interface SessionsFilter {
  from: string;
  to: string;
  teacherId?: string;
  classId?: string;
}

/** Administration : séances d'une période, annulées comprises (affichées comme telles). */
export function useTimetableSessions(filter: SessionsFilter, enabled = true) {
  const params = new URLSearchParams({ from: filter.from, to: filter.to, includeCancelled: 'true' });
  if (filter.teacherId) params.set('teacherId', filter.teacherId);
  if (filter.classId) params.set('classId', filter.classId);
  return useQuery({
    queryKey: timetableKeys.sessions(filter),
    queryFn: () => apiFetch<TimetableSession[]>(`/api/timetable/sessions?${params.toString()}`),
    enabled,
  });
}

/** Enseignant : son propre emploi du temps ; l'identité vient de la session, jamais d'un paramètre. */
export function useMyTimetable(from: string, to: string) {
  return useQuery({
    queryKey: timetableKeys.mine(from, to),
    queryFn: () => apiFetch<MyTimetable>(`/api/timetable/mine?from=${from}&to=${to}`),
  });
}

function useTimetableMutation<V, R>(request: (v: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: timetableKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'expected'] });
    },
  });
}

export const useCreateSession = () =>
  useTimetableMutation((body: SessionInput) => apiFetch<TimetableSession>('/api/timetable/sessions', { method: 'POST', body }));

export const useCreateSeries = () =>
  useTimetableMutation((body: SeriesInput) =>
    apiFetch<{ series: TimetableSeries; sessionCount: number }>('/api/timetable/series', { method: 'POST', body }),
  );

export const useUpdateSession = () =>
  useTimetableMutation(({ id, ...body }: Partial<SessionInput> & { id: string }) =>
    apiFetch<TimetableSession>(`/api/timetable/sessions/${id}`, { method: 'PATCH', body }),
  );

export const useUpdateSeries = () =>
  useTimetableMutation(
    ({ id, ...body }: { id: string; from: string } & Partial<Omit<SessionInput, 'date'>> & { endDate?: string }) =>
      apiFetch<{ series: TimetableSeries; updated: number; created: number; cancelled: number }>(`/api/timetable/series/${id}`, {
        method: 'PATCH',
        body,
      }),
  );

export const useCancelSession = () =>
  useTimetableMutation(({ id, reason }: { id: string; reason: string }) =>
    apiFetch<TimetableSession>(`/api/timetable/sessions/${id}/cancel`, { method: 'POST', body: { reason } }),
  );

export const useCancelSeriesRange = () =>
  useTimetableMutation(({ id, ...body }: { id: string; from: string; to: string; reason: string }) =>
    apiFetch<{ cancelled: number }>(`/api/timetable/series/${id}/cancel`, { method: 'POST', body }),
  );

/** Conflits d'horaires renvoyés par le serveur (409 TIMETABLE_CONFLICT), sinon null. */
export function conflictsOf(error: unknown): TimetableConflict[] | null {
  if (!(error instanceof ApiError) || error.code !== 'TIMETABLE_CONFLICT') return null;
  return (error.details?.conflicts ?? []) as TimetableConflict[];
}
