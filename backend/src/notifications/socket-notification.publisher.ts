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
    const requestIds = [...new Set(notifications.flatMap((n) => (n.requestId ? [n.requestId] : [])))];
    const communicationIds = [...new Set(notifications.flatMap((n) => (n.communicationId ? [n.communicationId] : [])))];
    const requests = requestIds.length
      ? await this.prisma.request.findMany({ where: { id: { in: requestIds } }, select: { id: true, reference: true, title: true, kind: true } })
      : [];
    // Communication aux parents (015) : seul le nom de l'élève sert de titre, jamais la remarque.
    const communications = communicationIds.length
      ? await this.prisma.parentCommunication.findMany({
          where: { id: { in: communicationIds } },
          select: { id: true, student: { select: { firstName: true, lastName: true } } },
        })
      : [];
    const requestById = new Map(requests.map((r) => [r.id, r]));
    const communicationById = new Map(communications.map((c) => [c.id, c]));
    for (const n of notifications) {
      if (n.communicationId) {
        const communication = communicationById.get(n.communicationId);
        this.realtime.emitToUsers([n.userId], 'notification:new', {
          id: n.id,
          type: n.type,
          priority: n.priority,
          requestId: null,
          communicationId: n.communicationId,
          reference: '',
          title: communication ? `${communication.student.firstName} ${communication.student.lastName}` : '',
          kind: 'COMMUNICATION',
          createdAt: n.createdAt,
        });
        continue;
      }
      const request = n.requestId ? requestById.get(n.requestId) : undefined;
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
