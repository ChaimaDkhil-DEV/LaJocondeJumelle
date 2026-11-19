import { describe, expect, it } from 'vitest';
import { homeActions } from '../../src/design/tokens';

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

/**
 * Boutons de l'accueil enseignant (aedb56a) : le titre et l'indication (petit texte) doivent atteindre 4,5:1 sur
 * le fond, au repos et au survol (WCAG 1.4.3, niveau AA). Les tests de bout en bout (axe) relevaient 3,95:1 pour
 * l'indication du bouton « urgent » et 4,22:1 pour celle du bouton « normal ».
 */
describe('Contraste des boutons de l’accueil enseignant', () => {
  const pairs = (['scan', 'urgent', 'normal'] as const).flatMap((name) => {
    const tone = homeActions[name];
    return [tone.main, tone.hover].flatMap((background) => [
      [`${name} : titre sur ${background}`, tone.text, background],
      [`${name} : indication sur ${background}`, tone.hint, background],
    ]);
  });

  it.each(pairs)('%s : au moins 4,5:1', (_label, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});
