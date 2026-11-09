import { isWithinPushWindow } from '../../src/push/domain/push-window';

/**
 * 014, T051 (D6, FR-010, NC-7, research R4) : plage d'envoi commune, dans le fuseau de l'école ; début
 * inclus, fin exclue ; aucun envoi hors des jours choisis.
 */

const TUNIS = 'Africa/Tunis'; // UTC+1, sans heure d'été
const WEEK = { days: ['MON', 'TUE', 'WED', 'THU', 'FRI'], start: '07:30', end: '18:30' };

/** 2026-11-09 est un lundi ; heure de Tunis = UTC + 1. */
const tunis = (date: string, time: string) => new Date(`${date}T${time}:00+01:00`);

describe('isWithinPushWindow', () => {
  it.each([
    ['07:29', false],
    ['07:30', true],
    ['12:00', true],
    ['18:29', true],
    ['18:30', false],
    ['23:00', false],
  ])('lundi %s → %s', (time, expected) => {
    expect(isWithinPushWindow(tunis('2026-11-09', time), WEEK, TUNIS)).toBe(expected);
  });

  it('samedi et dimanche : hors plage', () => {
    expect(isWithinPushWindow(tunis('2026-11-14', '10:00'), WEEK, TUNIS)).toBe(false);
    expect(isWithinPushWindow(tunis('2026-11-15', '10:00'), WEEK, TUNIS)).toBe(false);
  });

  it('dimanche compris s’il est choisi', () => {
    expect(isWithinPushWindow(tunis('2026-11-15', '10:00'), { ...WEEK, days: ['SUN'] }, TUNIS)).toBe(true);
    expect(isWithinPushWindow(tunis('2026-11-09', '10:00'), { ...WEEK, days: ['SUN'] }, TUNIS)).toBe(false);
  });

  it('évalue l’heure dans le fuseau de l’école : 06:30 UTC = 07:30 à Tunis', () => {
    const instant = new Date('2026-11-09T06:30:00Z');
    expect(isWithinPushWindow(instant, WEEK, TUNIS)).toBe(true);
    expect(isWithinPushWindow(instant, WEEK, 'UTC')).toBe(false);
  });

  it('le jour aussi suit le fuseau : dimanche 23:30 UTC = lundi 00:30 à Tunis', () => {
    const instant = new Date('2026-11-08T23:30:00Z');
    const allDay = { days: ['MON'], start: '00:00', end: '23:59' };
    expect(isWithinPushWindow(instant, allDay, TUNIS)).toBe(true);
    expect(isWithinPushWindow(instant, allDay, 'UTC')).toBe(false);
  });
});
