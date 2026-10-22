import { modifiableFields } from '../../src/coverage/domain/coverage-modification';
import { COVERAGE_STATUSES, FINAL_COVERAGE_STATUSES } from '../../src/coverage/domain/coverage-state-machine';

/** Spec 006 (FR-002, FR-005, Clarification Q1) : champs modifiables par l'admin selon le statut. */
describe('modifiableFields', () => {
  it('avant présence : classe, date, début et fin', () => {
    for (const status of ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'LATE'] as const) {
      expect(modifiableFields(status)).toEqual(['classId', 'date', 'startTime', 'endTime']);
    }
  });

  it('pendant la présence : heure de fin seulement', () => {
    for (const status of ['ON_DUTY', 'RELIEF_PENDING'] as const) {
      expect(modifiableFields(status)).toEqual(['endTime']);
    }
  });

  it('statuts définitifs : rien', () => {
    for (const status of FINAL_COVERAGE_STATUSES) {
      expect(modifiableFields(status)).toEqual([]);
    }
  });

  it('couvre tous les statuts', () => {
    for (const status of COVERAGE_STATUSES) expect(Array.isArray(modifiableFields(status))).toBe(true);
  });
});
