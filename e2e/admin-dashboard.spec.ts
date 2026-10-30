import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * Tableau de bord du super administrateur : une demande créée par une enseignante apparaît dans la
 * supervision, mène à son détail ; un admin est refusé (interface et API). La base e2e est
 * partagée entre projets : on vérifie la présence de la demande du test, jamais des totaux exacts.
 */

function uniqueTitle(base: string, testInfo: TestInfo): string {
  return `${base} [${testInfo.project.name} ${Date.now()}]`;
}

async function openNavigation(page: Page): Promise<void> {
  const menu = page.getByRole('button', { name: 'Ouvrir le menu' });
  if (await menu.isVisible()) await menu.click();
}

async function logout(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
}

/** Crée une demande urgente de photocopies avec la session de la page (enseignante). */
async function createUrgentRequest(page: Page, title: string): Promise<string> {
  const origin = new URL(page.url()).origin;
  const categories = (await (await page.request.get('/api/categories')).json()) as Array<{ id: string; name: string }>;
  const category = categories.find((c) => c.name === 'Photocopies')!;
  const recipients = (await (await page.request.get(`/api/categories/${category.id}/recipients`)).json()) as Array<{ id: string }>;
  const res = await page.request.post('/api/requests', {
    headers: { Origin: origin },
    data: { clientId: crypto.randomUUID(), title, description: 'Demande du tableau de bord', categoryId: category.id, recipientId: recipients[0].id, priority: 'URGENT' },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test('le super administrateur supervise les demandes depuis le tableau de bord ; un admin est refusé', async ({ page }, testInfo) => {
  test.slow();
  const title = uniqueTitle('Copies tableau de bord', testInfo);

  await login(page, 'enseignante');
  const id = await createUrgentRequest(page, title);
  await logout(page);

  // Page d'accueil du super administrateur, première entrée de la navigation.
  await login(page, 'superadmin');
  await expect(page).toHaveURL(/\/$/);
  await openNavigation(page);
  await expect(page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link').first()).toHaveText('Tableau de bord');
  await page.getByRole('link', { name: 'Tableau de bord', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();

  // Vue générale, onglet par défaut : indicateurs et graphiques avec leur vue tableau.
  await expect(page.getByRole('tab', { name: 'Vue générale' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Demandes créées sur la période')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Demandes créées et terminées par jour' })).toBeVisible();
  await expect(page.locator('p', { hasText: /^\d+$/ }).first()).toBeVisible();
  await expectNoA11yViolations(page);

  // Filtre de priorité (derrière « Filtres ») : la requête repart avec le critère, la page reste cohérente.
  await page.getByRole('button', { name: /^Filtres/ }).click();
  await page.getByRole('combobox', { name: 'Priorité' }).click();
  const summary = page.waitForResponse((r) => r.url().includes('/api/admin/dashboard/summary') && r.url().includes('priority=URGENT'));
  await page.getByRole('option', { name: 'Urgente' }).click();
  expect((await summary).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'À traiter maintenant' })).toBeVisible();

  // Onglet Délais : indicateurs (ou état vide si rien n'est encore mesurable), aide repliable, sans violation axe.
  await page.getByRole('tab', { name: 'Délais' }).click();
  const delays = page.getByRole('table', { name: 'Délais par priorité' }).or(page.getByText('Aucun délai à mesurer'));
  await expect(delays).toBeVisible({ timeout: 30_000 });
  if (await page.getByRole('table', { name: 'Délais par priorité' }).isVisible()) {
    const help = page.getByRole('button', { name: 'Comment sont calculés ces indicateurs ?' });
    await help.click();
    await expect(help).toHaveAttribute('aria-expanded', 'true');
  }
  await expectNoA11yViolations(page);

  // Onglet Employés : tableau (grand écran) ou cartes (mobile), détail au clic, sans violation axe.
  await page.getByRole('tab', { name: 'Employés' }).click();
  const employees = page.getByRole('table', { name: 'Employés' }).or(page.getByRole('list', { name: 'Employés' }));
  await expect(employees).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Nouvel employé', exact: true })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Reprographie, voir le détail' }).click();
  const detail = page.getByRole('dialog', { name: 'Reprographie' });
  await expect(detail.getByText('Délais moyens')).toBeVisible();
  await expectNoA11yViolations(page);
  await detail.getByRole('button', { name: 'Fermer le détail' }).click();
  await expect(detail).toBeHidden();

  // Onglet Demandes : la demande du test, la plus récente, mène à son détail.
  await page.getByRole('tab', { name: 'Demandes' }).click();
  const link = page.getByRole('table', { name: 'Demandes de la période' }).getByRole('link', { name: title });
  await expect(link).toBeVisible();
  await expectNoA11yViolations(page);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/demandes/${id}$`));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  // Onglet Activité : la création de la demande figure dans le fil, sans son contenu.
  await page.goto('/?vue=activite');
  const activity = page.getByRole('list', { name: 'Dernières actions' });
  await expect(activity.getByRole('listitem').filter({ hasText: title }).first()).toBeVisible();
  await expect(activity).not.toContainText('Demande du tableau de bord');
  await expectNoA11yViolations(page);

  // L'admin n'y a pas accès, ni par l'interface ni par l'API.
  await logout(page);
  await login(page, 'admin');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Mes demandes' })).toBeVisible();
  await openNavigation(page);
  await expect(page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Tableau de bord' })).toHaveCount(0);
  await page.goto('/admin/tableau-de-bord');
  await expect(page.getByText('Accès réservé au super administrateur.')).toBeVisible();
  expect((await page.request.get('/api/admin/dashboard/summary')).status()).toBe(403);
});
