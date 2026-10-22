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
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `défilement horizontal sur « ${screen} »`).toBeLessThanOrEqual(0);
}

async function checkScreen(page: Page, screen: string): Promise<void> {
  await expectNoHorizontalScroll(page, screen);
  await expectNoA11yViolations(page);
}

/** Avance au clavier (Tab) jusqu'à l'élément : échoue s'il n'est pas atteignable. */
async function tabTo(page: Page, target: Locator, maxTabs = 60): Promise<void> {
  for (let i = 0; i < maxTabs; i += 1) {
    if (
      await target.evaluate(
        (el) => el === document.activeElement || el.contains(document.activeElement),
      )
    )
      return;
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
  const categories = (await (await page.request.get('/api/categories')).json()) as Array<{
    id: string;
    name: string;
  }>;
  const category = categories.find((c) => c.name === 'Photocopies')!;
  const recipients = (await (
    await page.request.get(`/api/categories/${category.id}/recipients`)
  ).json()) as Array<{ id: string }>;
  const res = await page.request.post('/api/requests', {
    headers: { Origin: origin },
    data: {
      clientId: crypto.randomUUID(),
      title,
      description: 'Contrôle accessibilité',
      categoryId: category.id,
      recipientId: recipients[0].id,
      priority: 'NORMAL',
    },
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

  // Spec 005 : « Mon profil » et changement de mot de passe volontaire (formulaire non soumis).
  await page.goto('/profil');
  await expect(page.getByRole('heading', { name: 'Mon profil' })).toBeVisible();
  await checkScreen(page, 'mon profil');
  await page.goto('/mot-de-passe');
  await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible();
  await checkScreen(page, 'changer mon mot de passe (volontaire)');
  // Page hors gabarit (sans menu) : retour au profil avant la déconnexion.
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByRole('heading', { name: 'Mon profil' })).toBeVisible();

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

test('004 — écrans des affectations à 320 px, sans violation axe', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320', ONLY_320);
  test.slow();
  const visit = async (path: string, heading: string, screen = path) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await checkScreen(page, screen);
  };

  // Enseignante : ses signalements et le formulaire. Une demande pour aujourd'hui, annulée ensuite par
  // l'admin : les listes et le tableau des statistiques ne sont jamais vides (constat T086 : la zone
  // de défilement du tableau n'était pas atteignable au clavier, invisible sur une base vide).
  await login(page, 'enseignante');
  const origin = new URL(page.url()).origin;
  const profile = (await (await page.request.get('/api/coverage/availability')).json()) as {
    schoolDates: { today: string };
  };
  const classes = (await (await page.request.get('/api/coverage/classes')).json()) as Array<{
    id: string;
  }>;
  const created = await page.request.post('/api/coverage/teacher-requests', {
    headers: { Origin: origin },
    data: {
      clientId: crypto.randomUUID(),
      type: 'ABSENCE',
      classId: classes[0].id,
      date: profile.schoolDates.today,
      startTime: '00:00',
      endTime: '23:59',
    },
  });
  expect(created.status()).toBe(201);
  const request = (await created.json()) as { id: string; version: number };
  await visit('/gardes', 'Gardes de classe', 'Mes signalements');
  await visit('/gardes/signaler', 'Signaler un retard ou une absence');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();

  // Surveillant : ses affectations, la déclaration d'une classe vide.
  await login(page, 'surveillant');
  await visit('/gardes', 'Gardes de classe', 'Mes affectations');
  await visit('/gardes?onglet=historique', 'Gardes de classe', 'Historique du surveillant');
  await visit('/gardes/classe-vide', 'Déclarer une classe vide');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();

  // Admin : file, onglets, affectation directe, statistiques.
  await login(page, 'admin');
  await visit('/gardes?onglet=en-attente', 'Gardes de classe', 'file avec une demande');
  // Spec 006 : dialogue « Modifier l’affectation », atteint et parcouru au clavier (FR-013, SC-005).
  await page.goto(`/gardes/${request.id}`);
  await tabTo(page, page.getByRole('button', { name: 'Modifier' }), 120);
  await page.keyboard.press('Enter');
  const edit = page.getByRole('dialog', { name: 'Modifier l’affectation' });
  await expect(edit).toBeVisible();
  await checkScreen(page, 'dialogue de modification');
  await tabTo(page, edit.getByRole('combobox', { name: /^Classe/ }));
  await page.keyboard.press('Escape');
  await expect(edit).toBeHidden();
  const cancelled = await page.request.post(`/api/coverage/${request.id}/actions`, {
    headers: { Origin: origin },
    data: { action: 'CANCEL', version: request.version, reason: 'Contrôle accessibilité' },
  });
  expect(cancelled.ok()).toBeTruthy();
  for (const tab of ['en-attente', 'en-cours', 'doublons', 'equipe', 'terminees']) {
    await visit(`/gardes?onglet=${tab}`, 'Gardes de classe', `onglet ${tab}`);
  }
  await visit('/gardes/nouvelle', 'Nouvelle affectation');
  await visit('/gardes/statistiques', 'Statistiques des affectations');
  await expect(page.getByRole('region', { name: 'Par enseignant' })).toBeVisible();
  await checkScreen(page, 'statistiques avec tableau');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();

  // Super administrateur : étages.
  await login(page, 'superadmin');
  await visit('/admin/etages', 'Étages');
});

test('V18 — création (V1), traitement (V5) et fil (V10) au clavier seul', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320', ONLY_320);
  test.slow();
  const title = `Clavier ${Date.now()}`;

  // V1 : création d'une demande vocale sans souris.
  await login(page, 'enseignante');
  await page.goto('/demandes/nouvelle');
  await expect(page.getByRole('heading', { name: 'Nouvelle demande' })).toBeVisible();
  await chooseWithKeyboard(page, page.getByRole('combobox', { name: 'Catégorie' }), 'Photocopies');
  await chooseWithKeyboard(
    page,
    page.getByRole('combobox', { name: 'Destinataire' }),
    'Reprographie — Reprographie',
  );
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

  // Spec 005 (FR-011) : « Mon profil » puis le changement de mot de passe, au clavier, depuis le tiroir.
  await page.goto('/');
  await tabTo(page, page.getByRole('button', { name: 'Ouvrir le menu' }));
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByRole('link', { name: /^Mon profil : / }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Mon profil' })).toBeVisible();
  await tabTo(page, page.getByRole('link', { name: 'Changer mon mot de passe' }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Changer votre mot de passe' })).toBeVisible();
  await tabTo(page, page.getByRole('button', { name: 'Annuler' }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Mon profil' })).toBeVisible();
});

test('007 — brouillons à 320 px : enregistrement au clavier, page brouillon, onglet, suppression', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320', ONLY_320);
  test.slow();
  const title = `Brouillon 320 px ${Date.now()}`;

  // FR-010 : « Enregistrer en brouillon » atteint et actionné au clavier seul.
  await login(page, 'enseignante');
  await page.goto('/demandes/nouvelle');
  await expect(page.getByRole('heading', { name: 'Nouvelle demande' })).toBeVisible();
  await chooseWithKeyboard(page, page.getByRole('combobox', { name: 'Catégorie' }), 'Photocopies');
  await tabTo(page, page.getByLabel('Titre'));
  await page.keyboard.type(title);
  await tabTo(page, page.getByRole('button', { name: 'Enregistrer en brouillon' }));
  await page.keyboard.press('Enter');
  await expect(page.getByText('Brouillon enregistré.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Brouillon de demande' })).toBeVisible();
  await expect(page.getByLabel('Titre')).toHaveValue(title);
  await checkScreen(page, 'page brouillon');

  await page.goto('/?onglet=brouillons');
  await expect(page.getByRole('tab', { name: 'Brouillons' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();
  await checkScreen(page, 'onglet brouillons');

  // Confirmation de suppression, puis suppression (le brouillon ne reste pas dans la base e2e).
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await page.getByRole('button', { name: 'Supprimer le brouillon' }).click();
  const dialog = page.getByRole('dialog', { name: 'Supprimer ce brouillon ?' });
  await expect(dialog).toBeVisible();
  await checkScreen(page, 'confirmation de suppression du brouillon');
  await dialog.getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByText('Brouillon supprimé.')).toBeVisible();
});
