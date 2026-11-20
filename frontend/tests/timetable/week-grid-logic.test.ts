import { describe, expect, it } from 'vitest';
import { sessionPalette } from '../../src/design/tokens';
import { formatHours, hourRange, minutesOf, paletteIndex, weekStats } from '../../src/features/timetable/weekLayout';
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
    expect(stats).toEqual({ sessions: 3, classes: 2, minutes: 60 + 90 + 60, cancelled: 1 });
  });

  it('paletteIndex : stable pour une même classe, toujours dans la palette', () => {
    expect(paletteIndex('k1')).toBe(paletteIndex('k1'));
    for (const id of ['k1', 'k2', 'une-classe-avec-un-long-identifiant', '']) {
      expect(paletteIndex(id)).toBeGreaterThanOrEqual(0);
      expect(paletteIndex(id)).toBeLessThan(sessionPalette.light.length);
    }
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
