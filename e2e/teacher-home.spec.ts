import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';
import { manualQrField } from './support/qr-scanner';

/**
 * 016 — Accueil de l'enseignant : scanner le QR code (action principale), demande urgente ou normale
 * (formulaire vocal, priorité préremplie), « Suivi de mes demandes » (trois boutons-liens avec compteur).
 * Sans violation axe, sans défilement horizontal (320 px compris).
 */

async function noHorizontalScroll(page: import('@playwright/test').Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test('accueil de l’enseignante : actions rapides et suivi, accessibles', async ({ page }) => {
  await login(page, 'enseignante');
  await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();
  const tracking = page.getByRole('region', { name: 'Suivi de mes demandes' });
  // Compteurs chargés : chaque nom se termine par le nombre de demandes.
  for (const title of ['En attente', 'Validées / traitées', 'Archives']) {
    await expect(tracking.getByRole('link', { name: new RegExp(`^${title.replace('/', '\\/')} \\d+ demandes?$`) })).toBeVisible();
  }
  await expectNoA11yViolations(page);
  await noHorizontalScroll(page);

  // Scanner : le lecteur de QR code existant s'ouvre aussitôt.
  await page.getByRole('button', { name: 'Scanner un QR code' }).click();
  const dialog = page.getByRole('dialog', { name: 'Scanner le QR code de la classe' });
  await expect(await manualQrField(dialog)).toBeVisible();
  await dialog.getByRole('button', { name: 'Fermer' }).click();
  await expect(dialog).toBeHidden();

  // Demande urgente : formulaire vocal, priorité « Urgente » cochée et rappelée en tête.
  await page.getByRole('link', { name: 'Demande urgente' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Demande urgente' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Urgente' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Enregistrer un message vocal' })).toBeVisible();
  await expectNoA11yViolations(page);
  await noHorizontalScroll(page);
  await page.getByRole('link', { name: 'Retour à l’accueil' }).click();

  // Suivi : liste filtrée des demandes en attente.
  await tracking.getByRole('link', { name: /^En attente/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'En attente' })).toBeVisible();
  await expect(page.getByText(/^\d+\+? demandes?$/).or(page.getByText('Aucune demande en attente pour le moment.'))).toBeVisible();
  await expectNoA11yViolations(page);
  await noHorizontalScroll(page);
});
