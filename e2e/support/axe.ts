import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Échoue si axe détecte une violation WCAG 2.0/2.1/2.2 de niveau A ou AA sur la page. */
export async function expectNoA11yViolations(page: Page): Promise<void> {
  // Couleurs finales uniquement : une transition en cours (ex. bouton qui devient actif) fausserait
  // la mesure du contraste.
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}) : ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(summary, 'Violations d’accessibilité').toEqual([]);
}
