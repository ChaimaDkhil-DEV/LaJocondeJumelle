import {
  expect,
  test,
  type Browser,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from '@playwright/test';
import type { AccountName } from './support/accounts';
import { login } from './support/login';

/**
 * 015 (T050) — Communication enseignant / parents : l'enseignante écrit et enregistre un vocal, soumet ;
 * rien n'est visible du parent avant l'approbation ; la direction examine et approuve ; le parent lit le
 * message et l'écoute, puis il est marqué lu. Rejouable : élève, représentant et compte parent uniques.
 */

const PARENT_PASSWORD = 'Parent-mot-de-passe-2026!';

async function pageAs(browser: Browser, testInfo: TestInfo, account: AccountName): Promise<Page> {
  const context = await browser.newContext(testInfo.project.use as BrowserContextOptions);
  const page = await context.newPage();
  await login(page, account);
  return page;
}

/** Données de référence par l'API (direction) : classe, élève, représentant et compte parent, classe de l'enseignante. */
async function prepare(page: Page, marker: number) {
  const headers = { Origin: new URL(page.url()).origin };
  const call = async (method: 'post' | 'put', url: string, data: Record<string, unknown>) => {
    const res = await page.request[method](url, { headers, data });
    expect(res.ok(), `${method.toUpperCase()} ${url} : ${res.status()}`).toBe(true);
    return res.json();
  };
  const levelName = `Niveau parents ${marker}`;
  const className = `Classe parents ${marker}`;
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
  const student = { firstName: 'Lina', lastName: `Parents${marker}` };
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
    lastName: `Parents${marker}`,
    relationship: 'Mère',
    studentIds: [studentId],
  })) as { id: string };
  const username = `parent.${marker}`;
  const account = (await call('post', `/api/admin/guardians/${guardian.id}/account`, {
    username,
  })) as { temporaryPassword: string };

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
    guardianName: `Sonia Parents${marker}`,
    username,
    temporaryPassword: account.temporaryPassword,
  };
}

/** Première connexion du parent : mot de passe provisoire, puis changement obligatoire. */
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

test('015 — l’enseignante soumet, la direction approuve, le parent lit et écoute', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium',
    'Parcours complet à trois utilisateurs (Chromium, micro simulé)',
  );
  test.setTimeout(180_000);
  const remark = `Lina a beaucoup progressé en lecture ce trimestre (${Date.now()}).`;

  await login(page, 'superadmin');
  const data = await prepare(page, Date.now());
  await page.context().close();

  // Enseignante : remarque écrite + vocal, soumission confirmée.
  const teacher = await pageAs(browser, testInfo, 'enseignante');
  await teacher
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Parents' })
    .click();
  await expect(
    teacher.getByRole('heading', { level: 1, name: 'Communication avec les parents' }),
  ).toBeVisible();
  await teacher.getByRole('link', { name: 'Nouvelle communication' }).click();
  await teacher.getByRole('combobox', { name: 'Élève' }).click();
  await teacher.getByRole('option', { name: new RegExp(data.studentName) }).click();
  await teacher.getByRole('combobox', { name: 'Représentant destinataire' }).click();
  await teacher.getByRole('option', { name: new RegExp(data.guardianName) }).click();
  await teacher.getByRole('textbox', { name: 'Remarque écrite' }).fill(remark);
  await teacher.getByRole('button', { name: 'Enregistrer un message vocal' }).click();
  await expect(teacher.getByRole('button', { name: 'Arrêter l’enregistrement' })).toBeVisible();
  await teacher.waitForTimeout(2000);
  await teacher.getByRole('button', { name: 'Arrêter l’enregistrement' }).click();
  await teacher.getByRole('button', { name: 'Soumettre à l’administration' }).click();
  const confirm = teacher.getByRole('dialog', { name: 'Soumettre à l’administration ?' });
  await confirm.getByRole('button', { name: 'Soumettre' }).click();
  await expect(teacher.getByText('En attente de validation', { exact: true })).toBeVisible();
  await expect(teacher.getByRole('textbox', { name: 'Remarque écrite' })).toHaveCount(0);
  await teacher.context().close();

  // Parent, avant l'approbation : aucun message, et aucun accès au reste de l'application.
  const parent = await parentFirstLogin(browser, testInfo, data.username, data.temporaryPassword);
  await expect(parent.getByText('Aucun message de l’école pour le moment.')).toBeVisible();
  expect((await parent.request.get('/api/requests')).status()).toBe(403);
  const nav = parent.getByRole('navigation', { name: 'Navigation principale' });
  await expect(nav.getByRole('link')).toHaveText(['Messages de l’école']);

  // Direction : examen de la version soumise, approbation confirmée.
  const director = await pageAs(browser, testInfo, 'superadmin');
  await director
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'À valider' })
    .click();
  await expect(
    director.getByRole('heading', { level: 1, name: 'Communications à valider' }),
  ).toBeVisible();
  await director.getByRole('link', { name: new RegExp(data.studentName) }).click();
  await expect(director.getByText(remark)).toBeVisible();
  await expect(director.locator('audio')).toHaveAttribute('src', /^\/api\/files\//);
  await director.getByRole('button', { name: 'Approuver et publier' }).click();
  await director
    .getByRole('dialog', { name: 'Approuver et publier cette communication ?' })
    .getByRole('button', { name: 'Approuver et publier' })
    .click();
  await expect(director.getByText('Approuvée et publiée', { exact: true })).toBeVisible();
  await director.context().close();

  // Parent : le message apparaît, non lu ; à l'ouverture, remarque et vocal lisibles ; puis lu.
  await parent.reload();
  const link = parent
    .getByRole('list', { name: 'Messages de l’école' })
    .getByRole('link')
    .filter({ hasText: data.studentName });
  await expect(link).toContainText('Non lu');
  await link.click();
  await expect(parent.getByText(remark)).toBeVisible();
  const audio = parent.locator('audio');
  await expect(audio).toHaveAttribute('src', /^\/api\/files\//);
  const voice = await parent.request.get((await audio.getAttribute('src'))!);
  expect(voice.status()).toBe(200);
  expect(voice.headers()['content-type']).toMatch(/^audio\//);
  await parent.getByRole('link', { name: 'Messages de l’école' }).first().click();
  await expect(link).toContainText('Lu');
  await expect(link).not.toContainText('Non lu');
});
