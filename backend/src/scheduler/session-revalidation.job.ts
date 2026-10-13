import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { RealtimeService } from '../realtime/realtime.service';

/** Toutes les minutes : ferme les connexions temps réel dont la session a expiré ou été révoquée. */
@Injectable()
export class SessionRevalidationJob {
  private readonly logger = new Logger(SessionRevalidationJob.name);

  constructor(
    private readonly realtime: RealtimeService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Interval(60_000)
  async tick(): Promise<void> {
    if (!this.config.jobsEnabled) return;
    try {
      await this.realtime.revalidateSessions();
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    }
  }
}
