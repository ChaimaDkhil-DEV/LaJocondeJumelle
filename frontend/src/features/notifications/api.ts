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
  | 'CLOSED';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  priority: Priority;
  request: { id: string; reference: string; title: string };
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
};

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
