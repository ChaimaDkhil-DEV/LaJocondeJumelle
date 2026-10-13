import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { DeadlineStage, Priority } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { JOB_INTERVAL_MS } from './auto-close.job';

interface OverdueRow {
  id: string;
  currentStage: DeadlineStage;
  status: string;
  version: number;
  priority: Priority;
  requesterId: string;
  assigneeId: string | null;
  categoryId: string;
}

/**
 * Détection des retards (research R4, FR-026) : marque « En retard » l'étape dont l'échéance est
 * dépassée, une seule fois par occurrence d'étape (mise à jour conditionnelle idempotente), trace
 * l'événement OVERDUE et notifie les responsables de la catégorie et l'employé affecté. La demande
 * n'est jamais supprimée ni masquée. L'état étant lu en base, les échéances manquées pendant un
 * arrêt sont rattrapées au redémarrage. La version n'est pas incrémentée : marquer un retard
 * n'entre pas en conflit avec les actions des utilisateurs. Les couvertures de classe ont leur
 * propre tâche (coverage/coverage-deadlines.job.ts).
 */
@Injectable()
export class OverdueJob {
  private readonly logger = new Logger(OverdueJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Interval(JOB_INTERVAL_MS)
  async tick(): Promise<void> {
    if (!this.config.jobsEnabled || this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    } finally {
      this.running = false;
    }
  }

  /** Un passage complet ; renvoie le nombre de retards signalés. */
  async runOnce(): Promise<number> {
    const rows = await this.prisma.$queryRaw<OverdueRow[]>`
      UPDATE "Request"
      SET "overdueStage" = "currentStage", "updatedAt" = now()
      WHERE "kind" = 'WORK'
        AND "currentStage" IS NOT NULL
        AND "currentDueAt" < now()
        AND "overdueStage" IS DISTINCT FROM "currentStage"
      RETURNING "id", "currentStage", "status", "version", "priority", "requesterId", "assigneeId", "categoryId"`;

    for (const row of rows) {
      const managers = (await this.prisma.categoryManager.findMany({ where: { categoryId: row.categoryId } })).map(
        (m) => m.userId,
      );
      const pending = await this.prisma.$transaction(async (tx) => {
        await tx.requestEvent.create({
          data: { requestId: row.id, actorId: null, type: 'OVERDUE', toValue: { stage: row.currentStage } },
        });
        return this.notifications.notifyInTx(tx, [...managers, row.assigneeId], null, {
          type: 'OVERDUE',
          requestId: row.id,
          priority: row.priority,
        });
      });
      await this.notifications.flushAfterCommit(pending);
      this.realtime.emitToUsers([row.requesterId, row.assigneeId, ...managers], 'request:updated', {
        requestId: row.id,
        status: row.status,
        version: row.version,
        overdueStage: row.currentStage,
      });
    }
    return rows.length;
  }
}
