import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';

/** Abonnement push inutilisé au-delà de ce délai : supprimé (spec 014, D8, FR-011). */
export const PUSH_SUBSCRIPTION_MAX_IDLE_MS = 90 * 24 * 3_600_000;
const CLEANUP_INTERVAL_MS = 3_600_000;

/**
 * Nettoyage des abonnements push (spec 014, data-model.md) : un appareil qui n'a pas ouvert l'application
 * depuis 90 jours (lastUsedAt, NC-3) n'est plus servi ; son abonnement est supprimé. Toutes les heures.
 */
@Injectable()
export class PushSubscriptionsCleanupJob {
  private readonly logger = new Logger(PushSubscriptionsCleanupJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Interval(CLEANUP_INTERVAL_MS)
  async tick(): Promise<void> {
    if (!this.config.jobsEnabled || this.running) return;
    this.running = true;
    try {
      const removed = await this.runOnce();
      if (removed > 0) this.logger.log(`${removed} abonnement(s) push inutilisé(s) depuis 90 jours supprimé(s)`);
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    } finally {
      this.running = false;
    }
  }

  /** Un passage complet ; renvoie le nombre d'abonnements supprimés. */
  async runOnce(now = new Date()): Promise<number> {
    const { count } = await this.prisma.pushSubscription.deleteMany({
      where: { lastUsedAt: { lt: new Date(now.getTime() - PUSH_SUBSCRIPTION_MAX_IDLE_MS) } },
    });
    return count;
  }
}
