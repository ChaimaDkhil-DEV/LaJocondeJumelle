import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { AccountName } from './support/accounts';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * Pointage des enseignants par QR : un seul QR par classe (le même que celui des gardes). Le QR identifie
 * la classe, la session identifie la personne, l'heure vient du serveur. L'enseignant enregistre son
 * arrivée en un geste ; l'admin la voit, la qualifie avec un motif, et ne peut pas la contredire. Un
 * surveillant qui scanne le même QR n'a pas le parcours de l'enseignant. Rejouable : si l'arrivée du jour
 * est déjà enregistrée, le scénario reprend à partir de là.
 */
const CLASS_NAME = '1ère année Violet';
const PHONE = { width: 360, height: 760 };
const DESKTOP = { width: 1280, height: 800 };

interface Session {
  context: BrowserContext;
  page: Page;
}

async function open(browser: Browser, account: AccountName, viewport: { width: number; height: number }): Promise<Session> {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600, isMobile: viewport.width < 600 });
  const page = await context.newPage();
  await login(page, account);
  return { context, page };
}

async function check(page: Page, screen: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `défilement horizontal sur « ${screen} »`).toBeLessThanOrEqual(0);
  await expectNoA11yViolations(page);
}

/** Lien du QR code imprimé de la classe, lu avec le compte du super administrateur. */
async function qrLink(superadmin: Page): Promise<string> {
  const classes = (await (await superadmin.request.get('/api/admin/coverage/classes')).json()) as Array<{ id: string; name: string }>;
  const classId = classes.find((c) => c.name === CLASS_NAME)!.id;
  const qr = (await (await superadmin.request.get(`/api/admin/coverage/classes/${classId}/qr`)).json()) as { url: string };
  return qr.url;
}

test.describe('Pointage des enseignants par QR', () => {
  // Playwright impose un motif de déstructuration en premier argument, même sans fixture.
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Largeurs pilotées par le scénario (Chromium)');
    test.setTimeout(120_000);
  });

  test('l’enseignant scanne, l’admin voit et qualifie ; le surveillant n’a pas ce parcours', async ({ browser }) => {
    const teacher = await open(browser, 'enseignante', PHONE);
    const admin = await open(browser, 'admin', DESKTOP);
    const supervisor = await open(browser, 'surveillant', PHONE);
    const superadmin = await open(browser, 'superadmin', DESKTOP);
    try {
      const link = await qrLink(superadmin.page);

      // --- Enseignant : « Mes présences », puis scan du QR (collé : la caméra n'est qu'une commodité).
      await teacher.page.goto('/gardes?onglet=mes-presences');
      await expect(teacher.page.getByRole('tab', { name: 'Mes présences' })).toHaveAttribute('aria-selected', 'true');
      await check(teacher.page, 'Mes présences');
      await teacher.page.getByRole('button', { name: 'Scanner QR Code' }).click();
      const dialog = teacher.page.getByRole('dialog', { name: 'Scanner le QR code de la classe' });
      await expect(dialog.getByRole('textbox', { name: 'Lien ou code du QR code' })).toBeVisible();
      await check(teacher.page, 'Scanner le QR code');
      await dialog.getByRole('textbox', { name: 'Lien ou code du QR code' }).fill(link);
      await dialog.getByRole('button', { name: 'Continuer' }).click();

      // --- Page de la classe : ouvrir le lien n'enregistre rien, un appui enregistre l'arrivée.
      await expect(teacher.page.getByRole('heading', { name: CLASS_NAME })).toBeVisible();
      const record = teacher.page.getByRole('button', { name: 'Enregistrer mon arrivée' });
      if (await record.isVisible()) {
        await check(teacher.page, 'Enregistrer mon arrivée');
        await record.click();
        await expect(teacher.page.getByText('Votre arrivée est enregistrée.')).toBeVisible();
      } else {
        await expect(teacher.page.getByText('Votre arrivée était déjà enregistrée pour aujourd’hui.')).toBeVisible();
      }
      await expect(teacher.page.getByText('Arrivée enregistrée', { exact: true })).toBeVisible();
      await expect(teacher.page.getByText('L’heure enregistrée est celle du serveur au moment du scan.')).toBeVisible();
      await check(teacher.page, 'Arrivée enregistrée');

      // Double scan : pas de doublon, le pointage du jour est simplement rappelé.
      await teacher.page.goto(new URL(link).pathname + new URL(link).search);
      await expect(teacher.page.getByText('Votre arrivée était déjà enregistrée pour aujourd’hui.')).toBeVisible();

      await teacher.page.goto('/gardes?onglet=mes-presences');
      const mine = teacher.page.getByRole('list', { name: 'Mes présences' });
      await expect(mine.getByRole('listitem').filter({ hasText: CLASS_NAME })).toHaveCount(1);

      // --- Surveillant : même QR, mais pas le parcours de l'enseignant (les droits viennent de la session).
      await supervisor.page.goto(new URL(link).pathname + new URL(link).search);
      await expect(supervisor.page.getByRole('heading', { name: 'Confirmer ma présence' })).toBeVisible();
      await expect(supervisor.page.getByRole('button', { name: 'Enregistrer mon arrivée' })).toHaveCount(0);
      const refused = await supervisor.page.request.post('/api/attendance/arrive', {
        headers: { Origin: new URL(supervisor.page.url()).origin },
        data: { token: new URL(link).searchParams.get('c') },
      });
      expect(refused.status()).toBe(404);

      // --- Admin : voit l'arrivée du jour, la qualifie avec un motif ; ne peut pas la contredire.
      await admin.page.goto('/gardes?onglet=presences');
      await expect(admin.page.getByRole('tab', { name: 'Présences' })).toHaveAttribute('aria-selected', 'true');
      const arrivals = admin.page.getByRole('list', { name: 'Arrivées enregistrées' });
      const row = arrivals.getByRole('listitem').filter({ hasText: `Enseignante — ${CLASS_NAME}` });
      await expect(row).toHaveCount(1);
      await check(admin.page, 'Suivi des présences');
      await row.getByRole('button', { name: 'Corriger' }).click();
      const correction = admin.page.getByRole('dialog', { name: 'Corriger : Enseignante' });
      // Un scan est une preuve : pas d'absence possible, pas de modification de l'heure du serveur.
      await correction.getByRole('combobox', { name: 'Nouveau statut' }).click();
      await expect(admin.page.getByRole('option', { name: 'Absent' })).toHaveCount(0);
      await admin.page.getByRole('option', { name: 'En retard' }).click();
      await correction.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(correction.getByRole('alert')).toContainText('Indiquez le motif de la correction.');
      await correction.getByLabel(/Motif de la correction/).fill('Arrivée après la sonnerie');
      await correction.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(admin.page.getByText('Présence corrigée.')).toBeVisible();
      await expect(row.getByText('En retard', { exact: true })).toBeVisible();

      // Régulariser un enseignant déjà scanné est refusé : jamais deux présences contradictoires.
      await admin.page.getByRole('button', { name: 'Régulariser une présence' }).click();
      const manual = admin.page.getByRole('dialog', { name: 'Régulariser une présence' });
      await manual.getByRole('combobox', { name: /Enseignant/ }).click();
      await admin.page.getByRole('option', { name: 'Enseignante' }).click();
      await manual.getByRole('combobox', { name: /Classe/ }).click();
      await admin.page.getByRole('option', { name: CLASS_NAME }).click();
      await manual.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(manual.getByRole('alert')).toContainText('déjà enregistrée');
    } finally {
      for (const s of [teacher, admin, supervisor, superadmin]) await s.context.close();
    }
  });
});
