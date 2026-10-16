import { Injectable } from '@nestjs/common';
import { Prisma, type Notification, type Priority, type Request } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { ACTIVE_WORK_STATUSES, isActiveWorkRequest, isLate, SUPERVISION_TYPES, type SuperAdminAlertType } from './super-admin-policy';

/** Marqueur de chaque alerte : posé une seule fois par demande (mise à jour conditionnelle). */
const MARKERS: Record<SuperAdminAlertType, Prisma.Sql> = {
  URGENT: Prisma.raw('"superAdminUrgentNotifiedAt"'),
  UNASSIGNED: Prisma.raw('"superAdminUnassignedNotifiedAt"'),
  OVERDUE: Prisma.raw('"superAdminOverdueNotifiedAt"'),
};

const ACTIVE = Prisma.sql`ARRAY[${Prisma.join([...ACTIVE_WORK_STATUSES])}]::"RequestStatus"[]`;

/**
 * Alertes du super administrateur sur les demandes de travail (voir super-admin-policy) :
 * urgente, sans employé affecté (délai bientôt dépassé), en retard. Une seule notification par
 * demande et par type, même avec plusieurs instances du job ; rien sur une demande terminée.
 */
@Injectable()
export class SuperAdminAlertsService {
  constructor(private readonly notifications: NotificationsService) {}

  async superAdminIds(tx: Prisma.TransactionClient): Promise<string[]> {
    const rows = await tx.user.findMany({ where: { role: 'SUPER_ADMIN', active: true }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  /**
   * Pose le marqueur puis notifie tous les super administrateurs actifs (sauf l'auteur de l'action).
   * Ne fait rien si l'alerte a déjà été envoyée ou si la demande n'est plus active.
   */
  async alertInTx(tx: Prisma.TransactionClient, requestId: string, type: SuperAdminAlertType, actorId: string | null): Promise<Notification[]> {
    const marker = MARKERS[type];
    const rows = await tx.$queryRaw<Array<{ priority: Priority }>>`
      UPDATE "Request" SET ${marker} = now()
      WHERE "id" = ${requestId}::uuid AND ${marker} IS NULL AND "kind" = 'WORK' AND "status" = ANY(${ACTIVE})
      RETURNING "priority"`;
    if (rows.length === 0) return [];
    return this.notifications.notifyInTx(tx, await this.superAdminIds(tx), actorId, { type, requestId, priority: rows[0].priority }, { superAdminAlert: true });
  }

  /** Super administrateurs à prévenir d'un nouveau message : demande active, urgente ou en retard. */
  async messageSupervisors(tx: Prisma.TransactionClient, request: Request): Promise<string[]> {
    if (!isActiveWorkRequest(request)) return [];
    if (request.priority !== 'URGENT' && !isLate(request, new Date())) return [];
    return this.superAdminIds(tx);
  }

  /**
   * Demande terminée, refusée ou annulée : les notifications de supervision encore non lues des
   * super administrateurs (hors demandeur et employé affecté) sont marquées comme lues.
   */
  async clearOnFinishInTx(tx: Prisma.TransactionClient, request: Pick<Request, 'id' | 'requesterId' | 'assigneeId'>): Promise<number> {
    const personal = [request.requesterId, request.assigneeId].filter((id): id is string => id !== null);
    const { count } = await tx.notification.updateMany({
      where: {
        requestId: request.id,
        readAt: null,
        type: { in: [...SUPERVISION_TYPES] },
        user: { role: 'SUPER_ADMIN' },
        userId: { notIn: personal },
      },
      data: { readAt: new Date() },
    });
    return count;
  }
}
