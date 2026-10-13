import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/** T093 — US7 : filtres combinés et historique complet (V15). */

function uniqueTitle(base: string, testInfo: TestInfo): string {
  return `${base} [${testInfo.project.name} ${Date.now()}]`;
}

async function createRequest(page: Page, title: string, priority: 'NORMAL' | 'URGENT'): Promise<{ id: string; version: number }> {
  const origin = new URL(page.url()).origin;
  const categories = (await (await page.request.get('/api/categories')).json()) as Array<{ id: string; name: string }>;
  const category = categories.find((c) => c.name === 'Photocopies')!;
  const recipients = (await (await page.request.get(`/api/categories/${category.id}/recipients`)).json()) as Array<{ id: string }>;
  const res = await page.request.post('/api/requests', {
    headers: { Origin: origin },
    data: { clientId: crypto.randomUUID(), title, description: 'x', categoryId: category.id, recipientId: recipients[0].id, priority },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; version: number };
}

async function act(page: Page, id: string, action: string, version: number): Promise<number> {
  const res = await page.request.post(`/api/requests/${id}/actions`, {
    headers: { Origin: new URL(page.url()).origin },
    data: { action, version },
  });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { version: number }).version;
}

async function choose(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
  await page.keyboard.press('Escape');
}

test('V15 — filtres combinés statut + priorité, puis historique complet de la demande', async ({ page }, testInfo) => {
  const marker = `${testInfo.project.name}-${Date.now()}`;
  const urgentTitle = uniqueTitle(`Brevet ${marker}`, testInfo);
  const normalTitle = uniqueTitle(`Conseil ${marker}`, testInfo);

  await login(page, 'enseignante');
  const urgent = await createRequest(page, urgentTitle, 'URGENT');
  await createRequest(page, normalTitle, 'NORMAL');

  // La reprographie accepte puis commence la demande urgente.
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await login(page, 'reprographie');
  const version = await act(page, urgent.id, 'ACCEPT', urgent.version);
  await act(page, urgent.id, 'START', version);
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await login(page, 'enseignante');

  await page.goto('/?onglet=envoyees');
  await page.getByRole('button', { name: /^Filtres/ }).click();
  await page.getByLabel('Rechercher dans les titres').fill(marker);
  await page.getByLabel('Rechercher dans les titres').press('Enter');
  await expect(page.getByRole('link', { name: new RegExp(marker) })).toHaveCount(2);

  await choose(page, 'Statut', 'En cours');
  await choose(page, 'Priorité', 'Urgente');
  await expect(page.getByRole('button', { name: 'Filtres (3 actifs)' })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(marker) })).toHaveCount(1);
  await expect(page.getByRole('link', { name: new RegExp(urgentTitle.replace(/[[\]]/g, '\\$&')) })).toBeVisible();
  await expectNoA11yViolations(page);

  // Les filtres sont dans l'URL : un rechargement les conserve.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Filtres (3 actifs)' })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(marker) })).toHaveCount(1);

  await page.getByRole('link', { name: new RegExp(urgentTitle.replace(/[[\]]/g, '\\$&')) }).click();
  const history = page.getByRole('list', { name: 'Historique' });
  await expect(history).toContainText('Demande créée');
  await expect(history).toContainText('Affectée à Reprographie');
  await expect(history).toContainText('Statut : Envoyée → Acceptée');
  await expect(history).toContainText('Statut : Acceptée → En cours');
  await expect(history).toContainText('par Reprographie');
  await expectNoA11yViolations(page);
});
