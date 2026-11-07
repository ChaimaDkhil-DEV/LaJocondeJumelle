import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * 011 — l'admin gère les données de référence (étages, niveaux, classes et QR, élèves) et consulte la liste
 * des employés en lecture seule ; les autres sections restent réservées au super administrateur.
 * Rejouable : l'étage, le niveau et la classe portent un marqueur unique, les données partagées ne changent pas.
 */

async function logout(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
}

test.describe('Espace Administrateur de l’admin (011)', () => {
  test('données de référence, liste des employés et sections réservées', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Écrans d’administration (Chromium)');
    test.setTimeout(120_000);
    const marker = Date.now();
    const floorName = `Étage e2e ${marker}`;
    const levelName = `Niveau admin e2e ${marker}`;
    const className = `Classe admin e2e ${marker}`;
    const toast = (text: string) => page.getByRole('status').filter({ hasText: text });

    await login(page, 'admin');
    const menu = page.getByRole('button', { name: 'Ouvrir le menu' });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole('link', { name: 'Administrateur', exact: true }).click();

    // --- Arrivée sur « Étages » : seules les sections de l'admin sont proposées.
    await expect(page.getByRole('heading', { name: 'Étages' })).toBeVisible();
    const sections = page.getByRole('navigation', { name: 'Sections de l’espace Administrateur' }).getByRole('link');
    await expect(sections).toHaveText(['Étages', 'Niveaux', 'Classes', 'Élèves', 'Employés']);
    await expectNoA11yViolations(page);

    await page.getByRole('button', { name: 'Nouvel étage' }).click();
    const floorDialog = page.getByRole('dialog', { name: 'Nouvel étage' });
    await floorDialog.getByLabel(/Nom de l’étage/).fill(floorName);
    await floorDialog.getByLabel(/Ordre d’affichage/).fill(String(500 + (marker % 400)));
    await floorDialog.getByRole('button', { name: 'Enregistrer l’étage' }).click();
    await expect(toast('Étage créé.')).toBeVisible();

    // --- Niveau, puis classe rattachée à l'étage et au niveau.
    await page.goto('/admin/niveaux');
    await page.getByRole('button', { name: 'Nouveau niveau' }).click();
    const levelDialog = page.getByRole('dialog', { name: 'Nouveau niveau' });
    await levelDialog.getByLabel(/Nom du niveau/).fill(levelName);
    await levelDialog.getByRole('button', { name: 'Enregistrer le niveau' }).click();
    await expect(toast('Niveau créé.')).toBeVisible();

    await page.goto('/admin/classes');
    await page.getByRole('button', { name: 'Nouvelle classe' }).click();
    const classDialog = page.getByRole('dialog', { name: 'Nouvelle classe' });
    await classDialog.getByLabel(/Nom de la classe/).fill(className);
    await classDialog.getByRole('combobox', { name: /Étage/ }).click();
    await page.getByRole('option', { name: floorName }).click();
    await classDialog.getByRole('combobox', { name: /Niveau scolaire/ }).click();
    await page.getByRole('option', { name: levelName }).click();
    await classDialog.getByRole('button', { name: 'Enregistrer la classe' }).click();
    await expect(toast('Classe créée.')).toBeVisible();
    await expectNoA11yViolations(page);

    // --- QR de la classe : révoqué puis régénéré par l'admin.
    await page.getByRole('button', { name: `QR code de la classe ${className}` }).click();
    const qrDialog = page.getByRole('dialog', { name: `QR code : ${className}` });
    await expect(qrDialog.getByText('Version 1')).toBeVisible();
    await qrDialog.getByRole('button', { name: 'Révoquer et régénérer' }).click();
    await page.getByRole('dialog', { name: 'Révoquer le QR code ?' }).getByRole('button', { name: 'Révoquer' }).click();
    await expect(qrDialog.getByRole('textbox', { name: 'Lien du QR code' })).toHaveValue(/\.2\./);
    // Le nouveau QR s'affiche sans rouvrir le dialogue, prêt à imprimer.
    await expect(qrDialog.getByText('Version 2')).toBeVisible();
    await expect(qrDialog.getByRole('img', { name: `QR code de la classe ${className}` })).toBeVisible();
    await expect(qrDialog.getByRole('button', { name: 'Imprimer' })).toBeEnabled();
    await qrDialog.getByRole('button', { name: 'Fermer' }).click();
    await expect(
      page.getByRole('list', { name: 'Classes' }).getByRole('listitem').filter({ hasText: className }),
    ).toContainText('QR version 2');

    // --- Élèves : la page s'ouvre, l'ajout est possible.
    await page.goto('/admin/eleves');
    await expect(page.getByRole('heading', { name: 'Élèves' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nouvel élève' })).toBeEnabled();
    await expectNoA11yViolations(page);

    // --- Employés : lecture seule, sans défilement horizontal à 320 px.
    await page.goto('/admin/employes');
    const employees = page.getByRole('list', { name: 'Liste des employés' });
    await expect(employees.getByRole('listitem').first()).toBeVisible();
    await expect(page.locator('section[aria-labelledby="titre-employes"]').getByRole('button')).toHaveCount(0);
    await expectNoA11yViolations(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await expect(employees.getByRole('listitem').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 800 });

    // --- Sections réservées : message, et refus côté serveur.
    await page.goto('/admin/journal');
    await expect(page.getByText('Accès réservé au super administrateur.')).toBeVisible();
    expect((await page.request.get('/api/admin/audit')).status()).toBe(403);

    // --- Le super administrateur voit l'admin comme auteur dans le journal d'audit.
    await logout(page);
    await login(page, 'superadmin');
    await page.goto('/admin/journal');
    await expect(page.getByRole('list', { name: 'Entrées du journal' }).getByRole('listitem').filter({ hasText: floorName }).first()).toContainText(
      'Admin — surveillante générale',
    );
  });
});
