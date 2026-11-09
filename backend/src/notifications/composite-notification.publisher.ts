import { Injectable, Logger } from '@nestjs/common';
import type { Notification } from '@prisma/client';
import { PushDispatcher } from '../push/push-dispatcher.service';
import type { NotificationPublisher } from './notifications.service';
import { SocketNotificationPublisher } from './socket-notification.publisher';

/**
 * Diffuseur des notifications après validation de la transaction (014, research R2) : Socket.IO,
 * attendu comme avant, puis le push, confié sans être attendu. Le push ne fait jamais échouer
 * l'action métier (FR-005) ; une erreur de Socket.IO remonte comme avant, sans empêcher le push.
 */
@Injectable()
export class CompositeNotificationPublisher implements NotificationPublisher {
  private readonly logger = new Logger(CompositeNotificationPublisher.name);

  constructor(
    private readonly socket: SocketNotificationPublisher,
    private readonly push: PushDispatcher,
  ) {}

  async publish(notifications: Notification[]): Promise<void> {
    if (notifications.length === 0) return;
    try {
      await this.socket.publish(notifications);
    } finally {
      this.enqueuePush(notifications);
    }
  }

  private enqueuePush(notifications: Notification[]): void {
    try {
      const pending: unknown = this.push.enqueue(notifications);
      if (pending instanceof Promise) pending.catch((error: unknown) => this.logFailure(error));
    } catch (error) {
      this.logFailure(error);
    }
  }

  /** Nom de l'erreur seulement : jamais de contenu ni d'adresse d'envoi dans les journaux (FR-012). */
  private logFailure(error: unknown): void {
    this.logger.error(`Remise au push impossible (${error instanceof Error ? error.name : 'erreur inconnue'})`);
  }
}
