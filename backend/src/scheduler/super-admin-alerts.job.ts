import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { NotificationsService } from '../notifications/notifications.service';
import { SuperAdminAlertsService } from '../notifications/super-admin-alerts.service';
import { ACTIVE_WORK_STATUSES, type SuperAdminAlertType } from '../notifications/super-admin-policy';
import { JOB_INTERVAL_MS } from './job-interval';

const ACTIVE = Prisma.sql`ARRAY[${Prisma.join([...ACTIVE_WORK_STATUSES])}]::"RequestStatus"[]`;

/**
 * Alertes planifiées du super administrateur (demandes de travail actives), indépendantes de
 * l'ouverture de l'application :
 * - sans employé affecté : le seuil « bientôt en retard » (warnAt) du délai en cours est atteint ;
 * - en retard : l'échéance de l'étape en cours est dépassée.
 * Une seule notification par demande et par type (marqueur posé par SuperAdminAlertsService) ; les
 * échéances manquées pendant un arrêt sont rattrapées au redémarrage.
 */
@Injectable()
export class SuperAdminAlertsJob {
  private readonly logger = new Logger(SuperAdminAlertsJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly alerts: SuperAdminAlertsService,
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

  /** Un passage complet ; renvoie le nombre d'alertes posées. */
  async runOnce(): Promise<number> {
    const [unassigned, overdue] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Request"
        WHERE "kind" = 'WORK' AND "status" = ANY(${ACTIVE}) AND "assigneeId" IS NULL
          AND "warnAt" <= now() AND "superAdminUnassignedNotifiedAt" IS NULL`,
      this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Request"
        WHERE "kind" = 'WORK' AND "status" = ANY(${ACTIVE}) AND "currentStage" IS NOT NULL
          AND "currentDueAt" < now() AND "superAdminOverdueNotifiedAt" IS NULL`,
    ]);
    let posted = 0;
    const jobs: Array<[string, SuperAdminAlertType]> = [
      ...unassigned.map((r): [string, SuperAdminAlertType] => [r.id, 'UNASSIGNED']),
      ...overdue.map((r): [string, SuperAdminAlertType] => [r.id, 'OVERDUE']),
    ];
    for (const [id, type] of jobs) {
      const pending = await this.prisma.$transaction((tx) => this.alerts.alertInTx(tx, id, type, null));
      await this.notifications.flushAfterCommit(pending);
      // Le marqueur est posé même sans destinataire (aucun super administrateur actif).
      posted += 1;
    }
    return posted;
  }
}
