import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { OutboxDispatcher } from './outbox-dispatcher.service';

const OUTBOX_INTERVAL_MS = 15_000;

/**
 * Envoi périodique des événements outbox à n8n (015). Au redémarrage, les événements restés en attente
 * (panne de n8n ou de l'API) sont repris au premier passage ; un passage à la fois.
 */
@Injectable()
export class OutboxJob {
  private readonly logger = new Logger(OutboxJob.name);
  private running = false;

  constructor(
    private readonly dispatcher: OutboxDispatcher,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Interval(OUTBOX_INTERVAL_MS)
  async tick(): Promise<void> {
    if (!this.config.jobsEnabled || !this.config.n8n || this.running) return;
    this.running = true;
    try {
      await this.dispatcher.runOnce();
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    } finally {
      this.running = false;
    }
  }
}
