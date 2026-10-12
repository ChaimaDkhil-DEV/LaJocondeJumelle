import { expect, test, type BrowserContextOptions, type Page, type TestInfo } from '@playwright/test';
import { join } from 'node:path';
import type { AccountName } from './support/accounts';
import { expectNoA11yViolations } from './support/axe';
import { installFakeMediaRecorder } from './support/fake-media-recorder';
import { login } from './support/login';

/** T061 — US3 : fil de discussion (V10) et fichiers refusés (V11). */

const PHOTO = join(__dirname, 'fixtures', 'images', 'preuve.png');
const PDF = join(__dirname, 'fixtures', 'docs', 'consignes.pdf');

function uniqueTitle(base: string, testInfo: TestInfo): string {
  return `${base} [${testInfo.project.name} ${Date.now()}]`;
}

async function createRequest(page: Page, title: string): Promise<string> {
  const origin = new URL(page.url()).origin;
  const categories = (await (await page.request.get('/api/categories')).json()) as Array<{ id: string; name: string }>;
  const category = categories.find((c) => c.name === 'Photocopies')!;
  const recipients = (await (await page.request.get(`/api/categories/${category.id}/recipients`)).json()) as Array<{ id: string }>;
  const res = await page.request.post('/api/requests', {
    headers: { Origin: origin },
    data: {
      clientId: crypto.randomUUID(),
      title,
      description: 'Voir la discussion',
      categoryId: category.id,
      recipientId: recipients[0].id,
      priority: 'NORMAL',
    },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function pageAs(
  browser: import('@playwright/test').Browser,
  testInfo: TestInfo,
  account: AccountName,
  browserName: string,
): Promise<Page> {
  const context = await browser.newContext(testInfo.project.use as BrowserContextOptions);
  const page = await context.newPage();
  if (browserName === 'webkit') await installFakeMediaRecorder(page);
  await login(page, account);
  return page;
}

test('V10 — échange texte, vocal, photo et PDF ; confidentialité pour un non-participant', async ({ page, browser, browserName }, testInfo) => {
  const title = uniqueTitle('Photocopies avec modèle', testInfo);
  await login(page, 'enseignante');
  const id = await createRequest(page, title);

  // L'enseignante écrit dans le fil.
  await page.goto(`/demandes/${id}`);
  await page.getByLabel('Votre message').fill('Le modèle est dans la salle des professeurs.');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  const messages = page.getByRole('list', { name: 'Messages' });
  await expect(messages.getByRole('listitem')).toHaveCount(1);
  await expect(messages).toContainText('Enseignante');
  await expect(messages).toContainText('Le modèle est dans la salle des professeurs.');

  // La reprographie répond avec un vocal, une photo et un PDF.
  const repro = await pageAs(browser, testInfo, 'reprographie', browserName);
  await repro.goto(`/demandes/${id}`);
  await expect(repro.getByRole('list', { name: 'Messages' })).toContainText('Le modèle est dans la salle des professeurs.');
  await repro.getByRole('button', { name: 'Enregistrer un message vocal' }).click();
  await repro.waitForTimeout(2000);
  await repro.getByRole('button', { name: 'Arrêter l’enregistrement' }).click();
  await repro.getByLabel('Choisir dans la galerie').setInputFiles(PHOTO);
  await expect(repro.getByRole('img', { name: 'Photo à joindre 1' })).toBeVisible();
  await repro.getByLabel('Joindre un PDF').setInputFiles(PDF);
  await expect(repro.getByText('consignes.pdf')).toBeVisible();
  await repro.getByLabel('Votre message').fill('Voici le résultat et le bon de commande.');
  await expectNoA11yViolations(repro);
  await repro.getByRole('button', { name: 'Envoyer le message' }).click();
  await expect(repro.getByRole('list', { name: 'Messages' }).getByRole('listitem')).toHaveCount(2);
  await repro.context().close();

  // L'enseignante voit la réponse (rechargement : le temps réel arrive avec US4).
  await page.reload();
  const reply = page.getByRole('list', { name: 'Messages' }).getByRole('listitem').nth(1);
  await expect(reply).toContainText('Reprographie');
  await expect(reply.locator('time')).toHaveAttribute('datetime', /\d{4}-\d{2}-\d{2}T/);
  await expect(reply.getByRole('button', { name: 'Lire le message vocal' })).toBeVisible();
  const photo = reply.getByRole('img', { name: /Photo jointe/ });
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const pdfLink = reply.getByRole('link', { name: /Télécharger consignes\.pdf/ });
  await expect(pdfLink).toBeVisible();
  await expectNoA11yViolations(page);
  const pdfUrl = await pdfLink.getAttribute('href');
  expect((await page.request.get(pdfUrl!)).status()).toBe(200);

  // Un employé sans lien avec la demande n'accède ni à la demande, ni au fil, ni aux fichiers.
  const autre = await pageAs(browser, testInfo, 'autre', browserName);
  expect((await autre.request.get(`/api/requests/${id}`)).status()).toBe(404);
  expect((await autre.request.get(`/api/requests/${id}/messages`)).status()).toBe(404);
  expect((await autre.request.get(pdfUrl!)).status()).toBe(404);
  await autre.goto(`/demandes/${id}`);
  await expect(autre.getByText('Cette demande est introuvable ou vous n’y avez pas accès.')).toBeVisible();
  await autre.context().close();
});

test('V11 — un exécutable renommé et un PDF trop volumineux sont refusés avec un message clair', async ({ page }, testInfo) => {
  const title = uniqueTitle('Fichiers refusés', testInfo);
  await login(page, 'enseignante');
  const id = await createRequest(page, title);
  await page.goto(`/demandes/${id}`);

  await page.getByLabel('Joindre un PDF').setInputFiles({
    name: 'programme.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)]),
  });
  await expect(page.getByRole('alert').filter({ hasText: 'n’est pas accepté' })).toBeVisible();

  await page.getByLabel('Joindre un PDF').setInputFiles({
    name: 'tres-gros.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(20 * 1024 * 1024)]),
  });
  await expect(page.getByRole('alert').filter({ hasText: 'trop volumineux' })).toBeVisible();
  await expect(page.getByText('tres-gros.pdf')).toHaveCount(0);
});
