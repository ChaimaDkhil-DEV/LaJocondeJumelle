import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { RequestTransitionsService } from '../requests/request-transitions.service';
import { JOB_INTERVAL_MS } from './job-interval';

/**
 * Clôture automatique (T13, research R13) : les demandes « Terminée » dont le délai de grâce
 * est expiré passent « Clôturée » avec l'acteur SYSTEM. L'état est lu en base à chaque passage :
 * les échéances manquées pendant un arrêt sont rattrapées au redémarrage.
 */
@Injectable()
export class AutoCloseJob {
  private readonly logger = new Logger(AutoCloseJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: RequestTransitionsService,
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

  /** Un passage complet ; renvoie le nombre de demandes clôturées. */
  async runOnce(now = new Date()): Promise<number> {
    const due = await this.prisma.request.findMany({
      where: { kind: 'WORK', status: 'DONE', autoCloseAt: { lte: now } },
      select: { id: true },
      orderBy: { autoCloseAt: 'asc' },
      take: 200,
    });
    let closed = 0;
    for (const { id } of due) {
      if (await this.transitions.performSystem(id, 'CLOSE')) closed += 1;
    }
    return closed;
  }
}
