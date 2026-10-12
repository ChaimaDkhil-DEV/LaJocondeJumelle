import { expect, test, type Browser, type BrowserContextOptions, type Page, type TestInfo } from '@playwright/test';
import { join } from 'node:path';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * T051 — US2 : traiter une demande en circuit direct.
 * V5 accepter / commencer / terminer / renvoyer à corriger, V6 photo de preuve et clôture,
 * V7 refus motivé, V8 annulation, V9 actions simultanées.
 */

const PHOTO = join(__dirname, 'fixtures', 'images', 'preuve.png');

function uniqueTitle(base: string, testInfo: TestInfo): string {
  return `${base} [${testInfo.project.name} ${Date.now()}]`;
}

/** Crée une demande par l'API, avec la session de la page (connectée en tant que demandeuse). */
async function createRequest(page: Page, categoryName: string, title: string): Promise<string> {
  const origin = new URL(page.url()).origin;
  const categories = (await (await page.request.get('/api/categories')).json()) as Array<{ id: string; name: string }>;
  const category = categories.find((c) => c.name === categoryName)!;
  const recipients = (await (await page.request.get(`/api/categories/${category.id}/recipients`)).json()) as Array<{ id: string }>;
  const res = await page.request.post('/api/requests', {
    headers: { Origin: origin },
    data: {
      clientId: crypto.randomUUID(),
      title,
      description: 'Demande créée pour le test',
      categoryId: category.id,
      recipientId: recipients[0].id,
      priority: 'NORMAL',
    },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function switchUser(page: Page, account: 'enseignante' | 'reprographie'): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  await login(page, account);
}

async function open(page: Page, id: string, title: string): Promise<void> {
  await page.goto(`/demandes/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

async function act(page: Page, label: string, expectedStatus: string): Promise<void> {
  await page.getByRole('button', { name: label }).click();
  await expect(page.getByText(expectedStatus, { exact: true })).toBeVisible();
}

async function newUserPage(browser: Browser, testInfo: TestInfo, account: 'reprographie'): Promise<Page> {
  const context = await browser.newContext(testInfo.project.use as BrowserContextOptions);
  const page = await context.newPage();
  await login(page, account);
  return page;
}

test('V5 — accepter, commencer, terminer, puis renvoyer à corriger avec un commentaire', async ({ page }, testInfo) => {
  const title = uniqueTitle('Photocopies brevet blanc', testInfo);
  await login(page, 'enseignante');
  const id = await createRequest(page, 'Photocopies', title);

  await switchUser(page, 'reprographie');
  await open(page, id, title);
  await expectNoA11yViolations(page);
  await act(page, 'Accepter la demande', 'Acceptée');
  await act(page, 'Commencer', 'En cours');
  await act(page, 'Marquer comme terminée', 'Terminée');

  await switchUser(page, 'enseignante');
  await open(page, id, title);
  await expect(page.getByText(/sera clôturée automatiquement le/)).toBeVisible();
  await page.getByRole('button', { name: 'Renvoyer à corriger' }).click();
  const dialog = page.getByRole('dialog', { name: 'Renvoyer à corriger' });
  await dialog.getByRole('button', { name: 'Renvoyer à corriger' }).click();
  await expect(dialog.getByText('Indiquez ce qu’il faut corriger.')).toBeVisible();
  await expectNoA11yViolations(page);
  await dialog.getByLabel('Ce qu’il faut corriger').fill('Il faut 30 exemplaires, pas 20.');
  await dialog.getByRole('button', { name: 'Renvoyer à corriger' }).click();
  await expect(page.getByText('À corriger', { exact: true })).toBeVisible();

  await switchUser(page, 'reprographie');
  await open(page, id, title);
  await act(page, 'Reprendre', 'En cours');
  await act(page, 'Marquer comme terminée', 'Terminée');
});

test('V6 — photo de preuve obligatoire, puis clôture par la demandeuse', async ({ page }, testInfo) => {
  const title = uniqueTitle('Fixer une étagère', testInfo);
  await login(page, 'enseignante');
  const id = await createRequest(page, 'Petits travaux (démo photo)', title);

  await switchUser(page, 'reprographie');
  await open(page, id, title);
  await act(page, 'Accepter la demande', 'Acceptée');
  await act(page, 'Commencer', 'En cours');

  await page.getByRole('button', { name: 'Marquer comme terminée' }).click();
  const dialog = page.getByRole('dialog', { name: 'Terminer la demande' });
  await expect(dialog.getByText(/photo de preuve est obligatoire/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirmer la fin' })).toBeDisabled();
  await dialog.getByLabel('Prendre une photo').setInputFiles(PHOTO);
  await expect(dialog.getByRole('img', { name: 'Photo de preuve 1' })).toBeVisible();
  await expectNoA11yViolations(page);
  await dialog.getByRole('button', { name: 'Confirmer la fin' }).click();
  await expect(page.getByText('Terminée', { exact: true })).toBeVisible();

  await switchUser(page, 'enseignante');
  await open(page, id, title);
  const proof = page.getByRole('img', { name: 'Photo de preuve 1' });
  await expect(proof).toBeVisible();
  await expect.poll(() => proof.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await act(page, 'Clôturer', 'Clôturée');
  await expect(page.getByRole('button', { name: 'Renvoyer à corriger' })).toHaveCount(0);
});

test('V7 — refus par l’employé : motif obligatoire, visible par la demandeuse', async ({ page }, testInfo) => {
  const title = uniqueTitle('Demande hors service', testInfo);
  await login(page, 'enseignante');
  const id = await createRequest(page, 'Photocopies', title);

  await switchUser(page, 'reprographie');
  await open(page, id, title);
  await page.getByRole('button', { name: 'Refuser' }).click();
  const dialog = page.getByRole('dialog', { name: 'Refuser la demande' });
  await dialog.getByRole('button', { name: 'Confirmer le refus' }).click();
  await expect(dialog.getByText('Indiquez le motif du refus.')).toBeVisible();
  await dialog.getByLabel('Motif du refus').fill('Ces documents sont à imprimer par le secrétariat.');
  await dialog.getByRole('button', { name: 'Confirmer le refus' }).click();
  await expect(page.getByText('Refusée', { exact: true })).toBeVisible();

  await switchUser(page, 'enseignante');
  await open(page, id, title);
  await expect(page.getByText('Ces documents sont à imprimer par le secrétariat.')).toBeVisible();
  await expectNoA11yViolations(page);
});

test('V8 — annulation possible avant acceptation seulement', async ({ page }, testInfo) => {
  await login(page, 'enseignante');
  const cancellable = uniqueTitle('Annulable', testInfo);
  const cancellableId = await createRequest(page, 'Photocopies', cancellable);
  await open(page, cancellableId, cancellable);
  await page.getByRole('button', { name: 'Annuler la demande' }).click();
  await page.getByRole('dialog', { name: 'Annuler cette demande ?' }).getByRole('button', { name: 'Oui, annuler la demande' }).click();
  await expect(page.getByText('Annulée', { exact: true })).toBeVisible();

  const accepted = uniqueTitle('Déjà acceptée', testInfo);
  const acceptedId = await createRequest(page, 'Photocopies', accepted);
  await switchUser(page, 'reprographie');
  await open(page, acceptedId, accepted);
  await act(page, 'Accepter la demande', 'Acceptée');
  await switchUser(page, 'enseignante');
  await open(page, acceptedId, accepted);
  await expect(page.getByRole('button', { name: 'Annuler la demande' })).toHaveCount(0);
});

test('V9 — deux actions simultanées : la seconde est expliquée et la demande rechargée', async ({ page, browser }, testInfo) => {
  const title = uniqueTitle('Conflit', testInfo);
  await login(page, 'enseignante');
  const id = await createRequest(page, 'Photocopies', title);
  await switchUser(page, 'reprographie');

  const other = await newUserPage(browser, testInfo, 'reprographie');
  await open(page, id, title);
  await open(other, id, title);

  await act(page, 'Accepter la demande', 'Acceptée');
  await other.getByRole('button', { name: 'Accepter la demande' }).click();
  await expect(other.getByRole('alert')).toContainText('modifiée entre-temps');
  await expect(other.getByText('Acceptée', { exact: true })).toBeVisible();
  await expect(other.getByRole('button', { name: 'Commencer' })).toBeVisible();
  await other.context().close();
});
