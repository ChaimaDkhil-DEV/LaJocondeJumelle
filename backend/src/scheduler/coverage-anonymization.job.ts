import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { CoverageAnonymizationService } from '../coverage/coverage-anonymization.service';

const HOUR_MS = 60 * 60 * 1000;

/** Anonymisation des affectations anciennes (FR-023a), toutes les heures ; idempotente. */
@Injectable()
export class CoverageAnonymizationJob {
  private readonly logger = new Logger(CoverageAnonymizationJob.name);
  private running = false;

  constructor(
    private readonly anonymization: CoverageAnonymizationService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Interval(HOUR_MS)
  async tick(): Promise<void> {
    if (!this.config.jobsEnabled || this.running) return;
    this.running = true;
    try {
      const count = await this.runOnce();
      if (count > 0) this.logger.log(`${count} affectation(s) anonymisée(s).`);
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    } finally {
      this.running = false;
    }
  }

  runOnce(now = new Date()): Promise<number> {
    return this.anonymization.runOnce(now);
  }
}
