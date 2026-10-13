import type { Priority } from '@prisma/client';

export interface DeadlineDurations {
  validationMinutes: number | null;
  takeoverMinutes: number | null;
  completionMinutes: number | null;
  /** Couverture de classe uniquement : arrivée en classe après acceptation. */
  arrivalMinutes?: number | null;
}

export const PRIORITY_ORDER: readonly Priority[] = ['NORMAL', 'MEDIUM', 'HIGH', 'URGENT'];

/** Délais par défaut provisoires (minutes) de toute nouvelle catégorie — data-model.md §Valeurs par défaut. */
export const DEFAULT_DEADLINES: Record<Priority, DeadlineDurations> = {
  NORMAL: { validationMinutes: 1440, takeoverMinutes: 1440, completionMinutes: 4320 },
  MEDIUM: { validationMinutes: 480, takeoverMinutes: 480, completionMinutes: 2880 },
  HIGH: { validationMinutes: 120, takeoverMinutes: 120, completionMinutes: 1440 },
  URGENT: { validationMinutes: 30, takeoverMinutes: 15, completionMinutes: 120 },
};

/** Couverture de classe (à valider avec l'école) : prise en charge 2 min, arrivée en classe 5 min. */
export const DEFAULT_COVERAGE_DEADLINES: DeadlineDurations = {
  validationMinutes: null,
  takeoverMinutes: 2,
  completionMinutes: null,
  arrivalMinutes: 5,
};
