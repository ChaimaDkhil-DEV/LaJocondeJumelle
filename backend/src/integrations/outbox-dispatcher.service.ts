import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { MAX_OUTBOX_ATTEMPTS, retryDelayMs, signBody } from './domain/n8n-protocol';

/** Événements traités par passage. */
const BATCH = 20;
/** Réservation d'un événement pendant son envoi : un passage concurrent ne le reprend pas. */
const LEASE_MS = 5 * 60_000;

export interface DispatchStats {
  sent: number;
  retried: number;
  failed: number;
}

/**
 * Transmission fiable des événements outbox à n8n (015, FR-009). L'événement est écrit dans la
 * transaction métier ; ici, il est réservé, envoyé (corps signé, délai d'attente), puis marqué SENT,
 * replanifié avec un délai croissant ou, après le nombre maximal de tentatives, FAILED. Sans n8n
 * configuré, rien n'est envoyé : les événements attendent, et l'application fonctionne normalement.
 * Le corps ne contient que des identifiants : n8n demande ensuite le strict nécessaire au backend.
 */
@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger(OutboxDispatcher.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async runOnce(now = new Date()): Promise<DispatchStats> {
    const stats: DispatchStats = { sent: 0, retried: 0, failed: 0 };
    const n8n = this.config.n8n;
    if (!n8n) return stats;

    const events = await this.prisma.outboxEvent.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: now } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: BATCH,
    });
    for (const event of events) {
      const attempts = event.attempts + 1;
      // Réservation : seul le passage qui incrémente la tentative envoie l'événement.
      const claimed = await this.prisma.outboxEvent.updateMany({
        where: { id: event.id, status: 'PENDING', attempts: event.attempts },
        data: { attempts, nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
      });
      if (claimed.count !== 1) continue;

      const body = JSON.stringify({
        eventId: event.id,
        type: event.type,
        communicationId: event.aggregateId,
        occurredAt: event.createdAt.toISOString(),
      });
      const timestamp = String(Date.now());
      try {
        const response = await fetch(n8n.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-LJJ-Event-Id': event.id,
            'X-LJJ-Timestamp': timestamp,
            'X-LJJ-Signature': signBody(n8n.secret, timestamp, body),
          },
          body,
          signal: AbortSignal.timeout(n8n.timeoutMs),
        });
        if (!response.ok) throw new Error(`n8n a répondu ${response.status}`);
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: 'SENT', sentAt: new Date(), lastError: null },
        });
        stats.sent += 1;
      } catch (error) {
        const lastError = (error instanceof Error ? error.message : String(error)).slice(0, 500);
        const failed = attempts >= MAX_OUTBOX_ATTEMPTS;
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: failed
            ? { status: 'FAILED', lastError }
            : { lastError, nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)) },
        });
        // Journal : type, identifiant, tentative et erreur réseau ; jamais le secret ni de donnée personnelle.
        this.logger.warn(
          `Événement ${event.type} ${event.id} : tentative ${attempts} en échec (${lastError})${failed ? ', abandonné' : ''}`,
        );
        if (failed) stats.failed += 1;
        else stats.retried += 1;
      }
    }
    return stats;
  }
}
