import type { DeadlineStage } from '@prisma/client';
import type { TransitionStep } from './request-state-machine';

/**
 * Délais d'une demande — specs/001-demandes-travail-vocales/data-model.md §Délais.
 * Module pur : à chaque transition, l'étape suivie démarre, continue ou s'arrête.
 *
 * | Étape      | Démarre à                         | S'arrête à                  |
 * |------------|-----------------------------------|-----------------------------|
 * | VALIDATION | T2 (soumission en circuit B)      | T3, T4, T5                  |
 * | TAKEOVER   | T1, T3, T18 (affectation)         | T6, T7, T8, T18             |
 * | COMPLETION | T6 (acceptation), T17 (reprise)   | T10, T18                    |
 */

/** Durées copiées dans la demande à sa création (FR-022) ; null = étape non suivie. */
export interface DeadlineDurations {
  validationMinutes: number | null;
  takeoverMinutes: number | null;
  completionMinutes: number | null;
}

export interface DeadlineState {
  currentStage: DeadlineStage | null;
  currentDueAt: Date | null;
  warnAt: Date | null;
  /** Étape actuellement en retard ; remise à null à la fin de l'étape (le retard reste dans l'historique). */
  overdueStage: DeadlineStage | null;
}

export const NO_DEADLINE: DeadlineState = { currentStage: null, currentDueAt: null, warnAt: null, overdueStage: null };

const MINUTE_MS = 60_000;

function minutesFor(stage: DeadlineStage, durations: DeadlineDurations): number | null {
  switch (stage) {
    case 'VALIDATION':
      return durations.validationMinutes;
    case 'TAKEOVER':
      return durations.takeoverMinutes;
    case 'COMPLETION':
      return durations.completionMinutes;
    case 'ARRIVAL':
      // Étape propre aux couvertures de classe (coverage/domain), jamais démarrée ici.
      return null;
  }
}

/** Étape démarrée par la dernière étape appliquée, `keep` si le délai en cours continue, null sinon. */
function stageAfter(step: TransitionStep): DeadlineStage | 'keep' | null {
  switch (step.to) {
    case 'PENDING_ADMIN_VALIDATION':
      return 'VALIDATION';
    case 'SENT':
      return 'TAKEOVER';
    case 'ACCEPTED':
      return 'COMPLETION';
    case 'IN_PROGRESS':
      // « Commencer » ne change pas le délai de réalisation ; la reprise après correction en ouvre un nouveau.
      return step.action === 'RESUME' ? 'COMPLETION' : 'keep';
    default:
      return null;
  }
}

export function nextDeadlineState(
  previous: DeadlineState,
  steps: readonly TransitionStep[],
  durations: DeadlineDurations,
  now: Date,
  warnPercent: number,
): DeadlineState {
  const last = steps.at(-1);
  if (!last) return previous;
  const stage = stageAfter(last);
  if (stage === 'keep') return previous;
  if (stage === null) return NO_DEADLINE;

  const minutes = minutesFor(stage, durations);
  if (minutes === null || minutes <= 0) return NO_DEADLINE;

  const durationMs = minutes * MINUTE_MS;
  const dueAt = new Date(now.getTime() + durationMs);
  return {
    currentStage: stage,
    currentDueAt: dueAt,
    warnAt: new Date(dueAt.getTime() - (durationMs * warnPercent) / 100),
    overdueStage: null,
  };
}
