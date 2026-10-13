import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * T111 — V18 : accessibilité et responsive. À 320 px de large (profil mobile-320) : aucun défilement
 * horizontal ni violation axe sur chaque écran livré ; parcours de création (V1), de traitement (V5)
 * et du fil (V10) réalisés au clavier seul.
 */
const ONLY_320 = 'Scénario dédié au profil 320 px';

async function expectNoHorizontalScroll(page: Page, screen: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `défilement horizontal sur « ${screen} »`).toBeLessThanOrEqual(0);
}

async function checkScreen(page: Page, screen: string): Promise<void> {
  await expectNoHorizontalScroll(page, screen);
  await expectNoA11yViolations(page);
}

/** Avance au clavier (Tab) jusqu'à l'élément : échoue s'il n'est pas atteignable. */
async function tabTo(page: Page, target: Locator, maxTabs = 60): Promise<void> {
  for (let i = 0; i < maxTabs; i += 1) {
    if (await target.evaluate((el) => el === document.activeElement || el.contains(document.activeElement))) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Élément non atteignable au clavier : ${target.toString()}`);
}

/** Choisit une option d'une liste déroulante MUI au clavier. */
async function chooseWithKeyboard(page: Page, combobox: Locator, option: string): Promise<void> {
  await tabTo(page, combobox);
  await page.keyboard.press('Enter');
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  for (let i = 0; i < 20; i += 1) {
    const focused = listbox.locator('[role="option"]:focus');
    if ((await focused.count()) > 0 && (await focused.innerText()).trim() === option) break;
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('Enter');
  await expect(listbox).toBeHidden();
}

async function createRequestByApi(page: Page, title: string): Promise<string> {
  const origin = new URL(page.url()).origin;
  const categories = (await (await page.request.get('/api/categories')).json()) as Array<{ id: string; name: string }>;
  const category = categories.find((c) => c.name === 'Photocopies')!;
  const recipients = (await (await page.request.get(`/api/categories/${category.id}/recipients`)).json()) as Array<{ id: string }>;
  const res = await page.request.post('/api/requests', {
    headers: { Origin: origin },
    data: { clientId: crypto.randomUUID(), title, description: 'Contrôle accessibilité', categoryId: category.id, recipientId: recipients[0].id, priority: 'NORMAL' },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test('V18 — chaque écran livré tient en 320 px, sans violation axe', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320', ONLY_320);
  test.slow();
  await login(page, 'enseignante');
  const id = await createRequestByApi(page, `Écrans 320 px ${Date.now()}`);

  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Envoyées' })).toBeVisible();
  await checkScreen(page, 'liste');
  await page.getByRole('button', { name: /^Filtres/ }).click();
  await expect(page.getByLabel('Rechercher dans les titres')).toBeVisible();
  await checkScreen(page, 'liste avec filtres');

  await page.goto('/demandes/nouvelle');
  await expect(page.getByRole('heading', { name: 'Nouvelle demande' })).toBeVisible();
  await checkScreen(page, 'création');

  await page.goto(`/demandes/${id}`);
  await expect(page.getByRole('list', { name: 'Historique' })).toBeVisible();
  await checkScreen(page, 'détail');

  await page.getByRole('button', { name: /^Notifications/ }).click();
  await checkScreen(page, 'notifications');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await expect(page.getByRole('link', { name: 'Mes demandes' })).toBeVisible();
  await checkScreen(page, 'menu');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await login(page, 'superadmin');
  for (const [path, heading] of [
    ['/admin/comptes', 'Comptes'],
    ['/admin/categories', 'Catégories'],
    ['/admin/reglages', 'Réglages'],
    ['/admin/journal', 'Journal d’audit'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await checkScreen(page, path);
  }
  await page.goto('/admin/categories');
  await page.getByRole('button', { name: 'Nouvelle catégorie' }).click();
  await expect(page.getByRole('dialog', { name: 'Nouvelle catégorie' })).toBeVisible();
  await checkScreen(page, 'formulaire de catégorie');
});

test('V18 — création (V1), traitement (V5) et fil (V10) au clavier seul', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320', ONLY_320);
  test.slow();
  const title = `Clavier ${Date.now()}`;

  // V1 : création d'une demande vocale sans souris.
  await login(page, 'enseignante');
  await page.goto('/demandes/nouvelle');
  await expect(page.getByRole('heading', { name: 'Nouvelle demande' })).toBeVisible();
  await chooseWithKeyboard(page, page.getByRole('combobox', { name: 'Catégorie' }), 'Photocopies');
  await chooseWithKeyboard(page, page.getByRole('combobox', { name: 'Destinataire' }), 'Reprographie — Reprographie');
  await tabTo(page, page.getByRole('radio', { name: 'Normale' }));
  await page.keyboard.press('Space');
  await expect(page.getByRole('radio', { name: 'Normale' })).toBeChecked();
  await tabTo(page, page.getByLabel('Titre'));
  await page.keyboard.type(title);
  await tabTo(page, page.getByRole('button', { name: 'Enregistrer un message vocal' }));
  await page.keyboard.press('Enter');
  const stop = page.getByRole('button', { name: 'Arrêter l’enregistrement' });
  await expect(stop).toBeVisible();
  await page.waitForTimeout(1500);
  await tabTo(page, stop);
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByRole('button', { name: 'Lire le message vocal' }));
  await tabTo(page, page.getByRole('button', { name: 'Envoyer la demande' }));
  await page.keyboard.press('Enter');
  await expect(page.getByText('Votre demande a été envoyée.')).toBeVisible();
  await expectNoHorizontalScroll(page, 'confirmation');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();

  // V5 : la reprographie ouvre la demande, l'accepte puis la commence, au clavier.
  await login(page, 'reprographie');
  const link = page.getByRole('link', { name: new RegExp(title) });
  await expect(link).toBeVisible();
  await tabTo(page, link, 120);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await tabTo(page, page.getByRole('button', { name: 'Accepter la demande' }));
  await page.keyboard.press('Enter');
  await expect(page.getByText('Acceptée', { exact: true })).toBeVisible();
  await tabTo(page, page.getByRole('button', { name: 'Commencer' }));
  await page.keyboard.press('Enter');
  await expect(page.getByText('En cours', { exact: true })).toBeVisible();

  // V10 : réponse écrite dans le fil.
  await tabTo(page, page.getByLabel('Votre message'), 120);
  await page.keyboard.type('Je m’en occupe ce matin.');
  await tabTo(page, page.getByRole('button', { name: 'Envoyer le message' }));
  await page.keyboard.press('Enter');
  await expect(page.getByText('Je m’en occupe ce matin.')).toBeVisible();
  await checkScreen(page, 'détail après traitement');
});
