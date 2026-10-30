import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * Photo de profil : chacun change la sienne depuis « Mon profil » (recadrage, enregistrement),
 * la photo apparaît partout (en-tête compris), un fichier refusé l'est avec un message clair, et
 * l'avatar par défaut se rétablit. Compte « reprographie » : la photo est retirée en fin de test.
 */
const images = join(__dirname, '..', 'backend', 'test', 'fixtures', 'images');

test('changer, refuser puis rétablir sa photo de profil', async ({ page }) => {
  await login(page, 'reprographie');
  await page.goto('/profil');
  await expect(page.getByRole('heading', { name: 'Mon profil' })).toBeVisible();
  const avatar = page.getByRole('main').getByRole('img', { name: 'Photo de Reprographie' });
  // Avatar par défaut : initiales, aucune image.
  await expect(avatar).toHaveText('RE');

  // Fichier refusé avant envoi.
  await page.getByRole('button', { name: 'Changer la photo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Changer la photo' });
  await dialog.getByLabel('Photo de profil').setInputFiles({ name: 'animation.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await expect(dialog.getByRole('alert')).toHaveText('Formats acceptés : JPG, PNG ou WebP.');

  // Photo valide : recadrage, zoom au clavier, enregistrement.
  await dialog.getByLabel('Photo de profil').setInputFiles(join(images, 'large.png'));
  const crop = dialog.getByRole('group', { name: /^Recadrage de la photo/ });
  await expect(crop).toBeVisible();
  await expectNoA11yViolations(page);
  await crop.focus();
  await page.keyboard.press('+');
  await page.keyboard.press('ArrowLeft');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Photo mise à jour.')).toBeVisible();
  await expect(dialog).toBeHidden();

  // La photo remplace les initiales, ici et dans l'en-tête (ou le menu sur mobile).
  await expect(avatar).toHaveJSProperty('tagName', 'IMG');
  await expect(avatar).toHaveAttribute('src', /^\/api\/users\/[0-9a-f-]{36}\/avatar\?v=[0-9a-f]{16}$/);
  const src = (await avatar.getAttribute('src'))!;
  const image = await page.request.get(src);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toBe('image/webp');
  await expect(page.locator(`img[src="${src}"]`).first()).toBeAttached();

  // Retour à l'avatar par défaut.
  await page.getByRole('button', { name: 'Changer la photo' }).click();
  await dialog.getByRole('button', { name: 'Rétablir l’avatar par défaut' }).click();
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Avatar par défaut rétabli.')).toBeVisible();
  await expect(avatar).toHaveText('RE');
  expect((await page.request.get(src)).status()).toBe(404);
});
