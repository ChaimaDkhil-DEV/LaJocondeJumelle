import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatStart } from '../../src/features/coverage/labels';

/**
 * Début d'une affectation dans les listes (constat du déroulé manuel T085) : la date est indiquée
 * quand ce n'est pas aujourd'hui, et « Maintenant » est réservé à un début imminent ou tout juste
 * passé (plus pour une affectation commencée depuis longtemps ou terminée).
 */
describe('formatStart', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, 10, 0)); // mardi 20 octobre, 10 h (heure du poste)
  });
  afterEach(() => vi.useRealTimers());

  const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

  it('début imminent ou tout juste passé : « Maintenant »', () => {
    expect(formatStart(at(20, 10, 0))).toBe('Maintenant');
    expect(formatStart(new Date(Date.now() + 30_000).toISOString())).toBe('Maintenant');
    expect(formatStart(new Date(Date.now() - 30_000).toISOString())).toBe('Maintenant');
  });

  it('aujourd’hui, plus tard ou plus tôt : l’heure', () => {
    expect(formatStart(at(20, 14, 30))).toBe('À 14:30');
    expect(formatStart(at(20, 8, 15))).toBe('À 08:15');
  });

  it('un autre jour : le jour et l’heure', () => {
    expect(formatStart(at(21, 8, 0))).toBe('mer. 21 oct. à 08:00');
    expect(formatStart(at(13, 9, 45))).toBe('mar. 13 oct. à 09:45');
  });
});
