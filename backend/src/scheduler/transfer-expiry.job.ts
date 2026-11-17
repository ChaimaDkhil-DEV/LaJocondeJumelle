import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { TransfersService } from '../transfers/transfers.service';
import { JOB_INTERVAL_MS } from './job-interval';

/**
 * Propositions de transfert entre administrateurs (018, FR-018, research R8) : celles dont le délai de
 * réponse est atteint passent « expirée », celles qui ne peuvent plus aboutir (participant désactivé,
 * demande terminée) sont annulées avec leur cause. Aucun transfert n'a jamais lieu ici. L'état est lu en
 * base à chaque passage : les échéances manquées pendant un arrêt sont rattrapées au redémarrage.
 */
@Injectable()
export class TransferExpiryJob {
  private readonly logger = new Logger(TransferExpiryJob.name);
  private running = false;

  constructor(
    private readonly transfers: TransfersService,
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

  /** Un passage complet ; renvoie le nombre de propositions expirées et annulées. */
  runOnce(now = new Date()): Promise<{ expired: number; cancelled: number }> {
    return this.transfers.expireDue(now);
  }
}
