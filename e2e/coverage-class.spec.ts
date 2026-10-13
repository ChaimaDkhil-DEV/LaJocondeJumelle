import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { join } from 'node:path';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';
import type { AccountName } from './support/accounts';

/**
 * Couverture de classe — scénario 14 : parcours complet (responsable + deux employés du groupe) et
 * tableau du super administrateur, à 360, 768 et 1280 px de large : diffusion, « Je prends », disparition
 * en direct chez l'autre employé, en route, présence par QR + photo, relève, clôture.
 */
const PHOTO = join(__dirname, 'fixtures', 'images', 'preuve.png');
const VIEWPORTS = [
  { width: 360, height: 760 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

async function open(browser: Browser, account: AccountName, viewport: { width: number; height: number }): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600, isMobile: viewport.width < 600 });
  const page = await context.newPage();
  await login(page, account);
  return { context, page };
}

async function expectNoHorizontalScroll(page: Page, screen: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `défilement horizontal sur « ${screen} »`).toBeLessThanOrEqual(0);
}

async function check(page: Page, screen: string): Promise<void> {
  await expectNoHorizontalScroll(page, screen);
  await expectNoA11yViolations(page);
}

/** Choisit une option d'une liste déroulante MUI. */
async function choose(page: Page, label: string, option: string | RegExp): Promise<void> {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

for (const viewport of VIEWPORTS) {
  test(`garde de classe : parcours complet à ${viewport.width} px`, async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Largeurs pilotées par le scénario (Chromium)');
    test.setTimeout(120_000);
    const className = viewport.width === 768 ? '2e année Bleu' : '1ère année Violet';

    const manager = await open(browser, 'responsable', viewport);
    const first = await open(browser, 'surveillant', viewport);
    const second = await open(browser, 'remplacant', viewport);
    const admin = await open(browser, 'superadmin', viewport);
    try {
      // --- Employés : onglet « À prendre » ouvert, mis à jour en direct.
      for (const { page } of [first, second]) {
        await page.goto('/gardes');
        await expect(page.getByRole('tab', { name: 'À prendre' })).toHaveAttribute('aria-selected', 'true');
      }
      await check(first.page, 'À prendre (vide)');

      // --- Responsable : création rapide puis « Diffuser ».
      await manager.page.goto('/gardes');
      await manager.page.getByRole('link', { name: 'Nouvelle demande de couverture' }).click();
      await expect(manager.page.getByRole('heading', { name: 'Nouvelle demande de couverture' })).toBeVisible();
      await choose(manager.page, 'Classe', new RegExp(className));
      await expect(manager.page.getByLabel(/Surveillants\/Remplaçants — 2 disponibles sur 2/)).toBeChecked();
      await check(manager.page, 'Nouvelle demande de couverture');
      await manager.page.getByRole('button', { name: 'Diffuser' }).click();
      await expect(manager.page.getByRole('status').filter({ hasText: 'Demande diffusée à 2 employés' })).toBeVisible();
      await expect(manager.page.getByRole('heading', { name: `Garde — ${className}` })).toBeVisible();
      await expect(manager.page.getByText('Diffusée', { exact: true }).first()).toBeVisible();
      const coverageUrl = manager.page.url();

      // --- Les deux employés voient la carte en direct ; le premier prend la garde.
      const card = (page: Page) => page.getByRole('article', { name: new RegExp(className) });
      await expect(card(first.page)).toBeVisible();
      await expect(card(second.page)).toBeVisible();
      await check(first.page, 'À prendre');
      await card(first.page).getByRole('button', { name: 'Je prends' }).click();
      await expect(first.page.getByRole('status').filter({ hasText: 'Garde prise' })).toBeVisible();
      // Disparaît en direct chez l'autre employé.
      await expect(card(second.page)).toBeHidden();

      // --- Ma garde : en route.
      await first.page.getByRole('tab', { name: 'Ma garde' }).click();
      const guard = first.page.getByRole('article').filter({ hasText: className });
      await expect(guard.getByText('Acceptée', { exact: true })).toBeVisible();
      await check(first.page, 'Ma garde');
      await guard.getByRole('button', { name: 'Je suis en route' }).click();
      await expect(guard.getByText('En route', { exact: true })).toBeVisible();

      // --- QR code de la classe (lien imprimé), ouvert par l'appareil photo du téléphone.
      const classes = (await (await admin.page.request.get('/api/admin/coverage/classes')).json()) as Array<{ id: string; name: string }>;
      const classId = classes.find((c) => c.name === className)!.id;
      const qr = (await (await admin.page.request.get(`/api/admin/coverage/classes/${classId}/qr`)).json()) as { url: string };
      const qrPath = new URL(qr.url).pathname + new URL(qr.url).search;

      // Ouvrir le lien ne valide rien.
      await first.page.goto(qrPath);
      await expect(first.page.getByRole('heading', { name: `Confirmer ma présence en classe ${className}` })).toBeVisible();
      await expect(first.page.getByText('évitez de cadrer les visages des enfants', { exact: false })).toBeVisible();
      const confirm = first.page.getByRole('button', { name: 'Confirmer ma présence' });
      await expect(confirm).toBeDisabled();
      await check(first.page, 'Confirmer ma présence (QR)');
      await first.page.getByLabel('Prendre la photo').setInputFiles(PHOTO);
      await expect(first.page.getByRole('img', { name: 'Photo de présence en classe' })).toBeVisible();
      await confirm.click();
      await expect(first.page.getByRole('status').filter({ hasText: `Présence confirmée en classe ${className}` })).toBeVisible();
      await expect(guard.getByText('En garde', { exact: true })).toBeVisible();
      await expect(guard.getByText(/En classe depuis/)).toBeVisible();

      // --- Le second employé, s'il ouvre la garde : « Déjà prise par Surveillant ».
      await second.page.goto(new URL(coverageUrl).pathname);
      await expect(second.page.getByText('Déjà prise par Surveillant')).toBeVisible();

      // --- Relève : garde terminée (sans validation finale : clôture immédiate).
      await guard.getByRole('button', { name: 'Garde terminée' }).click();
      const dialog = first.page.getByRole('dialog', { name: 'Terminer la garde ?' });
      await dialog.getByRole('button', { name: 'Garde terminée' }).click();
      await expect(first.page.getByRole('status').filter({ hasText: 'Garde terminée.' })).toBeVisible();

      // --- Responsable : détail à jour, photo de preuve visible, historique horodaté.
      await manager.page.reload();
      await expect(manager.page.getByText('Clôturée', { exact: true }).first()).toBeVisible();
      await expect(manager.page.getByRole('img', { name: 'Photo de présence prise par Surveillant' })).toBeVisible();
      await expect(manager.page.getByText('Présence confirmée (photo + QR code)')).toBeVisible();
      await check(manager.page, 'Détail de la garde (responsable)');

      // --- Super administrateur : tableau de suivi.
      await admin.page.goto('/admin/suivi');
      await expect(admin.page.getByRole('heading', { name: 'Suivi des gardes' })).toBeVisible();
      await expect(admin.page.getByText(/Par employé/)).toBeVisible();
      await check(admin.page, 'Suivi des gardes');

      // --- Le responsable n'accède pas aux écrans du super administrateur.
      await manager.page.goto('/admin/suivi');
      await expect(manager.page.getByText('Accès réservé au super administrateur.')).toBeVisible();
    } finally {
      for (const { context } of [manager, first, second, admin]) await context.close();
    }
  });
}
