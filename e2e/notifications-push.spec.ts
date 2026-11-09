import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * Spec 014, T069 (US6, NFR-004, NFR-005, FR-009, FR-010) : serveur e2e sans clés, donc push désactivé.
 * « Mon profil » l'indique et les préférences restent utilisables et enregistrées ; le super administrateur
 * règle la plage d'envoi ; accessibilité (axe) et 320 px en portrait et en paysage, sans défilement horizontal.
 * Les scénarios qui modifient des réglages ne tournent que sur Chromium (comptes partagés entre profils).
 */

const ONLY_CHROMIUM = 'Réglages partagés : scénario exécuté sur Chromium seulement';
const ONLY_320 = 'Scénario dédié au profil 320 px';

async function expectNoHorizontalScroll(page: Page, screen: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `défilement horizontal sur « ${screen} »`).toBeLessThanOrEqual(0);
}

test('« Mon profil » : push désactivé, catégories et son des urgences enregistrés sur le compte', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', ONLY_CHROMIUM);
  await login(page, 'surveillant');
  await page.goto('/profil');
  await expect(page.getByRole('heading', { name: 'Notifications', level: 2 })).toBeVisible();
  await expect(page.getByText('Les notifications push ne sont pas activées par l’établissement.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Activer les notifications sur cet appareil' })).toHaveCount(0);

  const coverage = page.getByLabel('Couverture');
  const sound = page.getByLabel('Signal sonore pour les urgences');
  await expect(coverage).toBeChecked();
  await expect(sound).toBeChecked();

  await coverage.click();
  await expect(page.getByText('Préférence enregistrée.')).toBeVisible();
  await sound.click();
  await expect(sound).not.toBeChecked();

  await page.reload();
  await expect(page.getByLabel('Couverture')).not.toBeChecked();
  await expect(page.getByLabel('Signal sonore pour les urgences')).not.toBeChecked();
  await expectNoA11yViolations(page);

  // Remise en état pour les autres scénarios.
  await page.getByLabel('Couverture').click();
  await expect(page.getByLabel('Couverture')).toBeChecked();
  await page.getByLabel('Signal sonore pour les urgences').click();
  await expect(page.getByLabel('Signal sonore pour les urgences')).toBeChecked();
});

test('« Réglages » : plage d’envoi, contrôle de la fin, accessibilité', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', ONLY_CHROMIUM);
  await login(page, 'superadmin');
  await page.goto('/admin/reglages');
  await expect(page.getByRole('heading', { name: 'Plage d’envoi des notifications push' })).toBeVisible();
  await expect(page.getByText('Notifications push : désactivées (clés non configurées)')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Jours d’envoi des notifications push' }).getByRole('checkbox')).toHaveCount(7);

  const end = page.getByLabel('Heure de fin (HH:MM)');
  await end.fill('07:00');
  await page.getByRole('button', { name: 'Enregistrer les réglages' }).click();
  await expect(page.getByText('L’heure de fin doit être après l’heure de début.')).toBeVisible();
  await expect(end).toHaveAttribute('aria-invalid', 'true');
  await expectNoA11yViolations(page);
});

test('« Mon profil » tient en 320 px, en portrait et en paysage, sans violation axe', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320', ONLY_320);
  await login(page, 'surveillant');
  await page.goto('/profil');
  await expect(page.getByRole('heading', { name: 'Notifications', level: 2 })).toBeVisible();
  await expect(page.getByLabel('Couverture')).toBeVisible();
  await expectNoHorizontalScroll(page, 'profil, portrait');
  await expectNoA11yViolations(page);

  const portrait = page.viewportSize()!;
  await page.setViewportSize({ width: Math.max(portrait.height, 568), height: portrait.width });
  await expect(page.getByLabel('Couverture')).toBeVisible();
  await expectNoHorizontalScroll(page, 'profil, paysage');
  await expectNoA11yViolations(page);
});
