import { expect, test, type Browser, type BrowserContextOptions, type Page, type TestInfo } from '@playwright/test';
import type { AccountName } from './support/accounts';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * 018 — Gestion multi-administrateurs (specs/018-multi-admin-transferts). Lot 1 : file commune et prise
 * en charge. Lot 2 : demande de reprise et délégation entre administrateurs. Chaque projet crée son
 * second administrateur et sa propre catégorie : aucune donnée partagée (catégories de démonstration,
 * compte « admin ») n'est modifiée.
 */

const SECOND_ADMIN_PASSWORD = 'MotDePasse-Admin2-2026!';

interface Setup {
  categoryId: string;
  secondAdmin: { username: string; displayName: string; temporaryPassword: string };
  adminName: string;
}

async function pageAs(browser: Browser, testInfo: TestInfo, account: AccountName): Promise<Page> {
  const context = await browser.newContext(testInfo.project.use as BrowserContextOptions);
  const page = await context.newPage();
  await login(page, account);
  return page;
}

/** Appel d'API authentifié par la session de la page, avec l'en-tête Origin exigé par le serveur. */
function api(page: Page) {
  const headers = { Origin: new URL(page.url()).origin };
  return {
    get: (url: string) => page.request.get(url),
    post: (url: string, data: Record<string, unknown> = {}) => page.request.post(url, { headers, data }),
    put: (url: string, data: Record<string, unknown>) => page.request.put(url, { headers, data }),
  };
}

/** Par l'API, en super administrateur : un second compte Admin et une catégorie « via l'administration » partagée. */
async function prepare(superadmin: Page, marker: string): Promise<Setup> {
  const call = api(superadmin);
  const ok = async (res: Awaited<ReturnType<typeof call.post>>, what: string) => {
    expect(res.ok(), `${what} : ${res.status()} ${await res.text()}`).toBe(true);
    return res.json();
  };

  const username = `admin2.${marker}`;
  const displayName = `Seconde admin ${marker}`;
  const account = (await ok(
    await call.post('/api/admin/users', { username, displayName, jobTitle: 'Administration', role: 'ADMIN' }),
    'création du second admin',
  )) as { user: { id: string }; temporaryPassword: string };

  const users = (await ok(await call.get('/api/admin/users?limit=100'), 'liste des comptes')) as {
    items: Array<{ id: string; username: string; displayName: string }>;
  };
  const byUsername = (name: string) => users.items.find((u) => u.username === name)!;
  const admin = byUsername('admin');
  const reprographie = byUsername('reprographie');

  const name = `Travaux partagés ${marker}`.slice(0, 60);
  await ok(
    await call.post('/api/admin/categories', { name, routingMode: 'VIA_ADMIN', creatorRoles: ['EMPLOYEE'], closureMode: 'MANAGER' }),
    'création de la catégorie',
  );
  const categories = (await ok(await call.get('/api/admin/categories'), 'liste des catégories')) as Array<{ id: string; name: string }>;
  const categoryId = categories.find((c) => c.name === name)!.id;
  await ok(await call.put(`/api/admin/categories/${categoryId}/recipients`, { userIds: [reprographie.id] }), 'destinataires');
  await ok(await call.put(`/api/admin/categories/${categoryId}/managers`, { userIds: [admin.id, account.user.id] }), 'admins de la catégorie');

  return { categoryId, secondAdmin: { username, displayName, temporaryPassword: account.temporaryPassword }, adminName: admin.displayName };
}

/** Première connexion du second admin : mot de passe provisoire, puis mot de passe choisi. */
async function secondAdminPage(browser: Browser, testInfo: TestInfo, setup: Setup): Promise<Page> {
  const context = await browser.newContext(testInfo.project.use as BrowserContextOptions);
  const page = await context.newPage();
  await page.goto('/connexion');
  await page.getByLabel('Identifiant').fill(setup.secondAdmin.username);
  await page.getByLabel('Mot de passe', { exact: true }).fill(setup.secondAdmin.temporaryPassword);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: 'Changer votre mot de passe' })).toBeVisible();
  await page.getByLabel('Mot de passe actuel').fill(setup.secondAdmin.temporaryPassword);
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(SECOND_ADMIN_PASSWORD);
  await page.getByLabel('Confirmer le nouveau mot de passe').fill(SECOND_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
  await expect(page).not.toHaveURL(/\/(mot-de-passe|connexion)$/);
  return page;
}

async function submit(teacher: Page, categoryId: string, title: string): Promise<{ id: string; version: number }> {
  const res = await api(teacher).post('/api/requests', {
    clientId: crypto.randomUUID(),
    title,
    description: 'Salle 12, le tableau ne tient plus au mur.',
    categoryId,
    priority: 'NORMAL',
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; version: number };
}

async function openNavigation(page: Page): Promise<void> {
  const menu = page.getByRole('button', { name: 'Ouvrir le menu' });
  if (await menu.isVisible()) await menu.click();
}

test('018 lot 1 — file commune : le premier administrateur prend la demande, le second ne peut plus la prendre ni la modifier', async ({
  page,
  browser,
}, testInfo) => {
  test.slow(); // quatre utilisateurs et plusieurs navigateurs à la suite
  const marker = `${testInfo.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
  const title = `Refixer le tableau [${marker}]`;

  // Préparation : second admin et catégorie partagée, par le super administrateur.
  await login(page, 'superadmin');
  const setup = await prepare(page, marker);
  await page.context().clearCookies();

  // 1. Une enseignante crée une demande.
  const teacher = await pageAs(browser, testInfo, 'enseignante');
  const { id, version } = await submit(teacher, setup.categoryId, title);

  // 13. Un employé est refusé sur les routes de l'espace de travail.
  for (const url of ['/api/admin/requests/available', '/api/admin/requests/mine', '/api/admin/requests/summary']) {
    expect((await teacher.request.get(url)).status(), url).toBe(403);
  }
  expect((await api(teacher).post(`/api/admin/requests/${id}/claim`, { version })).status()).toBe(403);
  await teacher.context().close();

  // 2. Les deux administrateurs consultent la file commune.
  const first = await pageAs(browser, testInfo, 'admin');
  const second = await secondAdminPage(browser, testInfo, setup);
  await openNavigation(first);
  await first.getByRole('link', { name: 'Espace de travail', exact: true }).click();
  await expect(first.getByRole('heading', { level: 1, name: 'Espace de travail' })).toBeVisible();
  await expect(first.getByRole('link', { name: /^Demandes disponibles : \d+/ })).toBeVisible();
  await expectNoA11yViolations(first);
  await first.getByRole('navigation', { name: 'Rubriques de l’espace de travail' }).getByRole('link', { name: 'File commune' }).click();

  await second.goto('/espace/file');
  for (const admin of [first, second]) {
    const card = admin.getByRole('article', { name: title });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Salle 12, le tableau ne tient plus au mur.');
    await expect(card).toContainText('En attente de validation administrative');
    await expect(card.getByRole('button', { name: `Prendre en charge : ${title}` })).toBeVisible();
  }
  await expectNoA11yViolations(first);
  // Pas de défilement horizontal, y compris à 320 px.
  expect(await first.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  // 3. Le premier prend la demande, après confirmation.
  await first.getByRole('button', { name: `Prendre en charge : ${title}` }).click();
  const dialog = first.getByRole('dialog', { name: 'Prendre en charge cette demande ?' });
  await expect(dialog).toContainText(title);
  await expectNoA11yViolations(first);
  await dialog.getByRole('button', { name: 'Prendre en charge' }).click();
  await expect(first).toHaveURL(new RegExp(`/demandes/${id}$`));
  await expect(first.getByRole('heading', { name: title })).toBeVisible();
  await expect(first.getByText('Prise en charge par')).toBeVisible();
  await expect(first.getByRole('button', { name: 'Approuver' })).toBeVisible();

  // 4. Chez le second, la demande quitte la file commune sans rechargement (temps réel).
  await expect(second.getByRole('article', { name: title })).toBeHidden();

  // Le second la lit, sait qui s'en occupe, mais n'a aucune action.
  await second.goto(`/demandes/${id}`);
  await expect(second.getByRole('heading', { name: title })).toBeVisible();
  await expect(second.getByText(`${setup.adminName} a pris cette demande en charge : vous la consultez en lecture seule.`)).toBeVisible();
  await expect(second.getByRole('button', { name: 'Approuver' })).toHaveCount(0);
  await expect(second.getByRole('button', { name: 'Refuser' })).toHaveCount(0);
  await expect(second.getByRole('button', { name: 'Prendre en charge' })).toHaveCount(0);
  await expectNoA11yViolations(second);

  // 4 et 14. Même en appelant l'API directement, il ne peut ni la prendre ni la modifier.
  const current = (await (await second.request.get(`/api/requests/${id}`)).json()) as { version: number; adminOwner: { displayName: string } };
  expect(current.adminOwner.displayName).toBe(setup.adminName);
  const stolen = await api(second).post(`/api/admin/requests/${id}/claim`, { version: current.version });
  expect(stolen.status()).toBe(409);
  expect(((await stolen.json()) as { error: { code: string } }).error.code).toBe('REQUEST_ALREADY_CLAIMED');
  const rejected = await api(second).post(`/api/requests/${id}/actions`, { action: 'REJECT', version: current.version, reason: 'Non.' });
  expect(rejected.status()).toBe(403);
  const after = (await (await second.request.get(`/api/requests/${id}`)).json()) as { status: string; version: number };
  expect(after).toMatchObject({ status: 'PENDING_ADMIN_VALIDATION', version: current.version });

  // Espace du premier : la demande est dans « Mes demandes » et « Demandes en cours », l'opération dans son historique.
  await first.goto('/espace/mes-demandes');
  await expect(first.getByRole('article', { name: title })).toBeVisible();
  await expectNoA11yViolations(first);
  await first.goto('/espace/en-cours');
  await expect(first.getByRole('article', { name: title })).toBeVisible();
  await first.goto('/espace/terminees');
  await expect(first.getByRole('heading', { level: 2, name: 'Demandes terminées' })).toBeVisible();
  await expect(first.getByRole('article', { name: title })).toHaveCount(0);
  await first.goto('/espace/historique');
  const entry = first.getByRole('listitem').filter({ hasText: title });
  await expect(entry).toContainText('Prise en charge');
  await expectNoA11yViolations(first);

  // Espace du second : rien à sa charge.
  await second.goto('/espace/mes-demandes');
  await expect(second.getByRole('heading', { level: 2, name: 'Mes demandes' })).toBeVisible();
  await expect(second.getByRole('article', { name: title })).toHaveCount(0);

  await first.context().close();
  await second.context().close();
});

type CollaborationSection = 'Demandes reçues' | 'Demandes envoyées' | 'Historique des transferts';

/** Ouvre « Collaboration » et renvoie les cartes des propositions portant sur la demande, dans la section voulue. */
async function proposalCards(page: Page, section: CollaborationSection, title: string) {
  await page.goto('/espace/collaboration');
  await expect(page.getByRole('heading', { level: 2, name: 'Collaboration' })).toBeVisible();
  // Chaque section est une région nommée par son titre : la page entière, elle, s'appelle « Collaboration ».
  return page.getByRole('region', { name: section, exact: true }).getByRole('article', { name: title });
}

async function answer(page: Page, title: string, action: 'Accepter' | 'Refuser', reason?: string): Promise<void> {
  const card = await proposalCards(page, 'Demandes reçues', title);
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: action + ' : ' + title }).click();
  const dialog = page.getByRole('dialog', { name: action === 'Accepter' ? 'Accepter cette proposition ?' : 'Refuser cette proposition ?' });
  await expect(dialog).toContainText(title);
  if (reason) await dialog.getByLabel('Motif du refus (facultatif)').fill(reason);
  await dialog.getByRole('button', { name: action === 'Accepter' ? 'Accepter' : 'Confirmer le refus' }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toBeHidden();
}

test('018 lot 2 — demande de reprise acceptée, délégation refusée puis acceptée : rien ne change de mains sans accord', async ({
  page,
  browser,
}, testInfo) => {
  test.slow(); // quatre utilisateurs et plusieurs navigateurs à la suite
  const marker = testInfo.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
  const title = 'Changer la serrure [' + marker + ']';

  await login(page, 'superadmin');
  const setup = await prepare(page, marker);
  await page.context().clearCookies();

  const teacher = await pageAs(browser, testInfo, 'enseignante');
  const { id, version } = await submit(teacher, setup.categoryId, title);
  await teacher.context().close();

  const first = await pageAs(browser, testInfo, 'admin');
  const second = await secondAdminPage(browser, testInfo, setup);
  expect((await api(first).post('/api/admin/requests/' + id + '/claim', { version })).status()).toBe(200);
  const ownerName = async (viewer: Page) =>
    ((await (await viewer.request.get('/api/requests/' + id)).json()) as { adminOwner: { displayName: string } }).adminOwner.displayName;

  // 5. Le second demande la reprise au premier, avec un motif.
  await second.goto('/demandes/' + id);
  await second.getByRole('button', { name: 'Demander la reprise' }).click();
  const takeover = second.getByRole('dialog', { name: 'Demander la reprise' });
  await takeover.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(takeover.getByText('Le motif est obligatoire.')).toBeVisible();
  await takeover.getByLabel(/^Motif/).fill('Je connais déjà ce fournisseur.');
  await expectNoA11yViolations(second);
  await takeover.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(takeover).toBeHidden();
  const pending = second.getByRole('region', { name: 'Proposition de transfert en attente', exact: true });
  await expect(pending.getByRole('article', { name: title })).toContainText('Demande de reprise');
  await expect(pending.getByRole('button', { name: 'Annuler la proposition : ' + title })).toBeVisible();
  await expect(second.getByRole('button', { name: 'Demander la reprise' })).toHaveCount(0);
  // Tant que le premier n'a pas répondu, rien ne change.
  expect(await ownerName(second)).toBe(setup.adminName);

  // 6. Le premier voit la proposition (qui, à qui, quoi, pourquoi, délai restant) et l'accepte.
  const received = await proposalCards(first, 'Demandes reçues', title);
  await expect(received).toContainText('Demande de reprise');
  await expect(received).toContainText(setup.secondAdmin.displayName);
  await expect(received).toContainText('Je connais déjà ce fournisseur.');
  await expect(received).toContainText(/Réponse attendue sous 1 h 5\d/);
  await expectNoA11yViolations(first);
  expect(await first.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await answer(first, title, 'Accepter');

  // 7. Le second devient responsable : la demande est dans son espace, plus dans celui du premier.
  expect(await ownerName(first)).toBe(setup.secondAdmin.displayName);
  await second.goto('/espace/mes-demandes');
  await expect(second.getByRole('article', { name: title })).toBeVisible();
  await first.goto('/espace/mes-demandes');
  await expect(first.getByRole('heading', { level: 2, name: 'Mes demandes' })).toBeVisible();
  await expect(first.getByRole('article', { name: title })).toHaveCount(0);

  // 8. Le second (responsable) propose de déléguer la demande au premier.
  const delegate = async (reason: string) => {
    await second.goto('/demandes/' + id);
    await second.getByRole('button', { name: 'Proposer une délégation' }).click();
    const dialog = second.getByRole('dialog', { name: 'Proposer une délégation' });
    await dialog.getByRole('combobox', { name: 'Administrateur destinataire' }).click();
    await second.getByRole('option', { name: new RegExp('^' + setup.adminName) }).click();
    await dialog.getByLabel(/^Motif/).fill(reason);
    await dialog.getByRole('button', { name: 'Envoyer la proposition' }).click();
    await expect(dialog).toBeHidden();
  };
  await delegate('Je pars en réunion jusqu’à midi.');
  await expectNoA11yViolations(second);

  // 9. Le premier refuse, avec un motif.
  await answer(first, title, 'Refuser', 'Je suis déjà sur trois urgences.');

  // 10. Le second conserve la demande ; le refus et son motif sont dans son historique des transferts.
  expect(await ownerName(first)).toBe(setup.secondAdmin.displayName);
  await second.goto('/espace/mes-demandes');
  await expect(second.getByRole('article', { name: title })).toBeVisible();
  const refused = (await proposalCards(second, 'Historique des transferts', title)).filter({ hasText: 'Refusée' });
  await expect(refused).toContainText('Je suis déjà sur trois urgences.');
  await expectNoA11yViolations(second);

  // 11. Une autre délégation, acceptée cette fois : le premier redevient responsable.
  await delegate('Je quitte l’établissement cet après-midi.');
  await answer(first, title, 'Accepter');
  expect(await ownerName(second)).toBe(setup.adminName);
  await first.goto('/espace/mes-demandes');
  await expect(first.getByRole('article', { name: title })).toBeVisible();
  await first.goto('/demandes/' + id);
  await expect(first.getByRole('button', { name: 'Approuver' })).toBeVisible();

  // Traçabilité : les deux changements de mains et la prise en charge figurent dans l'historique du premier.
  await first.goto('/espace/historique');
  const lines = first.getByRole('listitem').filter({ hasText: title });
  await expect(lines.filter({ hasText: 'Transférée' })).toHaveCount(2);
  await expect(lines.filter({ hasText: 'Prise en charge' })).toHaveCount(1);

  await first.context().close();
  await second.context().close();
});

test('018 lot 3 — le super administrateur supervise et réattribue une demande ; admin et employé sont refusés', async ({
  page,
  browser,
}, testInfo) => {
  test.slow(); // quatre utilisateurs et plusieurs navigateurs à la suite
  const marker = testInfo.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
  const title = 'Remplacer le néon [' + marker + ']';

  // Le super administrateur garde sa session : c'est lui qui supervise.
  await login(page, 'superadmin');
  const setup = await prepare(page, marker);

  const teacher = await pageAs(browser, testInfo, 'enseignante');
  const { id, version } = await submit(teacher, setup.categoryId, title);

  const first = await pageAs(browser, testInfo, 'admin');
  const second = await secondAdminPage(browser, testInfo, setup);
  expect((await api(first).post('/api/admin/requests/' + id + '/claim', { version })).status()).toBe(200);

  // 13. Un employé et un administrateur sont refusés sur la supervision et la réattribution.
  for (const outsider of [teacher, first]) {
    for (const url of ['/api/super-admin/requests', '/api/super-admin/administrators', '/api/super-admin/transfers']) {
      expect((await outsider.request.get(url)).status(), url).toBe(403);
    }
    const forced = await api(outsider).post('/api/super-admin/requests/' + id + '/reassign', { adminId: null, reason: 'Je la libère.' });
    expect(forced.status()).toBe(403);
  }
  await teacher.context().close();
  await first.goto('/admin/supervision');
  await expect(first.getByText('Accès réservé au super administrateur.')).toBeVisible();

  // 12. Le super administrateur ouvre la supervision et retrouve la demande avec la personne qui l'a prise en charge.
  await openNavigation(page);
  await page.getByRole('link', { name: 'Administrateur', exact: true }).click();
  await page.getByRole('navigation', { name: 'Sections de l’espace Administrateur' }).getByRole('link', { name: 'Supervision' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Supervision' })).toBeVisible();
  const row = page.getByRole('article', { name: title });
  await expect(row).toContainText(setup.adminName);
  await expect(row).toContainText('En attente de validation administrative');
  await expectNoA11yViolations(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  // Réattribution : cible et motif obligatoires, puis effet immédiat.
  await row.getByRole('button', { name: 'Réattribuer : ' + title }).click();
  const dialog = page.getByRole('dialog', { name: 'Réattribuer la demande' });
  await expect(dialog).toContainText('Actuellement prise en charge par ' + setup.adminName);
  await dialog.getByRole('button', { name: 'Réattribuer' }).click();
  await expect(dialog.getByText('Le motif est obligatoire.')).toBeVisible();
  await expect(dialog.getByText('Choisissez un administrateur, ou la remise dans la file commune.')).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Nouvelle attribution' }).click();
  await page.getByRole('option', { name: new RegExp('^' + setup.secondAdmin.displayName) }).click();
  await dialog.getByLabel(/^Motif/).fill('Absence imprévue cette semaine.');
  await expectNoA11yViolations(page);
  await dialog.getByRole('button', { name: 'Réattribuer' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText(setup.secondAdmin.displayName);

  // Le nouveau responsable a la demande dans son espace et peut la traiter ; l'ancien la consulte.
  await second.goto('/espace/mes-demandes');
  await expect(second.getByRole('article', { name: title })).toBeVisible();
  await second.goto('/demandes/' + id);
  await expect(second.getByRole('button', { name: 'Approuver' })).toBeVisible();
  await first.goto('/demandes/' + id);
  await expect(first.getByText(setup.secondAdmin.displayName + ' a pris cette demande en charge : vous la consultez en lecture seule.')).toBeVisible();
  await expect(first.getByRole('button', { name: 'Approuver' })).toHaveCount(0);

  // L'ancien responsable reste dans l'historique ; l'opération est au journal d'audit, sans le texte du motif.
  await second.goto('/espace/historique');
  const line = second.getByRole('listitem').filter({ hasText: title }).filter({ hasText: 'Réattribuée' });
  await expect(line).toContainText(setup.adminName);
  await expect(line).toContainText('Absence imprévue cette semaine.');
  const audit = (await (await page.request.get('/api/admin/audit?action=REQUEST_MANAGED&limit=50')).json()) as {
    items: Array<{ targetId: string | null; details: { action?: string } | null }>;
  };
  const entry = audit.items.find((e) => e.targetId === id && e.details?.action === 'OWNER_REASSIGNED');
  expect(entry, 'entrée d’audit de la réattribution').toBeTruthy();
  expect(JSON.stringify(entry)).not.toContain('Absence imprévue');

  // Les autres vues de la supervision : charge des administrateurs, propositions de transfert.
  await page.getByRole('tab', { name: 'Administrateurs' }).click();
  await expect(page.getByRole('article', { name: setup.secondAdmin.displayName })).toContainText('Actif');
  await expectNoA11yViolations(page);
  await page.getByRole('tab', { name: 'Transferts' }).click();
  await expect(page.getByRole('combobox', { name: 'Statut des propositions' })).toBeVisible();
  await expectNoA11yViolations(page);

  await first.context().close();
  await second.context().close();
});
