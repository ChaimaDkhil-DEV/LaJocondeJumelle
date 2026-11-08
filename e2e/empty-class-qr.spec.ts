import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * 013 — Déclarer une classe vide en scannant le QR code de la porte, caméra dans l'application. La fausse caméra
 * de Chromium affiche une mire, pas un QR code : le QR est collé dans le lecteur, qui appelle le même chemin
 * qu'une lecture par la caméra. Rejouable : une classe dédiée est créée puis désactivée, l'affectation annulée.
 */

async function logout(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  const menu = page.getByRole('button', { name: 'Ouvrir le menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
}

test.describe('Classe vide déclarée par QR code (013)', () => {
  test('le surveillant scanne la porte : la déclaration part aussitôt', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Parcours piloté par le scénario (Chromium)');
    test.setTimeout(120_000);
    const className = `Classe QR e2e ${Date.now()}`;
    const origin = () => new URL(page.url()).origin;

    // --- Préparation (super administrateur) : une classe dédiée et le lien de son QR code.
    await login(page, 'superadmin');
    const floors = (await (await page.request.get('/api/admin/floors')).json()) as Array<{ id: string; active: boolean }>;
    const floorId = floors.find((f) => f.active)!.id;
    const created = await page.request.post('/api/admin/coverage/classes', { headers: { Origin: origin() }, data: { name: className, floorId } });
    expect(created.ok()).toBeTruthy();
    const classId = ((await created.json()) as Array<{ id: string; name: string }>).find((c) => c.name === className)!.id;
    const qrLink = ((await (await page.request.get(`/api/admin/coverage/classes/${classId}/qr`)).json()) as { url: string }).url;
    await logout(page);

    let coverageId: string | null = null;
    try {
      // --- Surveillant : le scan est le premier choix de la page.
      await login(page, 'surveillant');
      await page.goto('/gardes');
      await page.getByRole('link', { name: 'Déclarer une classe vide' }).click();
      const scan = page.getByRole('button', { name: 'Scanner le QR code de la classe' });
      await expect(scan).toBeVisible();
      await expect(page.getByText('La déclaration part dès que le QR code de la porte est lu.')).toBeVisible();
      await expectNoA11yViolations(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      // --- Le lecteur s'ouvre dans la page ; le QR (collé) part aussitôt, sans autre saisie.
      await scan.click();
      const dialog = page.getByRole('dialog', { name: 'Scanner le QR code de la classe' });
      await expect(dialog).toBeVisible();
      await expectNoA11yViolations(page);
      await dialog.getByRole('textbox', { name: 'Lien ou code du QR code' }).fill(qrLink);
      await dialog.getByRole('button', { name: 'Continuer' }).click();

      await expect(page.getByRole('heading', { level: 2, name: className })).toBeVisible();
      await expect(page.getByRole('status')).toContainText('déclarée vide');
      const view = page.getByRole('link', { name: 'Voir l’affectation' });
      coverageId = (await view.getAttribute('href'))!.split('/').pop()!;
      await expect(page.getByRole('button', { name: 'Scanner une autre classe' })).toBeVisible();
      await expectNoA11yViolations(page);

      // --- 320 px : la page tient sans défilement horizontal.
      await page.setViewportSize({ width: 320, height: 640 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.setViewportSize({ width: 1280, height: 800 });
      await logout(page);

      // --- Admin : l'affectation de la classe est « prise en charge », au nom du surveillant.
      await login(page, 'admin');
      await page.goto('/gardes?onglet=suivi&filtre=prise-en-charge');
      await expect(page.getByRole('link', { name: new RegExp(className) }).first()).toBeVisible();
    } finally {
      // --- Remise en état : affectation annulée (admin), classe désactivée (super administrateur).
      if (!page.url().includes('/gardes')) await login(page, 'admin');
      if (coverageId) {
        const detail = (await (await page.request.get(`/api/coverage/${coverageId}`)).json()) as { version: number };
        await page.request.post(`/api/coverage/${coverageId}/actions`, {
          headers: { Origin: origin() },
          data: { action: 'CANCEL', version: detail.version, reason: 'Remise à zéro du test e2e' },
        });
      }
      await logout(page);
      await login(page, 'superadmin');
      await page.request.patch(`/api/admin/coverage/classes/${classId}`, {
        headers: { Origin: origin() },
        data: { name: className, floorId, active: false },
      });
    }
  });
});
