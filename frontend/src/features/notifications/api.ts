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
  | 'UNASSIGNED'
  // Communication enseignant / parents (015)
  | 'PARENT_COMM_TO_VALIDATE'
  | 'PARENT_COMM_RETURNED'
  | 'PARENT_COMM_APPROVED'
  | 'PARENT_COMM_REJECTED'
  | 'PARENT_MESSAGE_NEW'
  | 'TEACHER_MESSAGE_NEW';

/** Demande de travail ou couverture de classe : détermine la page ouverte. */
export type RequestKind = 'WORK' | 'COVERAGE';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  priority: Priority;
  /** Demande liée ; null pour une communication aux parents (015). */
  request: { id: string; reference: string; title: string; kind?: RequestKind } | null;
  /** Communication aux parents liée (015) : le nom de l'élève sert de titre. */
  communication?: { id: string; studentName: string } | null;
  createdAt: string;
  readAt: string | null;
}

/** Charge utile de l'événement Socket.IO `notification:new`. */
export interface NotificationEvent {
  id: string;
  type: NotificationType;
  priority: Priority;
  requestId: string | null;
  /** Communication aux parents (015) : `kind` vaut alors COMMUNICATION. */
  communicationId?: string | null;
  reference: string;
  title: string;
  kind?: RequestKind | 'COMMUNICATION';
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
  PARENT_COMM_TO_VALIDATE: t('Communication aux parents à valider'),
  PARENT_COMM_RETURNED: t('Communication retournée pour correction'),
  PARENT_COMM_APPROVED: t('Communication approuvée et publiée'),
  PARENT_COMM_REJECTED: t('Communication rejetée'),
  PARENT_MESSAGE_NEW: t('Nouveau message de l’école'),
  TEACHER_MESSAGE_NEW: t('Nouveau message d’un parent'),
};

/**
 * Page d'une communication aux parents selon le destinataire de la notification (015). Un parent
 * ouvre toujours la conversation du message (le sien, retourné ou rejeté, ou celui de l'école).
 */
export function communicationPath(
  type: NotificationType,
  communicationId: string,
  forParent = false,
): string {
  if (forParent || type === 'PARENT_MESSAGE_NEW') return `/messages-ecole/${communicationId}`;
  if (type === 'PARENT_COMM_TO_VALIDATE') return `/communications-a-valider/${communicationId}`;
  if (type === 'TEACHER_MESSAGE_NEW') return `/communications-parents/message/${communicationId}`;
  return `/communications-parents/${communicationId}`;
}

/** Page ouverte par une notification de la cloche : la demande, ou la communication aux parents. */
export function notificationPath(item: NotificationItem, forParent = false): string {
  if (item.communication) return communicationPath(item.type, item.communication.id, forParent);
  return item.request ? requestPath(item.request.id, item.request.kind) : '/';
}

/** Page ouverte par le bandeau d'une notification reçue en direct. */
export function eventPath(event: NotificationEvent, forParent = false): string {
  if (event.communicationId)
    return communicationPath(event.type, event.communicationId, forParent);
  return event.requestId ? requestPath(event.requestId, event.kind === 'COMMUNICATION' ? undefined : event.kind) : '/';
}

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

// ---------------------------------------------------------------------------
// Préférences de notification (spec 014, FR-009) : catégories push et son des urgences, sur le compte.
// ---------------------------------------------------------------------------

export type PushCategoryName = 'urgent' | 'coverage' | 'unfilled' | 'attendance';

export interface NotificationPreferences {
  categories: Record<PushCategoryName, boolean>;
  urgentSound: boolean;
  /** false : son jamais réglé sur le compte (reprise unique de la valeur locale, NC-6). */
  urgentSoundSet: boolean;
}

export interface NotificationPreferencesPatch {
  categories?: Partial<Record<PushCategoryName, boolean>>;
  urgentSound?: boolean;
}

/** Racine distincte de NOTIFICATIONS_KEY : marquer une notification lue ne relit pas les préférences. */
export const PREFERENCES_KEY = ['notification-preferences'] as const;

export function useNotificationPreferences() {
  return useQuery({
    queryKey: PREFERENCES_KEY,
    queryFn: () => apiFetch<NotificationPreferences>('/api/notifications/preferences'),
    staleTime: 60_000,
  });
}

function applyPatch(current: NotificationPreferences, patch: NotificationPreferencesPatch): NotificationPreferences {
  return {
    categories: { ...current.categories, ...patch.categories },
    urgentSound: patch.urgentSound ?? current.urgentSound,
    urgentSoundSet: patch.urgentSound !== undefined ? true : current.urgentSoundSet,
  };
}

/**
 * Modification partielle, affichée aussitôt (mise à jour optimiste) ; en cas d'échec, l'ancienne valeur
 * revient. La réponse du serveur, complète, remplace ensuite la valeur affichée.
 */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: NotificationPreferencesPatch) =>
      apiFetch<NotificationPreferences>('/api/notifications/preferences', { method: 'PATCH', body: patch }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: PREFERENCES_KEY });
      const previous = queryClient.getQueryData<NotificationPreferences>(PREFERENCES_KEY);
      if (previous) queryClient.setQueryData(PREFERENCES_KEY, applyPatch(previous, patch));
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(PREFERENCES_KEY, context.previous);
    },
    onSuccess: (preferences) => queryClient.setQueryData(PREFERENCES_KEY, preferences),
  });
}
