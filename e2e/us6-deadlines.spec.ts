import { expect, test, type Browser, type BrowserContextOptions, type Page, type TestInfo } from '@playwright/test';
import type { AccountName } from './support/accounts';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * T083 — US6 : suivi des délais (V14). Règle du seed « Photocopies », priorité Urgente :
 * prise en charge en 1 min. Le test attend réellement l'échéance puis le passage du job (15 s).
 * La logique étant côté serveur, il n'est exécuté que sur un moteur Chromium et un moteur WebKit.
 */

function uniqueTitle(base: string, testInfo: TestInfo): string {
  return `${base} [${testInfo.project.name} ${Date.now()}]`;
}

async function pageAs(browser: Browser, testInfo: TestInfo, account: AccountName): Promise<Page> {
  const context = await browser.newContext(testInfo.project.use as BrowserContextOptions);
  const page = await context.newPage();
  await login(page, account);
  return page;
}

test('V14 — compte à rebours, alerte, puis « En retard (prise en charge) » signalé au super administrateur, visible du responsable', async ({ page, browser }, testInfo) => {
  test.skip(!['chromium', 'iPhone 13'].includes(testInfo.project.name), 'Logique serveur : un moteur Chromium et un moteur WebKit suffisent');
  test.setTimeout(180_000);

  const title = uniqueTitle('Photocopies urgentes', testInfo);
  await login(page, 'enseignante');
  const origin = new URL(page.url()).origin;
  const categories = (await (await page.request.get('/api/categories')).json()) as Array<{ id: string; name: string }>;
  const category = categories.find((c) => c.name === 'Photocopies')!;
  const recipients = (await (await page.request.get(`/api/categories/${category.id}/recipients`)).json()) as Array<{ id: string }>;
  const created = await page.request.post('/api/requests', {
    headers: { Origin: origin },
    data: { clientId: crypto.randomUUID(), title, description: 'Pour 10 h', categoryId: category.id, recipientId: recipients[0].id, priority: 'URGENT' },
  });
  expect(created.status()).toBe(201);
  const { id, currentDueAt } = (await created.json()) as { id: string; currentDueAt: string };

  await page.goto(`/demandes/${id}`);
  await expect(page.getByText(/^Reste \d+ s pour la prise en charge$|^Reste 1 min \d+ s pour la prise en charge$/)).toBeVisible();
  await expectNoA11yViolations(page);

  // Seuil d'alerte (20 % avant l'échéance, soit 48 s après l'envoi).
  await expect(page.getByText(/^Bientôt en retard : reste \d+ s pour la prise en charge$/)).toBeVisible({ timeout: 60_000 });

  // Échéance : affichage immédiat côté client, puis marquage par le serveur en moins de 30 s.
  await expect(page.getByText('En retard (prise en charge)')).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      async () => ((await (await page.request.get(`/api/requests/${id}`)).json()) as { overdueStage: string | null }).overdueStage,
      { timeout: 30_000, intervals: [2000] },
    )
    .toBe('TAKEOVER');
  const markedAt = Date.now();
  expect(markedAt - Date.parse(currentDueAt)).toBeLessThan(30_000 + 5_000);
  await expectNoA11yViolations(page);

  // Photocopies est en mode direct : l'administration consulte sans être notifiée (retards compris) ;
  // le super administrateur reçoit son alerte « en retard », posée par la tâche planifiée.
  type Notifications = { items: Array<{ type: string; request: { id: string } }> };
  const overdueFor = async (target: Page) =>
    ((await (await target.request.get('/api/notifications?limit=50')).json()) as Notifications).items.some(
      (n) => n.type === 'OVERDUE' && n.request.id === id,
    );
  const superadmin = await pageAs(browser, testInfo, 'superadmin');
  await expect.poll(() => overdueFor(superadmin), { timeout: 30_000, intervals: [2000] }).toBe(true);
  await superadmin.context().close();

  // Le responsable n'est pas notifié, mais la demande reste visible, en lecture seule.
  const manager = await pageAs(browser, testInfo, 'responsable');
  expect(await overdueFor(manager)).toBe(false);
  await manager.goto(`/demandes/${id}`);
  // Signalé à la fois par l'indicateur de la demande et par l'historique (US7).
  await expect(manager.getByRole('list', { name: 'Historique' }).getByText('En retard (prise en charge)')).toBeVisible();
  await expect(manager.getByText('En retard (prise en charge)')).toHaveCount(2);
  await manager.context().close();
});
