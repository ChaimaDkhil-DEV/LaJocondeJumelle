import { isoWeekday, periodError, seriesDates, sessionRange, slotError } from '../../src/timetable/domain/series';

/** T012 — Séries hebdomadaires (020, research R2, R10) : dates produites, heures locales, validations. */

const TZ = 'Europe/Paris';

describe('isoWeekday', () => {
  it('donne le jour ISO (1 lundi … 7 dimanche)', () => {
    expect(isoWeekday('2026-11-16')).toBe(1);
    expect(isoWeekday('2026-11-18')).toBe(3);
    expect(isoWeekday('2026-11-22')).toBe(7);
  });
});

describe('seriesDates', () => {
  it('donne chaque date du jour demandé dans la période, bornes comprises', () => {
    expect(seriesDates({ weekday: 1, startDate: '2026-11-16', endDate: '2026-12-07' }, '2026-11-01')).toEqual([
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
      '2026-12-07',
    ]);
  });

  it('commence au premier jour correspondant après le début de la période', () => {
    expect(seriesDates({ weekday: 5, startDate: '2026-11-16', endDate: '2026-11-30' }, '2026-11-01')).toEqual(['2026-11-20', '2026-11-27']);
  });

  it('ne produit aucune date passée (R10) : aujourd’hui compris, hier non', () => {
    expect(seriesDates({ weekday: 3, startDate: '2026-11-04', endDate: '2026-11-25' }, '2026-11-18')).toEqual(['2026-11-18', '2026-11-25']);
    expect(seriesDates({ weekday: 3, startDate: '2026-11-04', endDate: '2026-11-11' }, '2026-11-18')).toEqual([]);
  });

  it('respecte une date de départ « à partir de » (changement de série)', () => {
    expect(seriesDates({ weekday: 1, startDate: '2026-11-16', endDate: '2026-12-07' }, '2026-11-01', '2026-11-24')).toEqual([
      '2026-11-30',
      '2026-12-07',
    ]);
  });
});

describe('periodError', () => {
  it('accepte une période d’un jour et une période d’un an', () => {
    expect(periodError('2026-09-01', '2026-09-01')).toBeNull();
    expect(periodError('2026-09-01', '2027-09-02')).toBeNull();
  });

  it('refuse une fin avant le début, et une période de plus de 366 jours', () => {
    expect(periodError('2026-09-02', '2026-09-01')).toMatch(/après/);
    expect(periodError('2026-09-01', '2027-09-03')).toMatch(/un an/);
  });
});

describe('slotError', () => {
  it('accepte de 5 minutes à 12 heures', () => {
    expect(slotError('08:00', '08:05')).toBeNull();
    expect(slotError('07:00', '19:00')).toBeNull();
  });

  it('refuse une fin avant ou égale au début, une séance trop courte ou trop longue', () => {
    expect(slotError('09:00', '09:00')).toMatch(/après/);
    expect(slotError('09:00', '08:00')).toMatch(/après/);
    expect(slotError('08:00', '08:04')).toMatch(/5 minutes/);
    expect(slotError('07:00', '19:01')).toMatch(/12 heures/);
  });

  it('refuse une heure mal écrite', () => {
    expect(slotError('8:00', '09:00')).toMatch(/HH:MM/);
    expect(slotError('08:00', '24:00')).toMatch(/HH:MM/);
  });
});

describe('sessionRange', () => {
  it('convertit les heures locales en instants dans le fuseau de l’école', () => {
    expect(sessionRange('2026-11-18', '08:00', '09:00', TZ)).toEqual({
      startAt: new Date('2026-11-18T07:00:00.000Z'),
      endAt: new Date('2026-11-18T08:00:00.000Z'),
    });
    expect(sessionRange('2026-06-15', '08:00', '09:00', TZ)).toEqual({
      startAt: new Date('2026-06-15T06:00:00.000Z'),
      endAt: new Date('2026-06-15T07:00:00.000Z'),
    });
  });

  it('garde l’heure murale les jours de changement d’heure', () => {
    // Dimanche 29 mars 2026 (passage à l'heure d'été) et dimanche 25 octobre 2026 (retour à l'heure d'hiver).
    expect(sessionRange('2026-03-29', '08:00', '09:00', TZ).startAt).toEqual(new Date('2026-03-29T06:00:00.000Z'));
    expect(sessionRange('2026-10-25', '08:00', '09:00', TZ).startAt).toEqual(new Date('2026-10-25T07:00:00.000Z'));
  });
});
