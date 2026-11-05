import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import type { Priority } from '../../api/types';
import { t } from '../../i18n';

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
  | 'COVERAGE_TEACHER_ARRIVED'
  | 'COVERAGE_ATTENDANCE_ANOMALY'
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
  REQUEST_NEW: t('Nouvelle demande'),
  MESSAGE_NEW: t('Nouveau message'),
  ASSIGNED: t('Demande affectée'),
  STATUS_CHANGED: t('Statut modifié'),
  URGENT: t('Demande urgente'),
  TO_CORRECT: t('Demande à corriger'),
  REJECTED: t('Demande refusée'),
  CANCELLED: t('Demande annulée'),
  OVERDUE: t('Demande en retard'),
  CLOSED: t('Demande clôturée'),
  COVERAGE_NEW: t('Garde à prendre'),
  COVERAGE_TAKEN: t('Garde déjà prise'),
  COVERAGE_ACCEPTED: t('Garde acceptée'),
  COVERAGE_PRESENCE: t('Présence confirmée en classe'),
  COVERAGE_RELEASED: t('Désistement'),
  COVERAGE_RELIEF_REQUESTED: t('Relève demandée'),
  COVERAGE_LATE: t('Garde en retard'),
  COVERAGE_UNFILLED: t('Garde non pourvue'),
  COVERAGE_EXTENDED: t('Garde prolongée'),
  COVERAGE_RELIEVED: t('Garde terminée'),
  COVERAGE_REQUESTED: t('Retard ou absence signalé'),
  COVERAGE_EMPTY_CLASS: t('Classe vide signalée'),
  COVERAGE_TAKEOVER_EXPIRED: t('Demande en attente d’assignation'),
  COVERAGE_ESCALATED: t('Alerte non traitée'),
  COVERAGE_MORNING_REMINDER: t('Rappel : demande du jour en attente'),
  COVERAGE_CLOSE_REMINDER: t('Affectation à clôturer'),
  COVERAGE_DUPLICATE: t('Doublon possible'),
  COVERAGE_SUPPORT_REMINDER: t('Renfort à décider'),
  COVERAGE_DOUBLE_ASSIGNMENT: t('Surveillant sur deux affectations'),
  COVERAGE_LIFTED: t('Affectation levée'),
  COVERAGE_UPDATED: t('Affectation modifiée'),
  COVERAGE_TEACHER_ARRIVED: t('Enseignant arrivé'),
  COVERAGE_ATTENDANCE_ANOMALY: t('Absence annoncée mais enseignant présent'),
  UNASSIGNED: t('Demande sans employé affecté'),
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
