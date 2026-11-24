import { expect, type Page } from '@playwright/test';

/**
 * Affiche la navigation principale : toujours visible sur grand écran, repliée derrière « Ouvrir le menu » sur petit
 * écran. `isVisible()` répond tout de suite : on attend d'abord que l'un des deux soit affiché, sinon une page encore
 * en chargement passerait pour un grand écran et le menu ne serait jamais ouvert.
 */
export async function openNavigation(page: Page): Promise<void> {
  const menu = page.getByRole('button', { name: 'Ouvrir le menu' });
  const navigation = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(menu.or(navigation).first()).toBeVisible();
  if (await menu.isVisible()) await menu.click();
  await expect(navigation).toBeVisible();
}
