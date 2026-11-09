import { expect, type Locator } from '@playwright/test';

/**
 * Champ « Lien ou code du QR code » du lecteur intégré. Il est replié derrière « Saisir le lien ou le code du
 * QR code » quand la caméra s'ouvre (caméra simulée de Chromium et Firefox), et affiché d'emblée quand elle ne
 * peut pas s'ouvrir (WebKit, sans caméra simulée). On attend que l'état de la caméra soit connu : tant
 * qu'elle s'ouvre, ni le bouton ni le champ ne sont affichés.
 */
export async function manualQrField(dialog: Locator): Promise<Locator> {
  const field = dialog.getByRole('textbox', { name: 'Lien ou code du QR code' });
  const toggle = dialog.getByRole('button', { name: 'Saisir le lien ou le code du QR code' });
  await expect(field.or(toggle)).toBeVisible();
  if (await toggle.isVisible()) await toggle.click();
  await expect(field).toBeVisible();
  return field;
}
