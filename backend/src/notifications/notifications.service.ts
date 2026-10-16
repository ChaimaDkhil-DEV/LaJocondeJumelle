import { Inject, Injectable } from '@nestjs/common';
import type { Notification, NotificationType, Prisma, Priority } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

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

  /** Écrit les notifications dans la transaction en cours ; à publier ensuite avec flushAfterCommit. */
  async notifyInTx(
    tx: Prisma.TransactionClient,
    candidates: ReadonlyArray<string | null | undefined>,
    actorId: string | null,
    input: NotificationInput,
  ): Promise<Notification[]> {
    const created: Notification[] = [];
    for (const userId of notificationRecipients(candidates, actorId)) {
      created.push(await tx.notification.create({ data: { userId, ...input } }));
    }
    return created;
  }

  /** À appeler uniquement après validation de la transaction : rien n'est émis pour une écriture annulée. */
  async flushAfterCommit(notifications: Notification[]): Promise<void> {
    if (notifications.length === 0) return;
    await this.publisher.publish(notifications);
  }
}
