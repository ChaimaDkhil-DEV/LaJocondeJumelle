import type { NotificationType, Priority, RequestKind, RequestStatus } from '@prisma/client';
import { isReadOnlyStatus } from '../requests/domain/access-policy';
import { ALL_STATUSES } from '../requests/domain/request-state-machine';

/**
 * Notifications du super administrateur sur les demandes de travail (règle appliquée côté serveur,
 * à la création de chaque notification). Au titre de la supervision, il ne reçoit que :
 * - les trois alertes (urgente, sans employé affecté, en retard), une fois par demande et par type ;
 * - les nouveaux messages d'une demande urgente ou en retard.
 * Toujours sur une demande active. Inchangé : les gardes (kind = COVERAGE) et les demandes dont il est
 * lui-même le demandeur ou l'employé affecté (il y reçoit les notifications habituelles).
 */

export type SuperAdminAlertType = Extract<NotificationType, 'URGENT' | 'UNASSIGNED' | 'OVERDUE'>;

/** Demandes de travail encore à traiter : ni brouillon, ni terminées, refusées ou annulées. */
export const ACTIVE_WORK_STATUSES: readonly RequestStatus[] = ALL_STATUSES.filter((s) => s !== 'DRAFT' && !isReadOnlyStatus(s));

/** Notifications de supervision rendues caduques quand la demande se termine. */
export const SUPERVISION_TYPES: readonly NotificationType[] = ['URGENT', 'UNASSIGNED', 'OVERDUE', 'MESSAGE_NEW'];

export interface SupervisedRequest {
  kind: RequestKind;
  status: RequestStatus;
  priority: Priority;
  requesterId: string;
  assigneeId: string | null;
  currentDueAt: Date | null;
  overdueStage: string | null;
}

export function isActiveWorkRequest(request: Pick<SupervisedRequest, 'kind' | 'status'>): boolean {
  return request.kind === 'WORK' && ACTIVE_WORK_STATUSES.includes(request.status);
}

/** En retard : étape marquée par le job, ou échéance déjà passée (avant le prochain passage du job). */
export function isLate(request: Pick<SupervisedRequest, 'currentDueAt' | 'overdueStage'>, now: Date): boolean {
  return request.overdueStage !== null || (request.currentDueAt !== null && request.currentDueAt.getTime() <= now.getTime());
}

export function superAdminMayReceive(
  userId: string,
  type: NotificationType,
  request: SupervisedRequest,
  options: { alert: boolean; now: Date },
): boolean {
  if (request.kind !== 'WORK') return true;
  if (userId === request.requesterId || userId === request.assigneeId) return true;
  if (!isActiveWorkRequest(request)) return false;
  if (options.alert) return true;
  if (type === 'MESSAGE_NEW') return request.priority === 'URGENT' || isLate(request, options.now);
  return false;
}
