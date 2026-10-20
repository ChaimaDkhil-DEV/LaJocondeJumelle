import {
  addDays,
  atLocalTime,
  endOfLocalDay,
  localDate,
  localTime,
  relativeDay,
} from '../../src/common/school-time';

const TZ = 'Europe/Paris';
const at = (iso: string) => new Date(iso);

describe('school-time (R4)', () => {
  describe('localDate et localTime', () => {
    it("donnent le jour et l'heure de l'école, pas ceux d'UTC", () => {
      expect(localDate(at('2026-10-20T21:59:00Z'), TZ)).toBe('2026-10-20');
      expect(localTime(at('2026-10-20T21:59:00Z'), TZ)).toBe('23:59');
      expect(localDate(at('2026-10-20T22:01:00Z'), TZ)).toBe('2026-10-21');
      expect(localTime(at('2026-10-20T22:01:00Z'), TZ)).toBe('00:01');
    });

    it('suivent un autre fuseau', () => {
      expect(localDate(at('2026-10-21T03:00:00Z'), 'America/Montreal')).toBe('2026-10-20');
    });
  });

  describe('addDays', () => {
    it('franchit les fins de mois et d’année', () => {
      expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    });
  });

  describe("relativeDay : aujourd'hui / demain", () => {
    it('à 23:59 locales, le lendemain est « demain »', () => {
      const now = at('2026-10-20T21:59:00Z');
      expect(relativeDay('2026-10-20', now, TZ)).toBe('TODAY');
      expect(relativeDay('2026-10-21', now, TZ)).toBe('TOMORROW');
      expect(relativeDay('2026-10-22', now, TZ)).toBeNull();
    });

    it('à 00:01 locales, le même jour devient « aujourd’hui » et la veille est refusée', () => {
      const now = at('2026-10-20T22:01:00Z');
      expect(relativeDay('2026-10-20', now, TZ)).toBeNull();
      expect(relativeDay('2026-10-21', now, TZ)).toBe('TODAY');
      expect(relativeDay('2026-10-22', now, TZ)).toBe('TOMORROW');
    });
  });

  describe('atLocalTime', () => {
    it('place une heure locale en hiver (UTC+1) et en été (UTC+2)', () => {
      expect(atLocalTime('2026-03-28', '07:00', TZ).toISOString()).toBe('2026-03-28T06:00:00.000Z');
      expect(atLocalTime('2026-03-29', '07:00', TZ).toISOString()).toBe('2026-03-29T05:00:00.000Z');
      expect(atLocalTime('2026-10-25', '07:00', TZ).toISOString()).toBe('2026-10-25T06:00:00.000Z');
    });

    it("décale vers l'avant une heure qui n'existe pas (passage à l'heure d'été)", () => {
      expect(atLocalTime('2026-03-29', '02:30', TZ).toISOString()).toBe('2026-03-29T01:30:00.000Z');
    });

    it("retient la première occurrence d'une heure ambiguë (passage à l'heure d'hiver)", () => {
      expect(atLocalTime('2026-10-25', '02:30', TZ).toISOString()).toBe('2026-10-25T00:30:00.000Z');
    });

    it('refuse une date ou une heure mal formée', () => {
      expect(() => atLocalTime('2026-13-01', '07:00', TZ)).toThrow();
      expect(() => atLocalTime('2026-10-20', '25:00', TZ)).toThrow();
    });
  });

  describe('endOfLocalDay', () => {
    it('renvoie minuit local du lendemain', () => {
      expect(endOfLocalDay(at('2026-10-20T08:00:00Z'), TZ).toISOString()).toBe(
        '2026-10-20T22:00:00.000Z',
      );
      expect(endOfLocalDay(at('2026-10-20T22:30:00Z'), TZ).toISOString()).toBe(
        '2026-10-21T22:00:00.000Z',
      );
    });

    it('tient compte des journées de 23 h et de 25 h', () => {
      expect(endOfLocalDay(at('2026-03-29T10:00:00Z'), TZ).toISOString()).toBe(
        '2026-03-29T22:00:00.000Z',
      );
      expect(endOfLocalDay(at('2026-10-25T10:00:00Z'), TZ).toISOString()).toBe(
        '2026-10-25T23:00:00.000Z',
      );
    });
  });
});
