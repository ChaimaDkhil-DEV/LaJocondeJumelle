import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import type { AuditEntry } from '../admin/api';

/** Période de classe d'un élève (021) ; `endedAt` est le début de la suivante, null pour la période actuelle. */
export interface ClassPeriod {
  id: string;
  class: { id: string; name: string; level: string | null; floor: string | null; room: string | null };
  startedAt: string;
  endedAt: string | null;
  changedBy: { id: string; displayName: string } | null;
  reconstructed: boolean;
  availability: 'KNOWN' | 'PROBABLE';
  probableUntil: string | null;
  warning: string | null;
}

export interface ClassHistory {
  studentId: string;
  items: ClassPeriod[];
}

export const studentHistoryKeys = {
  classHistory: (studentId: string) => ['admin', 'students', studentId, 'class-history'] as const,
};

/** Périodes de classe d'un élève, de la plus récente à la plus ancienne ; chargées à l'ouverture seulement. */
export function useClassHistory(studentId: string | null) {
  return useQuery({
    queryKey: studentHistoryKeys.classHistory(studentId ?? ''),
    queryFn: () => apiFetch<ClassHistory>(`/api/admin/students/${studentId}/class-history`),
    enabled: studentId !== null,
  });
}

/** Journal de l'élève (modifications de sa fiche, consultations de sa situation), chargé à la demande, page par page. */
export function useStudentAudit(studentId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['admin', 'students', studentId, 'audit'] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiFetch<{ items: AuditEntry[]; nextCursor: string | null }>(`/api/admin/students/${studentId}/audit${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

// ---------------------------------------------------------------------------
// Situation à un instant donné
// ---------------------------------------------------------------------------

/** Connue (enregistrée), probable (déduite de la classe actuelle), aucune information enregistrée, ou indisponible. */
export type Availability = 'KNOWN' | 'PROBABLE' | 'NONE' | 'UNAVAILABLE';

export interface Section<T> {
  availability: Availability;
  value?: T;
  warning?: string;
  reasonUnavailable?: string;
}

export interface Person {
  id: string;
  displayName: string;
  anonymized?: boolean;
}

export interface Arrival {
  teacher: Person;
  status: 'ARRIVED' | 'ON_TIME' | 'LATE' | 'ABSENT';
  method: 'QR' | 'MANUAL';
  arrivedAt: string | null;
  recordedAt: string;
  comment: string | null;
  corrected: boolean;
}

export interface SituationChange {
  kind: string;
  at: string;
  by: Person | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  madeAfterMoment: boolean;
}

export interface Situation {
  student: { id: string; firstName: string; lastName: string };
  moment: { requested: string; evaluatedAt: string; timeZone: string };
  class: Section<{ id: string; name: string; level: string | null; floor: string | null; room: string | null; since: string; until: string | null; reconstructed: boolean }>;
  session: Section<{
    id: string;
    teacher: Person;
    subject: string | null;
    room: string | null;
    startAt: string;
    endAt: string;
    status: 'SCHEDULED' | 'CANCELLED';
    cancellation: { reason: string | null; at: string | null; by: Person | null } | null;
  }>;
  teacher: Section<{ arrivals: Arrival[]; laterArrivals: Arrival[]; absences: Arrival[]; departures: Array<{ teacher: Person; departedAt: string }>; dayLevelOnly: boolean }>;
  announcement: Section<{ requestId: string; type: 'ABSENCE' | 'LATENESS'; announcedLateMinutes: number | null; reason: string | null; startAt: string; plannedEndAt: string | null; announcedAt: string; anonymized: boolean }>;
  substitute: Section<{
    inForce: Person | null;
    previous: Array<{ teacher: Person; setAt: string; setBy: Person | null; madeAfterMoment: boolean }>;
    arrived: { teacher: Person; arrivedAt: string | null; recordedAt: string } | null;
  }>;
  supervisors: Section<{
    source: string | null;
    type: string | null;
    startAt: string;
    endAt: string | null;
    assignee: { user: Person; state: 'PRESENT' | 'ASSIGNED_NOT_RECORDED'; presentSince: string | null } | null;
    reinforcements: Array<{ user: Person; joinedAt: string }>;
  }>;
  changes: Section<SituationChange[]>;
}

/**
 * Demande la situation à un instant. Une mutation et non une requête en cache : chaque consultation est journalisée
 * côté serveur, elle ne doit se refaire que sur une action de la personne, jamais au retour sur la fenêtre.
 */
export function useAskSituation(studentId: string | null) {
  return useMutation({
    mutationFn: (at: string) => apiFetch<Situation>(`/api/admin/students/${studentId}/situation?at=${encodeURIComponent(at)}`),
  });
}
