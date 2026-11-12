import {
  expect,
  test,
  type Browser,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from '@playwright/test';
import type { AccountName } from './support/accounts';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * 017 (T070) — Communications centrées sur l'administration. L'enseignante signale par un vocal ; la
 * surveillante générale (ADMIN) écoute, répond, puis « Contacter le parent » : son message part à la
 * validation ; le super administrateur l'approuve ; le parent le lit signé « L'école » et répond ; la
 * réponse arrive dans la boîte de réception. Le parent n'atteint jamais la conversation interne.
 * Rejouable : classe, élève, représentant et compte parent uniques.
 */

const PARENT_PASSWORD = 'Parent-mot-de-passe-2026!';

async function pageAs(browser: Browser, testInfo: TestInfo, account: AccountName): Promise<Page> {
  const context = await browser.newContext(testInfo.project.use as BrowserContextOptions);
  const page = await context.newPage();
  await login(page, account);
  return page;
}

/** Données de référence par l'API (super administrateur) : classe, élève, représentant et compte parent. */
async function prepare(page: Page, marker: number) {
  const headers = { Origin: new URL(page.url()).origin };
  const call = async (method: 'post' | 'put', url: string, data: Record<string, unknown>) => {
    const res = await page.request[method](url, { headers, data });
    expect(res.ok(), `${method.toUpperCase()} ${url} : ${res.status()}`).toBe(true);
    return res.json();
  };
  const levelName = `Niveau comm ${marker}`;
  const className = `Classe comm ${marker}`;
  const levels = (await call('post', '/api/admin/levels', {
    name: levelName,
    cycle: 'PRIMARY',
    position: (marker % 900) + 50,
  })) as Array<{ id: string; name: string }>;
  const floors = (await (await page.request.get('/api/admin/floors')).json()) as Array<{
    id: string;
  }>;
  const classes = (await call('post', '/api/admin/coverage/classes', {
    name: className,
    floorId: floors[0]!.id,
    levelId: levels.find((l) => l.name === levelName)!.id,
  })) as Array<{ id: string; name: string }>;
  const classId = classes.find((c) => c.name === className)!.id;
  const student = { firstName: 'Lina', lastName: `Comm${marker}` };
  const created = (await call('post', '/api/admin/students', {
    ...student,
    classId,
    parentPhone: '06 12 34 56 78',
    mealService: 'CANTINE',
  })) as { id: string } | Array<{ id: string; lastName: string }>;
  const studentId = Array.isArray(created)
    ? created.find((s) => s.lastName === student.lastName)!.id
    : created.id;
  const guardian = (await call('post', '/api/admin/guardians', {
    firstName: 'Sonia',
    lastName: `Comm${marker}`,
    relationship: 'Mère',
    studentIds: [studentId],
  })) as { id: string };
  const username = `parent.comm.${marker}`;
  const account = (await call('post', `/api/admin/guardians/${guardian.id}/account`, {
    username,
  })) as {
    temporaryPassword: string;
  };
  const teachers = (await (await page.request.get('/api/admin/teacher-classes')).json()) as Array<{
    teacher: { id: string; displayName: string };
    classIds: string[];
  }>;
  const me =
    teachers.find((t) => t.teacher.displayName.toLowerCase().includes('enseignante')) ??
    teachers[0]!;
  await call('put', `/api/admin/teacher-classes/${me.teacher.id}`, {
    classIds: [...me.classIds, classId],
  });
  return {
    studentName: `${student.firstName} ${student.lastName}`,
    guardianName: `Sonia Comm${marker}`,
    username,
    temporaryPassword: account.temporaryPassword,
  };
}

async function parentFirstLogin(
  browser: Browser,
  testInfo: TestInfo,
  username: string,
  temporary: string,
): Promise<Page> {
  const context = await browser.newContext(testInfo.project.use as BrowserContextOptions);
  const page = await context.newPage();
  await page.goto('/connexion');
  await page.getByLabel('Identifiant').fill(username);
  await page.getByLabel('Mot de passe', { exact: true }).fill(temporary);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: 'Changer votre mot de passe' })).toBeVisible();
  await page.getByLabel('Mot de passe actuel').fill(temporary);
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(PARENT_PASSWORD);
  await page.getByLabel('Confirmer le nouveau mot de passe').fill(PARENT_PASSWORD);
  await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Messages de l’école' })).toBeVisible();
  return page;
}

async function recordVoice(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Enregistrer un message vocal' }).click();
  await expect(page.getByRole('button', { name: 'Arrêter l’enregistrement' })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Arrêter l’enregistrement' }).click();
}

test('017 — signalement, réponse, « Contacter le parent », validation, lecture et réponse du parent', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium',
    'Parcours complet à quatre utilisateurs (Chromium, micro simulé)',
  );
  test.setTimeout(240_000);
  const answer = `Bien reçu, je m’en occupe (${Date.now()}).`;
  const toParent = `Pouvons-nous parler de Lina jeudi ? (${Date.now()})`;
  const parentReply = `Oui, jeudi 17 h nous convient (${Date.now()}).`;

  await login(page, 'superadmin');
  const data = await prepare(page, Date.now());

  // Enseignante : « Communications » (formulaire prêt) → élève cherché → vocal seul → envoyé directement.
  const teacher = await pageAs(browser, testInfo, 'enseignante');
  await teacher
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Communications' })
    .click();
  await expect(teacher.getByRole('heading', { level: 1, name: 'Communications' })).toBeVisible();
  await expectNoA11yViolations(teacher);
  await teacher.getByRole('combobox', { name: 'Élève' }).fill(data.studentName);
  await teacher.getByRole('option', { name: new RegExp(data.studentName) }).click();
  await recordVoice(teacher);
  await teacher.getByRole('button', { name: 'Envoyer' }).click();
  await expect(teacher).toHaveURL(/\/communications\?conversation=[0-9a-f-]{36}$/);
  const internalId = new URL(teacher.url()).searchParams.get('conversation')!;
  await expect(teacher.getByRole('article').getByText('Envoyé', { exact: true })).toBeVisible();

  // Surveillante générale : boîte de réception, écoute du vocal, réponse, puis « Contacter le parent ».
  const admin = await pageAs(browser, testInfo, 'admin');
  await admin
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Communications' })
    .click();
  // Page unique : la boîte de réception est l'onglet par défaut, sans navigation intermédiaire.
  await expect(admin.getByRole('tab', { name: /Boîte de réception/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const line = admin
    .getByRole('list', { name: 'Conversations' })
    .getByRole('link')
    .filter({ hasText: data.studentName });
  await expect(line).toContainText('Interne');
  await line.click();
  const audio = admin.getByRole('article').locator('audio');
  await expect(audio).toHaveAttribute('src', /^\/api\/files\//);
  expect((await admin.request.get((await audio.getAttribute('src'))!)).status()).toBe(200);
  await admin.getByRole('textbox', { name: 'Votre message' }).fill(answer);
  await admin.getByRole('button', { name: 'Envoyer' }).click();
  await expect(admin.getByRole('article').filter({ hasText: answer })).toBeVisible();
  await expectNoA11yViolations(admin);

  await admin.getByRole('button', { name: 'Contacter le parent' }).click();
  // Le panneau « Nouveau message » s'ouvre par-dessus la page, élève et signalement préremplis.
  await expect(admin).toHaveURL(/\/communications\?.*nouveau.*type=PARENT/);
  const drawer = admin.getByRole('dialog', { name: 'Nouveau message' });
  await drawer.getByRole('radio', { name: new RegExp(data.guardianName) }).check();
  await drawer.getByRole('textbox', { name: 'Votre message' }).fill(toParent);
  await drawer.getByRole('button', { name: 'Envoyer pour validation' }).click();
  await expect(drawer).toBeHidden();
  await expect(
    admin
      .getByRole('article')
      .filter({ hasText: toParent })
      .getByText('En attente de validation', { exact: true }),
  ).toBeVisible();
  await admin.context().close();

  // L'enseignante voit la réponse signée « Administration (…) ».
  await teacher.reload();
  await expect(teacher.getByRole('article').filter({ hasText: answer })).toContainText(
    'Administration (',
  );
  await teacher.context().close();

  // Parent, avant l'approbation : le message de l'école n'est pas visible ; la conversation interne non plus.
  const parent = await parentFirstLogin(browser, testInfo, data.username, data.temporaryPassword);
  await expect(parent.getByText(toParent)).toHaveCount(0);
  expect(
    (await parent.request.get(`/api/parent/messages/conversations/${internalId}`)).status(),
  ).toBe(404);
  await parent.goto(`/messages-ecole/conversations/${internalId}`);
  await expect(parent.getByText('Cette conversation est introuvable.')).toBeVisible();

  // Super administrateur : « À valider » → approbation de la version examinée.
  await page.goto('/communications/a-valider');
  await page
    .getByRole('list', { name: 'Messages à valider' })
    .getByRole('link')
    .filter({ hasText: data.studentName })
    .click();
  await expect(page.getByText(toParent)).toBeVisible();
  await page.getByRole('button', { name: 'Approuver' }).click();
  await expect(page.getByText('Validé et transmis', { exact: true }).first()).toBeVisible();

  // Parent : message signé « L'école », non lu puis lu ; réponse envoyée directement.
  await parent.goto('/messages-ecole');
  const link = parent
    .getByRole('list', { name: 'Conversations' })
    .getByRole('link')
    .filter({ hasText: data.studentName });
  await expect(link.getByLabel('1 message non lu')).toBeVisible();
  await expect(link).toContainText('L’école');
  await link.click();
  const received = parent.getByRole('article').filter({ hasText: toParent });
  await expect(received).toContainText('L’école');
  await expectNoA11yViolations(parent);
  await parent.getByRole('textbox', { name: 'Votre message' }).fill(parentReply);
  await parent.getByRole('button', { name: 'Envoyer' }).click();
  await expect(
    parent
      .getByRole('article')
      .filter({ hasText: parentReply })
      .getByText('Envoyé', { exact: true }),
  ).toBeVisible();
  await parent.context().close();

  // La réponse du parent arrive dans la boîte de réception, type « Famille ».
  await page.goto('/communications/boite');
  await expect(
    page
      .getByRole('list', { name: 'Conversations' })
      .getByRole('link')
      .filter({ hasText: data.studentName }),
  ).toContainText('Famille');
});

test('017 — écrans « Communications » à 320 px : sans défilement horizontal ni violation axe', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320', 'Vérification de largeur minimale');
  await login(page, 'enseignante');
  for (const path of ['/communications', '/communications?nouveau']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expectNoA11yViolations(page);
  }
});

test('017 — « Communications » de l’administration à 320 px : sans défilement horizontal ni violation axe', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320', 'Vérification de largeur minimale');
  await login(page, 'admin');
  for (const path of [
    '/communications',
    '/communications?vue=conversations',
    '/communications?nouveau',
  ]) {
    await page.goto(path);
    // Le panneau « Nouveau message » est une modale : le reste de la page est alors masqué (aria-hidden).
    await expect(
      path.endsWith('nouveau')
        ? page.getByRole('dialog', { name: 'Nouveau message' })
        : page.getByRole('heading', { level: 1, name: 'Communications' }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expectNoA11yViolations(page);
  }
});
