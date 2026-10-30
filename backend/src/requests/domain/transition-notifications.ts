import type { NotificationType, Priority, Request, RequestStatus } from '@prisma/client';
import type { TransitionResult } from './request-state-machine';

/**
 * Destinataires des notifications d'une transition — contracts/realtime-events.md §Qui est notifié.
 * Module pur : le service les crée (auteur de l'action exclu, filtre du super administrateur) ;
 * le jeu de démonstration applique les mêmes règles.
 */
export interface NotificationTarget {
  users: Array<string | null>;
  type: NotificationType;
}

export function transitionNotifications(
  result: Pick<Extract<TransitionResult, { ok: true }>, 'steps' | 'to'>,
  before: Pick<Request, 'assigneeId'>,
  after: { requesterId: string; assigneeId: string | null; priority: Priority; status?: RequestStatus },
  managers: readonly string[],
): NotificationTarget[] {
  const urgent = after.priority === 'URGENT';

  switch (result.steps[0].action) {
    case 'SUBMIT':
      return result.to === 'SENT'
        ? [{ users: [after.assigneeId], type: urgent ? 'URGENT' : 'REQUEST_NEW' }]
        : [{ users: [...managers], type: urgent ? 'URGENT' : 'REQUEST_NEW' }];
    case 'APPROVE':
    case 'REASSIGN':
      return [
        { users: [after.requesterId], type: 'STATUS_CHANGED' },
        { users: [after.assigneeId], type: urgent ? 'URGENT' : 'ASSIGNED' },
      ];
    case 'REJECT':
    case 'DECLINE':
      return [{ users: [after.requesterId], type: 'REJECTED' }];
    case 'CANCEL':
      return [{ users: before.assigneeId ? [before.assigneeId] : [...managers], type: 'CANCELLED' }];
    case 'REQUEST_CORRECTION':
      return [{ users: [after.assigneeId], type: 'TO_CORRECT' }];
    case 'CLOSE':
    case 'VALIDATE_FINAL':
      return [{ users: [after.requesterId, after.assigneeId], type: 'CLOSED' }];
    case 'COMPLETE':
      if (result.to === 'CLOSED') return [{ users: [after.requesterId, after.assigneeId], type: 'CLOSED' }];
      return [
        { users: [after.requesterId], type: 'STATUS_CHANGED' },
        ...(result.to === 'PENDING_FINAL_VALIDATION' ? [{ users: [...managers], type: 'STATUS_CHANGED' as const }] : []),
      ];
    default:
      return [{ users: [after.requesterId], type: 'STATUS_CHANGED' }];
  }
}
