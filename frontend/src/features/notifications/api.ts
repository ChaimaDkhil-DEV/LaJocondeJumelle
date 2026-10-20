import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import type { Priority } from '../../api/types';

export type NotificationType =
  | 'REQUEST_NEW'
  | 'MESSAGE_NEW'
  | 'ASSIGNED'
  | 'STATUS_CHANGED'
  | 'URGENT'
  | 'TO_CORRECT'
  | 'REJECTED'
  | 'CANCELLED'
  | 'OVERDUE'
  | 'CLOSED'
  // Couverture de classe
  | 'COVERAGE_NEW'
  | 'COVERAGE_TAKEN'
  | 'COVERAGE_ACCEPTED'
  | 'COVERAGE_PRESENCE'
  | 'COVERAGE_RELEASED'
  | 'COVERAGE_RELIEF_REQUESTED'
  | 'COVERAGE_LATE'
  | 'COVERAGE_UNFILLED'
  | 'COVERAGE_EXTENDED'
  | 'COVERAGE_RELIEVED'
  // Affectations (004)
  | 'COVERAGE_REQUESTED'
  | 'COVERAGE_EMPTY_CLASS'
  | 'COVERAGE_TAKEOVER_EXPIRED'
  | 'COVERAGE_ESCALATED'
  | 'COVERAGE_MORNING_REMINDER'
  | 'COVERAGE_CLOSE_REMINDER'
  | 'COVERAGE_DUPLICATE'
  | 'COVERAGE_SUPPORT_REMINDER'
  | 'COVERAGE_DOUBLE_ASSIGNMENT'
  | 'COVERAGE_LIFTED'
  | 'COVERAGE_UPDATED'
  // Super administrateur : demande active sans employé affecté, délai bientôt dépassé
  | 'UNASSIGNED';

/** Demande de travail ou couverture de classe : détermine la page ouverte. */
export type RequestKind = 'WORK' | 'COVERAGE';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  priority: Priority;
  request: { id: string; reference: string; title: string; kind?: RequestKind };
  createdAt: string;
  readAt: string | null;
}

/** Charge utile de l'événement Socket.IO `notification:new`. */
export interface NotificationEvent {
  id: string;
  type: NotificationType;
  priority: Priority;
  requestId: string;
  reference: string;
  title: string;
  kind?: RequestKind;
  createdAt: string;
}

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  REQUEST_NEW: 'Nouvelle demande',
  MESSAGE_NEW: 'Nouveau message',
  ASSIGNED: 'Demande affectée',
  STATUS_CHANGED: 'Statut modifié',
  URGENT: 'Demande urgente',
  TO_CORRECT: 'Demande à corriger',
  REJECTED: 'Demande refusée',
  CANCELLED: 'Demande annulée',
  OVERDUE: 'Demande en retard',
  CLOSED: 'Demande clôturée',
  COVERAGE_NEW: 'Garde à prendre',
  COVERAGE_TAKEN: 'Garde déjà prise',
  COVERAGE_ACCEPTED: 'Garde acceptée',
  COVERAGE_PRESENCE: 'Présence confirmée en classe',
  COVERAGE_RELEASED: 'Désistement',
  COVERAGE_RELIEF_REQUESTED: 'Relève demandée',
  COVERAGE_LATE: 'Garde en retard',
  COVERAGE_UNFILLED: 'Garde non pourvue',
  COVERAGE_EXTENDED: 'Garde prolongée',
  COVERAGE_RELIEVED: 'Garde terminée',
  COVERAGE_REQUESTED: 'Retard ou absence signalé',
  COVERAGE_EMPTY_CLASS: 'Classe vide signalée',
  COVERAGE_TAKEOVER_EXPIRED: 'Demande en attente d’assignation',
  COVERAGE_ESCALATED: 'Alerte non traitée',
  COVERAGE_MORNING_REMINDER: 'Rappel : demande du jour en attente',
  COVERAGE_CLOSE_REMINDER: 'Affectation à clôturer',
  COVERAGE_DUPLICATE: 'Doublon possible',
  COVERAGE_SUPPORT_REMINDER: 'Renfort à décider',
  COVERAGE_DOUBLE_ASSIGNMENT: 'Surveillant sur deux affectations',
  COVERAGE_LIFTED: 'Affectation levée',
  COVERAGE_UPDATED: 'Demande modifiée',
  UNASSIGNED: 'Demande sans responsable',
};

/** Page de la demande liée : les couvertures ont leurs propres écrans. */
export function requestPath(requestId: string, kind: RequestKind | undefined): string {
  return kind === 'COVERAGE' ? `/gardes/${requestId}` : `/demandes/${requestId}`;
}

export const NOTIFICATIONS_KEY = ['notifications'] as const;

export function useUnreadNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () =>
      apiFetch<{ items: NotificationItem[]; nextCursor: string | null; unreadTotal: number }>(
        '/api/notifications?unread=true&limit=20',
      ),
    staleTime: 60_000,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { ids: string[] } | { all: true }) =>
      apiFetch<void>('/api/notifications/read', { method: 'POST', body }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}
