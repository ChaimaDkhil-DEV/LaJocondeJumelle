import { describe, expect, it } from 'vitest';
import { sessionPalette } from '../../src/design/tokens';
import { weekendLabel } from '../../src/features/timetable/labels';
import { formatHours, hourRange, minutesOf, nextSession, paletteIndex, subjectBreakdown, tintKey, weekStats } from '../../src/features/timetable/weekLayout';
import type { TimetableSession } from '../../src/features/timetable/types';

/** Luminance relative WCAG 2.1 d'une couleur #RRGGBB. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

const make = (over: Partial<TimetableSession>): TimetableSession => ({
  id: 's',
  seriesId: null,
  detached: false,
  teacher: { id: 't1', displayName: 'Amel' },
  class: { id: 'k1', name: 'Violet', room: null },
  level: null,
  date: '2026-11-23',
  weekday: 1,
  startAt: '',
  endAt: '',
  startTime: '08:00',
  endTime: '09:00',
  subject: null,
  room: null,
  status: 'SCHEDULED',
  ...over,
});

describe('Grille de la semaine — calculs', () => {
  it('minutesOf : « HH:MM » en minutes depuis minuit', () => {
    expect(minutesOf('00:00')).toBe(0);
    expect(minutesOf('08:30')).toBe(510);
  });

  it('hourRange : 8 h – 17 h au minimum, élargi aux séances hors de cette plage', () => {
    expect(hourRange([])).toEqual({ start: 8, end: 17 });
    expect(hourRange([make({ startTime: '09:00', endTime: '10:00' })])).toEqual({ start: 8, end: 17 });
    expect(hourRange([make({ startTime: '07:15', endTime: '08:00' }), make({ startTime: '17:30', endTime: '18:10' })])).toEqual({ start: 7, end: 19 });
  });

  it('formatHours : « 7 h », « 7 h 30 », « 0 h »', () => {
    expect(formatHours(420)).toBe('7 h');
    expect(formatHours(450)).toBe('7 h 30');
    expect(formatHours(0)).toBe('0 h');
  });

  it('weekStats : séances, classes distinctes et heures hors annulées ; annulées à part', () => {
    const stats = weekStats([
      make({ id: 'a' }),
      make({ id: 'b', startTime: '10:00', endTime: '11:30' }),
      make({ id: 'c', class: { id: 'k2', name: 'Lotus', room: null } }),
      make({ id: 'd', status: 'CANCELLED', class: { id: 'k3', name: 'Dahlia', room: null } }),
    ]);
    expect(stats).toEqual({ sessions: 3, classes: 2, minutes: 60 + 90 + 60, cancelled: 1, subjects: 0 });
  });

  it('paletteIndex : stable pour une même classe, toujours dans la palette', () => {
    expect(paletteIndex('k1')).toBe(paletteIndex('k1'));
    for (const id of ['k1', 'k2', 'une-classe-avec-un-long-identifiant', '']) {
      expect(paletteIndex(id)).toBeGreaterThanOrEqual(0);
      expect(paletteIndex(id)).toBeLessThan(sessionPalette.light.length);
    }
  });
});

describe('Emploi du temps de l’enseignant — calculs', () => {
  it('weekStats : compte les matières distinctes des séances tenues (sans matière ni séance annulée)', () => {
    const stats = weekStats([
      make({ id: 'a', subject: 'Mathématiques' }),
      make({ id: 'b', subject: 'Mathématiques', startTime: '10:00', endTime: '11:00' }),
      make({ id: 'c', subject: 'Français', startTime: '11:00', endTime: '12:00' }),
      make({ id: 'd', subject: null, startTime: '13:00', endTime: '14:00' }),
      make({ id: 'e', subject: 'Sciences', status: 'CANCELLED', startTime: '14:00', endTime: '15:00' }),
    ]);
    expect(stats.subjects).toBe(2);
  });

  it('subjectBreakdown : heures par matière, la plus longue d’abord, séances annulées exclues, matière absente à part', () => {
    expect(
      subjectBreakdown([
        make({ id: 'a', subject: 'Français', startTime: '08:00', endTime: '09:45' }),
        make({ id: 'b', subject: 'Mathématiques', startTime: '10:00', endTime: '11:00' }),
        make({ id: 'c', subject: 'Mathématiques', startTime: '11:00', endTime: '12:00' }),
        make({ id: 'd', subject: null, startTime: '13:00', endTime: '13:30' }),
        make({ id: 'e', subject: 'Mathématiques', status: 'CANCELLED', startTime: '14:00', endTime: '16:00' }),
      ]),
    ).toEqual([
      { subject: 'Mathématiques', minutes: 120 },
      { subject: 'Français', minutes: 105 },
      { subject: null, minutes: 30 },
    ]);
    expect(subjectBreakdown([])).toEqual([]);
  });

  describe('nextSession', () => {
    const at = (id: string, start: string, end: string, over: Partial<TimetableSession> = {}) =>
      make({ id, startAt: `2026-11-23T${start}:00.000Z`, endAt: `2026-11-23T${end}:00.000Z`, ...over });
    const sessions = [at('b', '10:00', '12:00'), at('a', '07:00', '09:00'), at('c', '13:00', '14:00', { status: 'CANCELLED' })];

    it('la séance en cours d’abord, signalée comme telle', () => {
      const next = nextSession(sessions, new Date('2026-11-23T08:00:00.000Z'));
      expect(next?.session.id).toBe('a');
      expect(next?.inProgress).toBe(true);
    });

    it('sinon la prochaine, quel que soit l’ordre reçu', () => {
      const next = nextSession(sessions, new Date('2026-11-23T09:30:00.000Z'));
      expect(next?.session.id).toBe('b');
      expect(next?.inProgress).toBe(false);
    });

    it('une séance qui se termine à l’instant n’est plus en cours', () => {
      expect(nextSession(sessions, new Date('2026-11-23T09:00:00.000Z'))?.session.id).toBe('b');
    });

    it('rien après la dernière séance tenue : les séances annulées ne comptent pas', () => {
      expect(nextSession(sessions, new Date('2026-11-23T12:00:00.000Z'))).toBeNull();
      expect(nextSession([], new Date())).toBeNull();
    });
  });

  it('hourRange ajusté : de la première heure de séance à la dernière, au moins deux heures ; 8 h – 17 h sans séance', () => {
    expect(hourRange([make({ startTime: '08:00', endTime: '12:00' })], true)).toEqual({ start: 8, end: 12 });
    expect(hourRange([make({ startTime: '09:30', endTime: '10:15' }), make({ startTime: '13:00', endTime: '14:40' })], true)).toEqual({ start: 9, end: 15 });
    expect(hourRange([make({ startTime: '10:00', endTime: '10:30' })], true)).toEqual({ start: 10, end: 12 });
    expect(hourRange([], true)).toEqual({ start: 8, end: 17 });
    // Sans ajustement, la plage minimale reste 8 h – 17 h.
    expect(hourRange([make({ startTime: '08:00', endTime: '12:00' })])).toEqual({ start: 8, end: 17 });
  });

  it('tintKey : la matière donne la teinte, deux séances de la même matière ont la même', () => {
    expect(tintKey(make({ subject: 'Mathématiques' }))).toBe(tintKey(make({ subject: 'Mathématiques', class: { id: 'k2', name: 'Lotus', room: null } })));
    expect(tintKey(make({ subject: 'Mathématiques' }))).not.toBe(tintKey(make({ subject: 'Français' })));
    expect(typeof tintKey(make({ subject: null }))).toBe('string');
  });

  it('weekendLabel : « Samedi 28 et dimanche 29 novembre », avec les deux mois quand ils diffèrent', () => {
    expect(weekendLabel('2026-11-28', '2026-11-29')).toBe('Samedi 28 et dimanche 29 novembre');
    expect(weekendLabel('2026-10-31', '2026-11-01')).toBe('Samedi 31 octobre et dimanche 1 novembre');
  });
});

describe('Palette des séances — contraste', () => {
  const pairs = (['light', 'dark'] as const).flatMap((mode) =>
    sessionPalette[mode].map((tint, index) => [`${mode} ${index}`, tint.text, tint.bg] as const),
  );
  it.each(pairs)('%s : texte sur fond au moins 4,5:1', (_label, text, bg) => {
    expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it('les deux modes ont la même taille', () => {
    expect(sessionPalette.dark).toHaveLength(sessionPalette.light.length);
  });
});
