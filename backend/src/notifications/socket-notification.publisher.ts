import { Injectable } from '@nestjs/common';
import type { Notification } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { NotificationPublisher } from './notifications.service';

/** Diffuse `notification:new` dans la salle du destinataire, après validation de la transaction. */
@Injectable()
export class SocketNotificationPublisher implements NotificationPublisher {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async publish(notifications: Notification[]): Promise<void> {
    const requests = await this.prisma.request.findMany({
      where: { id: { in: [...new Set(notifications.map((n) => n.requestId))] } },
      select: { id: true, reference: true, title: true, kind: true },
    });
    const byId = new Map(requests.map((r) => [r.id, r]));
    for (const n of notifications) {
      const request = byId.get(n.requestId);
      this.realtime.emitToUsers([n.userId], 'notification:new', {
        id: n.id,
        type: n.type,
        priority: n.priority,
        requestId: n.requestId,
        reference: request?.reference ?? '',
        title: request?.title ?? '',
        // Demande de travail ou couverture de classe : le client choisit la page à ouvrir.
        kind: request?.kind ?? 'WORK',
        createdAt: n.createdAt,
      });
    }
  }
}
