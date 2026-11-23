import { describe, expect, it } from 'vitest';
import { colors } from '../../src/design/tokens';

/** Luminance relative WCAG 2.1 d'une couleur #RRGGBB. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

type Accent = { main: string; soft: string };
const accentsOf = (mode: 'light' | 'dark') => colors[mode].accents as Record<string, Accent>;

/**
 * Rouge (demandes urgentes) et jaune (demandes normales) des tuiles : « main » (icône, liseré) doit atteindre 4,5:1 sur
 * « soft » (fond de la tuile), en clair comme en sombre, comme le promet la description des accents dans design/tokens.ts.
 */
describe.each(['red', 'yellow'])('Accent %s des tuiles', (name) => {
  it.each(['light', 'dark'] as const)('%s : existe, et « main » sur « soft » atteint 4,5:1', (mode) => {
    const accent = accentsOf(mode)[name];
    expect(accent).toBeDefined();
    expect(contrast(accent.main, accent.soft)).toBeGreaterThanOrEqual(4.5);
  });
});

/** Le rouge doit attirer l'œil avant le jaune, avec des tuiles de même style : fond plus soutenu, liseré plus sombre. */
describe('Le rouge attire plus que le jaune', () => {
  it('en clair : fond de tuile et liseré plus sombres que ceux du jaune', () => {
    const { red, yellow } = accentsOf('light');
    expect(luminance(red.soft)).toBeLessThan(luminance(yellow.soft));
    expect(luminance(red.main)).toBeLessThan(luminance(yellow.main));
  });
});
