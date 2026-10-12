import { expect, test, type Browser, type BrowserContextOptions, type Page, type TestInfo } from '@playwright/test';
import type { AccountName } from './support/accounts';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/** T069 — US4 : notifications en temps réel dans l'application (V12). */

function uniqueTitle(base: string, testInfo: TestInfo): string {
  return `${base} [${testInfo.project.name} ${Date.now()}]`;
}

async function pageAs(browser: Browser, testInfo: TestInfo, account: AccountName): Promise<Page> {
  const context = await browser.newContext(testInfo.project.use as BrowserContextOptions);
  const page = await context.newPage();
  await login(page, account);
  return page;
}

async function createRequest(page: Page, title: string, priority: 'NORMAL' | 'URGENT'): Promise<string> {
  const origin = new URL(page.url()).origin;
  const categories = (await (await page.request.get('/api/categories')).json()) as Array<{ id: string; name: string }>;
  const category = categories.find((c) => c.name === 'Photocopies')!;
  const recipients = (await (await page.request.get(`/api/categories/${category.id}/recipients`)).json()) as Array<{ id: string }>;
  const res = await page.request.post('/api/requests', {
    headers: { Origin: origin },
    data: { clientId: crypto.randomUUID(), title, description: 'x', categoryId: category.id, recipientId: recipients[0].id, priority },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function unreadCount(page: Page): Promise<number> {
  const label = await page.getByRole('button', { name: /^Notifications \(\d+ non lues?\)$/ }).getAttribute('aria-label');
  return Number(/\((\d+)/.exec(label ?? '')![1]);
}

test('V12 — notification urgente en moins de 5 s sans rechargement, et non lues retrouvées à la reconnexion', async ({
  page,
  browser,
}, testInfo) => {
  const repro = await pageAs(browser, testInfo, 'reprographie');
  await expect(repro.getByRole('heading', { name: 'Mes demandes' })).toBeVisible();
  const before = await unreadCount(repro);

  await login(page, 'enseignante');
  const urgentTitle = uniqueTitle('Photocopies urgentes', testInfo);
  const started = Date.now();
  const id = await createRequest(page, urgentTitle, 'URGENT');

  const alert = repro.getByRole('alert').filter({ hasText: urgentTitle });
  await expect(alert).toBeVisible({ timeout: 5000 });
  expect(Date.now() - started).toBeLessThan(5000);
  await expect(alert).toContainText('Urgent');
  await expect.poll(() => unreadCount(repro)).toBe(before + 1);
  // La liste « Reçues » est rafraîchie sans rechargement.
  await expect(repro.getByRole('link', { name: new RegExp(urgentTitle.replace(/[[\]]/g, '\\$&')) })).toBeVisible();
  await expectNoA11yViolations(repro);

  // Hors ligne au moment d'un événement : la notification est retrouvée à la reconnexion.
  await repro.context().close();
  const missedTitle = uniqueTitle('Affiches', testInfo);
  await createRequest(page, missedTitle, 'NORMAL');
  const back = await pageAs(browser, testInfo, 'reprographie');
  await expect.poll(() => unreadCount(back)).toBeGreaterThanOrEqual(before + 2);
  await back.getByRole('button', { name: /^Notifications/ }).click();
  const menu = back.getByRole('menu', { name: 'Notifications' });
  await expect(menu.getByRole('menuitem', { name: new RegExp(missedTitle.replace(/[[\]]/g, '\\$&')) })).toBeVisible();
  await expectNoA11yViolations(back);

  // Ouvrir la notification marque la demande comme lue et l'affiche.
  await menu.getByRole('menuitem', { name: new RegExp(urgentTitle.replace(/[[\]]/g, '\\$&')) }).click();
  await expect(back.getByRole('heading', { name: urgentTitle })).toBeVisible();
  await expect(back).toHaveURL(new RegExp(`/demandes/${id}$`));
  await back.context().close();
});

test('V12 — le statut et le fil d’une demande ouverte se mettent à jour en direct', async ({ page, browser }, testInfo) => {
  const title = uniqueTitle('Mise à jour en direct', testInfo);
  await login(page, 'enseignante');
  const id = await createRequest(page, title, 'NORMAL');
  await page.goto(`/demandes/${id}`);
  await expect(page.getByText('Envoyée', { exact: true })).toBeVisible();

  const repro = await pageAs(browser, testInfo, 'reprographie');
  await repro.goto(`/demandes/${id}`);
  await repro.getByRole('button', { name: 'Accepter la demande' }).click();
  await expect(repro.getByText('Acceptée', { exact: true })).toBeVisible();

  // Côté demandeuse : aucun rechargement.
  await expect(page.getByText('Acceptée', { exact: true })).toBeVisible({ timeout: 5000 });

  await repro.getByLabel('Votre message').fill('Je m’en occupe cet après-midi.');
  await repro.getByRole('button', { name: 'Envoyer le message' }).click();
  await expect(page.getByRole('list', { name: 'Messages' })).toContainText('Je m’en occupe cet après-midi.', { timeout: 5000 });
  await repro.context().close();
});
