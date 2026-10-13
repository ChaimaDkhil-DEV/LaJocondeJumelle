import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AppException } from '../common/errors';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { JOB_INTERVAL_MS } from '../scheduler/auto-close.job';
import { CoverageActionsService } from './coverage-actions.service';

/**
 * Dépassements de délai des couvertures : « Non pourvue » (prise en charge) et « En retard »
 * (arrivée en classe). Idempotente et sans doublon, même avec plusieurs instances :
 * - un verrou consultatif transactionnel global : une seule exécution traite les échéances à la fois ;
 * - chaque alerte s'appuie sur le marqueur persisté `overdueStage`, posé par une mise à jour
 *   conditionnelle (statut + version + overdueStage nul) : une seule alerte par occurrence d'étape.
 * Les demandes ne sont jamais supprimées ; les échéances manquées pendant un arrêt sont rattrapées.
 */
@Injectable()
export class CoverageDeadlinesJob {
  private readonly logger = new Logger(CoverageDeadlinesJob.name);
  private running = false;

  constructor(
    private readonly actions: CoverageActionsService,
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

  /** Un passage complet ; renvoie le nombre de dépassements signalés (0 si une autre exécution est en cours). */
  async runOnce(now = new Date()): Promise<number> {
    return this.actions.run(async (tx, effects) => {
      const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtext('coverage-deadlines-job')) AS locked`;
      if (!locked) return 0;

      const due = await tx.request.findMany({
        where: {
          kind: 'COVERAGE',
          status: { in: ['BROADCAST', 'ACCEPTED', 'EN_ROUTE'] },
          currentStage: { not: null },
          currentDueAt: { lt: now },
          overdueStage: null,
        },
        select: { id: true },
        orderBy: { currentDueAt: 'asc' },
        take: 200,
      });
      let signalled = 0;
      for (const { id } of due) {
        try {
          if (await this.actions.performSystemInTx(tx, id, 'EXPIRE', effects)) signalled += 1;
        } catch (error) {
          // Action d'un utilisateur au même instant (prise, désistement) : l'échéance n'est plus d'actualité.
          if (!(error instanceof AppException && error.code === 'STATE_CHANGED')) throw error;
        }
      }
      return signalled;
    });
  }
}
