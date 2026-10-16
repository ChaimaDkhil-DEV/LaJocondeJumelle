import { Inject, Injectable } from '@nestjs/common';
import type { Notification, NotificationType, Prisma, Priority } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { superAdminMayReceive } from './super-admin-policy';

/**
 * Diffusion des notifications après validation de la transaction.
 */
export interface NotificationPublisher {
  publish(notifications: Notification[]): void | Promise<void>;
}

export const NOTIFICATION_PUBLISHER = Symbol('NOTIFICATION_PUBLISHER');

export interface NotificationInput {
  type: NotificationType;
  requestId: string;
  priority: Priority;
}

/** Destinataires uniques, sans valeur vide ni auteur de l'action (il n'est jamais notifié de sa propre action). */
export function notificationRecipients(
  candidates: ReadonlyArray<string | null | undefined>,
  actorId: string | null,
): string[] {
  const unique = new Set<string>();
  for (const id of candidates) {
    if (id && id !== actorId) unique.add(id);
  }
  return [...unique];
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_PUBLISHER) private readonly publisher: NotificationPublisher,
  ) {}

  /**
   * Écrit les notifications dans la transaction en cours ; à publier ensuite avec flushAfterCommit.
   * Les super administrateurs sont filtrés ici (super-admin-policy) : l'option superAdminAlert est
   * réservée aux trois alertes posées par SuperAdminAlertsService.
   */
  async notifyInTx(
    tx: Prisma.TransactionClient,
    candidates: ReadonlyArray<string | null | undefined>,
    actorId: string | null,
    input: NotificationInput,
    options: { superAdminAlert?: boolean } = {},
  ): Promise<Notification[]> {
    const recipients = await this.withoutFilteredSuperAdmins(tx, notificationRecipients(candidates, actorId), input, options);
    const created: Notification[] = [];
    for (const userId of recipients) {
      created.push(await tx.notification.create({ data: { userId, ...input } }));
    }
    return created;
  }

  private async withoutFilteredSuperAdmins(
    tx: Prisma.TransactionClient,
    recipients: string[],
    input: NotificationInput,
    options: { superAdminAlert?: boolean },
  ): Promise<string[]> {
    if (recipients.length === 0) return recipients;
    const superAdmins = await tx.user.findMany({ where: { id: { in: recipients }, role: 'SUPER_ADMIN' }, select: { id: true } });
    if (superAdmins.length === 0) return recipients;
    const request = await tx.request.findUnique({
      where: { id: input.requestId },
      select: { kind: true, status: true, priority: true, requesterId: true, assigneeId: true, currentDueAt: true, overdueStage: true },
    });
    const now = new Date();
    const blocked = new Set(
      superAdmins
        .map((u) => u.id)
        .filter((id) => !request || !superAdminMayReceive(id, input.type, request, { alert: options.superAdminAlert === true, now })),
    );
    return recipients.filter((id) => !blocked.has(id));
  }

  /** À appeler uniquement après validation de la transaction : rien n'est émis pour une écriture annulée. */
  async flushAfterCommit(notifications: Notification[]): Promise<void> {
    if (notifications.length === 0) return;
    await this.publisher.publish(notifications);
  }
}
