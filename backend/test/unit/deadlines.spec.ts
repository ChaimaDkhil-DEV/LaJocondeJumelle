import { nextDeadlineState, NO_DEADLINE, type DeadlineDurations, type DeadlineState } from '../../src/requests/domain/deadlines';
import type { RequestAction, TransitionStep } from '../../src/requests/domain/request-state-machine';
import type { RequestStatus } from '@prisma/client';

/** T079 — délais (data-model.md §Délais) : démarrage, arrêt, seuil d'alerte, instantané des règles. */

const NOW = new Date('2026-10-12T10:00:00.000Z');
const MINUTE = 60_000;

const durations: DeadlineDurations = { validationMinutes: 60, takeoverMinutes: 10, completionMinutes: 100 };

function step(from: RequestStatus, to: RequestStatus, action: RequestAction): TransitionStep {
  return { from, to, action, actor: 'ASSIGNEE' };
}

const running = (stage: DeadlineState['currentStage'], overdue: DeadlineState['overdueStage'] = null): DeadlineState => ({
  currentStage: stage,
  currentDueAt: new Date(NOW.getTime() - 5 * MINUTE),
  warnAt: new Date(NOW.getTime() - 6 * MINUTE),
  overdueStage: overdue,
});

describe('nextDeadlineState', () => {
  it.each([
    ['T2 soumission (circuit B) → VALIDATION', [step('DRAFT', 'PENDING_ADMIN_VALIDATION', 'SUBMIT')], 'VALIDATION', 60],
    ['T1 envoi (circuit A) → TAKEOVER', [step('DRAFT', 'SENT', 'SUBMIT')], 'TAKEOVER', 10],
    ['T3 approbation → TAKEOVER', [step('PENDING_ADMIN_VALIDATION', 'SENT', 'APPROVE')], 'TAKEOVER', 10],
    ['T18 réaffectation → TAKEOVER', [step('IN_PROGRESS', 'SENT', 'REASSIGN')], 'TAKEOVER', 10],
    ['T6 acceptation → COMPLETION', [step('SENT', 'ACCEPTED', 'ACCEPT')], 'COMPLETION', 100],
    ['T17 reprise après correction → COMPLETION (nouveau délai)', [step('TO_CORRECT', 'IN_PROGRESS', 'RESUME')], 'COMPLETION', 100],
  ] as const)('%s', (_label, steps, stage, minutes) => {
    const state = nextDeadlineState(running('VALIDATION', 'VALIDATION'), [...steps], durations, NOW, 20);
    expect(state).toEqual({
      currentStage: stage,
      currentDueAt: new Date(NOW.getTime() + minutes * MINUTE),
      warnAt: new Date(NOW.getTime() + minutes * MINUTE - minutes * MINUTE * 0.2),
      overdueStage: null,
    });
  });

  it('T9 « Commencer » ne change pas le délai de réalisation en cours', () => {
    const previous = running('COMPLETION', 'COMPLETION');
    expect(nextDeadlineState(previous, [step('ACCEPTED', 'IN_PROGRESS', 'START')], durations, NOW, 20)).toEqual(previous);
  });

  it.each([
    ['T4 refus', step('PENDING_ADMIN_VALIDATION', 'REJECTED', 'REJECT')],
    ['T5 annulation en validation', step('PENDING_ADMIN_VALIDATION', 'CANCELLED', 'CANCEL')],
    ['T7 refus par l’employé', step('SENT', 'REJECTED', 'DECLINE')],
    ['T8 annulation', step('SENT', 'CANCELLED', 'CANCEL')],
    ['T10 terminée', step('IN_PROGRESS', 'DONE', 'COMPLETE')],
    ['T15 à corriger', step('DONE', 'TO_CORRECT', 'REQUEST_CORRECTION')],
    ['T14 validation finale', step('PENDING_FINAL_VALIDATION', 'CLOSED', 'VALIDATE_FINAL')],
  ])('%s arrête le suivi et efface le retard en cours', (_label, transition) => {
    expect(nextDeadlineState(running('TAKEOVER', 'TAKEOVER'), [transition], durations, NOW, 20)).toEqual(NO_DEADLINE);
  });

  it('une étape sans durée configurée n’est pas suivie', () => {
    const state = nextDeadlineState(NO_DEADLINE, [step('DRAFT', 'SENT', 'SUBMIT')], { ...durations, takeoverMinutes: null }, NOW, 20);
    expect(state).toEqual(NO_DEADLINE);
  });

  it('applique le seuil d’alerte configuré', () => {
    const state = nextDeadlineState(NO_DEADLINE, [step('SENT', 'ACCEPTED', 'ACCEPT')], durations, NOW, 50);
    expect(state.warnAt).toEqual(new Date(NOW.getTime() + 50 * MINUTE));
  });

  it('les transitions automatiques après « Terminée » n’ouvrent pas de nouveau délai', () => {
    const steps = [step('IN_PROGRESS', 'DONE', 'COMPLETE'), { ...step('DONE', 'PENDING_FINAL_VALIDATION', 'COMPLETE'), actor: 'SYSTEM' as const }];
    expect(nextDeadlineState(running('COMPLETION'), steps, durations, NOW, 20)).toEqual(NO_DEADLINE);
  });
});
