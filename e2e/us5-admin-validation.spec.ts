import { expect, test, type Browser, type BrowserContextOptions, type Page, type TestInfo } from '@playwright/test';
import { join } from 'node:path';
import type { AccountName } from './support/accounts';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/** T076 — US5 : circuit avec validation administrative (V13). */

const CATEGORY = 'Intervention technique (démo circuit B)';
const PHOTO = join(__dirname, 'fixtures', 'images', 'preuve.png');

function uniqueTitle(base: string, testInfo: TestInfo): string {
  return `${base} [${testInfo.project.name} ${Date.now()}]`;
}

async function pageAs(browser: Browser, testInfo: TestInfo, account: AccountName): Promise<Page> {
  const context = await browser.newContext(testInfo.project.use as BrowserContextOptions);
  const page = await context.newPage();
  await login(page, account);
  return page;
}

async function submitCircuitB(page: Page, title: string): Promise<string> {
  const origin = new URL(page.url()).origin;
  const categories = (await (await page.request.get('/api/categories')).json()) as Array<{ id: string; name: string }>;
  const category = categories.find((c) => c.name === CATEGORY)!;
  const res = await page.request.post('/api/requests', {
    headers: { Origin: origin },
    data: { clientId: crypto.randomUUID(), title, description: 'Salle 12', categoryId: category.id, priority: 'NORMAL' },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function openFromToValidate(page: Page, title: string): Promise<void> {
  await page.goto('/?onglet=a-valider');
  await expect(page.getByRole('tab', { name: 'À valider' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('link', { name: new RegExp(title.replace(/[[\]]/g, '\\$&')) }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

test('V13 — refus motivé à la validation administrative', async ({ page, browser }, testInfo) => {
  test.slow(); // plusieurs utilisateurs et navigateurs à la suite
  const title = uniqueTitle('Changer une ampoule', testInfo);
  await login(page, 'enseignante');
  const id = await submitCircuitB(page, title);

  // Invisible des agents tant qu'elle n'est pas approuvée.
  const repro = await pageAs(browser, testInfo, 'reprographie');
  expect((await repro.request.get(`/api/requests/${id}`)).status()).toBe(404);
  await repro.context().close();

  const manager = await pageAs(browser, testInfo, 'responsable');
  await openFromToValidate(manager, title);
  await expect(manager.getByText('En attente de validation administrative', { exact: true })).toBeVisible();
  await manager.getByRole('button', { name: 'Refuser' }).click();
  const dialog = manager.getByRole('dialog', { name: 'Refuser la demande' });
  await dialog.getByRole('button', { name: 'Confirmer le refus' }).click();
  await expect(dialog.getByText('Indiquez le motif du refus.')).toBeVisible();
  await dialog.getByLabel('Motif du refus').fill('Le service technique de la mairie s’en charge.');
  await dialog.getByRole('button', { name: 'Confirmer le refus' }).click();
  await expect(manager.getByText('Refusée', { exact: true })).toBeVisible();
  await manager.context().close();

  await page.goto(`/demandes/${id}`);
  await expect(page.getByText('Refusée', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Le service technique de la mairie s’en charge.' })).toBeVisible();
});

test('V13 — approbation avec choix de l’employé, réalisation avec photo, validation finale', async ({ page, browser }, testInfo) => {
  test.slow(); // plusieurs utilisateurs et navigateurs à la suite
  const title = uniqueTitle('Réparer le vidéoprojecteur', testInfo);
  await login(page, 'enseignante');
  const id = await submitCircuitB(page, title);

  const manager = await pageAs(browser, testInfo, 'responsable');
  await openFromToValidate(manager, title);
  await manager.getByRole('button', { name: 'Approuver' }).click();
  const approve = manager.getByRole('dialog', { name: 'Approuver la demande' });
  await approve.getByRole('combobox', { name: 'Employé chargé de la demande' }).click();
  await manager.getByRole('option', { name: 'Reprographie — Reprographie' }).click();
  await expectNoA11yViolations(manager);
  await approve.getByRole('button', { name: 'Approuver et affecter' }).click();
  await expect(manager.getByText('Envoyée', { exact: true })).toBeVisible();

  const repro = await pageAs(browser, testInfo, 'reprographie');
  await repro.goto(`/demandes/${id}`);
  await repro.getByRole('button', { name: 'Accepter la demande' }).click();
  await expect(repro.getByText('Acceptée', { exact: true })).toBeVisible();
  await repro.getByRole('button', { name: 'Commencer' }).click();
  await expect(repro.getByText('En cours', { exact: true })).toBeVisible();
  await repro.getByRole('button', { name: 'Marquer comme terminée' }).click();
  const complete = repro.getByRole('dialog', { name: 'Terminer la demande' });
  await complete.getByLabel('Prendre une photo').setInputFiles(PHOTO);
  await expect(complete.getByRole('img', { name: 'Photo de preuve 1' })).toBeVisible();
  await complete.getByRole('button', { name: 'Confirmer la fin' }).click();
  await expect(repro.getByText('En attente de validation finale', { exact: true })).toBeVisible();
  await repro.context().close();

  await openFromToValidate(manager, title);
  await expect(manager.getByRole('img', { name: 'Photo de preuve 1' })).toBeVisible();
  await expectNoA11yViolations(manager);
  await manager.getByRole('button', { name: 'Valider et clôturer' }).click();
  await expect(manager.getByText('Clôturée', { exact: true })).toBeVisible();
  await manager.context().close();

  await page.goto(`/demandes/${id}`);
  await expect(page.getByText('Clôturée', { exact: true })).toBeVisible();
});
