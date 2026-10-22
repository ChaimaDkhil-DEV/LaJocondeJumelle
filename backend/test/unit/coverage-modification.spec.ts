import { modifiableFields, presenceEndAt } from '../../src/coverage/domain/coverage-modification';
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

/**
 * Pendant la présence, seule l'heure de fin change : elle est placée à l'occurrence la plus proche
 * de la fin prévue. Avant correction, elle était placée à la date de la fin prévue : pour une garde
 * finissant après minuit, « 22:37 » devenait le lendemain soir (garde prolongée d'un jour, CI de
 * la PR #26 à 23 h 07). Heure de l'école : Europe/Paris, UTC+2 le 22/10/2026.
 */
describe('presenceEndAt', () => {
  const TZ = 'Europe/Paris';
  const at = (iso: string) => new Date(iso);

  describe('fin prévue après minuit (23/10 à 00:07)', () => {
    const plannedEnd = at('2026-10-22T22:07:00Z');

    it('une heure de la veille au soir reste la veille (et peut donc être passée)', () => {
      expect(presenceEndAt('22:37', plannedEnd, TZ)).toEqual(at('2026-10-22T20:37:00Z'));
      expect(presenceEndAt('23:59', plannedEnd, TZ)).toEqual(at('2026-10-22T21:59:00Z'));
    });

    it('une heure après minuit est le lendemain', () => {
      expect(presenceEndAt('00:30', plannedEnd, TZ)).toEqual(at('2026-10-22T22:30:00Z'));
    });
  });

  it('fin prévue juste après minuit : une heure de la veille au soir n’est pas le soir suivant', () => {
    // Fin prévue le 23/10 à 01:10 ; « 23:40 » est le 22/10 au soir, pas le 23/10.
    expect(presenceEndAt('23:40', at('2026-10-22T23:10:00Z'), TZ)).toEqual(at('2026-10-22T21:40:00Z'));
  });

  it('en journée : même jour, avant ou après la fin prévue', () => {
    const plannedEnd = at('2026-10-22T08:00:00Z'); // 10:00 à Paris
    expect(presenceEndAt('11:30', plannedEnd, TZ)).toEqual(at('2026-10-22T09:30:00Z'));
    expect(presenceEndAt('09:00', plannedEnd, TZ)).toEqual(at('2026-10-22T07:00:00Z'));
  });
});
