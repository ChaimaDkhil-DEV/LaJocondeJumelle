import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Clic « au doigt » : l'élément est centré à l'écran, puis cliqué à ses coordonnées réelles. Sur
 * mobile, « Nouvelle demande » a un bouton d'envoi fixé en bas et un `scroll-padding-bottom` (le
 * focus clavier n'est jamais masqué) ; le défilement automatique de Playwright en tient mal compte
 * et vise un point décalé d'une hauteur de barre. Sans défilement automatique, le clic tombe juste.
 */
export async function clickInView(locator: Locator): Promise<void> {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  // Comme locator.click : attendre que rien ne recouvre la cible (fond d'un menu qui se ferme…).
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        const r = element.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return Boolean(hit && (element === hit || element.contains(hit)));
      }),
    )
    .toBe(true);
  const box = await locator.boundingBox();
  if (!box) throw new Error('Élément sans boîte : impossible de cliquer.');
  await locator.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** Description repliée par défaut (« + Ajouter une description (facultatif) ») : déplie puis remplit. */
export async function fillDescription(page: Page, text: string): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Ajouter une description (facultatif)' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await clickInView(toggle);
  await page.getByLabel('Description (facultative)').fill(text);
}
