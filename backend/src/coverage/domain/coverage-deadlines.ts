import type { DeadlineState } from '../../requests/domain/deadlines';
import { NO_DEADLINE } from '../../requests/domain/deadlines';
import type { CoverageStep } from './coverage-state-machine';

/**
 * Délais d'une couverture, configurables par catégorie et priorité (DeadlineRule) :
 *
 * | Étape    | Démarre à                                   | S'arrête à                         |
 * |----------|---------------------------------------------|------------------------------------|
 * | TAKEOVER | diffusion, rediffusion après désistement    | prise en charge, annulation        |
 * | ARRIVAL  | acceptation / affectation (max(maintenant, début) + délai) | présence confirmée, désistement, annulation |
 *
 * Le dépassement (« Non pourvue », « En retard ») est marqué une seule fois par occurrence d'étape
 * grâce à `overdueStage` (marqueur persisté), voir coverage-deadlines.job.ts.
 */
export interface CoverageDurations {
  takeoverMinutes: number | null;
  arrivalMinutes: number | null;
}

const MINUTE_MS = 60_000;

function stage(
  stageName: 'TAKEOVER' | 'ARRIVAL',
  minutes: number | null,
  from: Date,
  warnPercent: number,
): DeadlineState {
  if (minutes === null || minutes <= 0) return NO_DEADLINE;
  const durationMs = minutes * MINUTE_MS;
  const dueAt = new Date(from.getTime() + durationMs);
  return {
    currentStage: stageName,
    currentDueAt: dueAt,
    warnAt: new Date(dueAt.getTime() - (durationMs * warnPercent) / 100),
    overdueStage: null,
  };
}

/** Diffusion initiale (création, demande de relève) : le délai de prise en charge démarre. */
export function broadcastDeadline(durations: CoverageDurations, now: Date, warnPercent: number): DeadlineState {
  return stage('TAKEOVER', durations.takeoverMinutes, now, warnPercent);
}

export function nextCoverageDeadline(
  previous: DeadlineState,
  steps: readonly CoverageStep[],
  durations: CoverageDurations,
  startAt: Date,
  now: Date,
  warnPercent: number,
): DeadlineState {
  const last = steps.at(-1);
  if (!last) return previous;
  // Statut inchangé (prolongation, élargissement, preuve supplémentaire) : le délai en cours continue.
  if (last.from === last.to) return previous;
  switch (last.to) {
    case 'BROADCAST':
      return stage('TAKEOVER', durations.takeoverMinutes, now, warnPercent);
    case 'ACCEPTED': {
      // Garde planifiée plus tard : le délai d'arrivée court à partir de l'heure de début.
      const from = startAt.getTime() > now.getTime() ? startAt : now;
      return stage('ARRIVAL', durations.arrivalMinutes, from, warnPercent);
    }
    case 'EN_ROUTE':
    case 'LATE':
    case 'UNFILLED':
      // En route : le délai d'arrivée continue. Non pourvue / En retard : le marqueur de retard reste.
      return previous;
    default:
      return NO_DEADLINE;
  }
}
