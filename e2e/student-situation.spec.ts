import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { AccountName } from './support/accounts';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * Historique de classe et situation d'un élève (021) : l'administration déplace un élève de classe, lit ses classes
 * successives, demande sa situation à un instant donné (classe, séance, rubriques « aucune information »), constate
 * « Indisponible » avant sa création, imprime la page, retrouve la consultation dans le journal de l'élève. Un
 * enseignant est refusé. Élève, niveau et classes sont créés pour ce lancement : rien ne dépend des autres scénarios.
 */
const TZ = 'Europe/Paris';
const PHONE = { width: 320, height: 720 };
const DESKTOP = { width: 1280, height: 800 };

interface Session {
  context: BrowserContext;
  page: Page;
}

async function open(browser: Browser, account: AccountName, viewport: { width: number; height: number }): Promise<Session> {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600, isMobile: viewport.width < 600 });
  const page = await context.newPage();
  await login(page, account);
  return { context, page };
}

async function check(page: Page, screen: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `défilement horizontal sur « ${screen} »`).toBeLessThanOrEqual(0);
  await expectNoA11yViolations(page);
}

/** Valeur d'un champ date-heure (AAAA-MM-JJThh:mm) dans le fuseau de l'école, décalée de `minutes`. */
function schoolMoment(minutes: number): string {
  const at = new Date(Date.now() + minutes * 60_000);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
  return `${date}T${time}`;
}

const origin = (page: Page) => ({ Origin: new URL(page.url()).origin });

interface Created {
  studentName: string;
  classA: string;
  classB: string;
}

/** Niveau, deux classes et un élève déplacé de la première à la seconde. */
async function createStudent(page: Page): Promise<Created> {
  const marker = Date.now();
  const headers = origin(page);
  const floors = (await (await page.request.get('/api/admin/floors')).json()) as Array<{ id: string }>;
  // Position unique et au plus 1000 : la suivante après la plus grande déjà prise.
  const existing = (await (await page.request.get('/api/admin/levels')).json()) as Array<{ position: number }>;
  const position = Math.min(1000, Math.max(0, ...existing.map((l) => l.position)) + 1);
  const levels = await page.request.post('/api/admin/levels', { headers, data: { name: `Niveau situation ${marker}`, cycle: 'PRIMARY', position } });
  expect(levels.status()).toBe(201);
  const levelId = ((await levels.json()) as Array<{ id: string; name: string }>).find((l) => l.name === `Niveau situation ${marker}`)!.id;
  const classNames = { A: `Situation A ${marker}`, B: `Situation B ${marker}` };
  const ids: Record<string, string> = {};
  for (const [key, name] of Object.entries(classNames)) {
    const res = await page.request.post('/api/admin/coverage/classes', { headers, data: { name, floorId: floors[0].id, levelId } });
    expect(res.status()).toBe(201);
    ids[key] = ((await res.json()) as Array<{ id: string; name: string }>).find((c) => c.name === name)!.id;
  }
  const lastName = `Situation${marker}`;
  const created = await page.request.post('/api/admin/students', { headers, data: { firstName: 'Aya', lastName, classId: ids.A, parentPhone: '+216 20 123 456' } });
  expect(created.status()).toBe(201);
  const studentId = ((await created.json()) as { id: string }).id;
  const moved = await page.request.patch(`/api/admin/students/${studentId}`, { headers, data: { firstName: 'Aya', lastName, classId: ids.B, parentPhone: '+216 20 123 456' } });
  expect(moved.status()).toBe(200);
  return { studentName: `Aya ${lastName}`, classA: classNames.A, classB: classNames.B };
}

async function openDrawer(page: Page, created: Created) {
  await page.goto('/admin/eleves');
  await page.getByRole('searchbox', { name: /^Rechercher un élève/ }).fill(created.studentName.split(' ')[1]);
  await page.getByRole('button', { name: `Historique de la classe de l’élève ${created.studentName}` }).click();
  const drawer = page.getByRole('dialog', { name: /Historique de classe/ });
  await expect(drawer).toBeVisible();
  return drawer;
}

test.describe('Historique et situation d’un élève', () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Largeurs pilotées par le scénario (Chromium)');
    test.setTimeout(120_000);
  });

  test('classes successives, situation à un instant, indisponible avant la création, impression, journal', async ({ browser }) => {
    const admin = await open(browser, 'admin', DESKTOP);
    const teacher = await open(browser, 'enseignante', DESKTOP);
    try {
      const created = await createStudent(admin.page);
      const drawer = await openDrawer(admin.page, created);

      // --- Classes successives : la plus récente d'abord, la période précédente close.
      const periods = drawer.getByRole('list', { name: 'Périodes de classe' }).getByRole('listitem');
      await expect(periods).toHaveCount(2);
      await expect(periods.nth(0)).toContainText(created.classB);
      await expect(periods.nth(0)).toContainText('Classe actuelle');
      await expect(periods.nth(1)).toContainText(created.classA);
      await check(admin.page, 'Historique de classe');

      // --- Situation à l'instant présent : la classe actuelle, aucune séance, rubriques sans information.
      await drawer.getByLabel('Date et heure').fill(schoolMoment(0));
      await drawer.getByRole('button', { name: 'Voir la situation' }).click();
      const classRegion = drawer.getByRole('region', { name: 'Classe' });
      await expect(classRegion).toContainText(created.classB);
      await expect(classRegion).toContainText('Connue');
      await expect(drawer.getByRole('region', { name: 'Séance prévue' })).toContainText('Aucune séance prévue à cet instant.');
      await expect(drawer.getByRole('region', { name: 'Surveillants' })).toContainText('Aucune garde enregistrée à cet instant.');
      await check(admin.page, 'Situation d’un élève');

      // --- Impression : seule la situation reste visible, avec son auteur.
      // En impression le reste de la page est masqué, donc absent de l'arbre d'accessibilité : on cible la feuille.
      await admin.page.emulateMedia({ media: 'print' });
      const sheet = admin.page.locator('.situation-print');
      await expect(sheet.getByText(/Édité par/)).toBeVisible();
      await expect(sheet.getByText('Aucune séance prévue à cet instant.')).toBeVisible();
      await expect(admin.page.locator('form').filter({ hasText: 'Voir la situation' })).toBeHidden();
      await admin.page.emulateMedia({ media: 'screen' });

      // --- Avant la création de l'élève : indisponible, avec la raison.
      await drawer.getByLabel('Date et heure').fill(schoolMoment(-3 * 24 * 60));
      await drawer.getByRole('button', { name: 'Voir la situation' }).click();
      await expect(drawer.getByRole('region', { name: 'Classe' })).toContainText('Indisponible');
      await expect(drawer.getByRole('region', { name: 'Classe' })).toContainText('création de l’élève');

      // --- Un instant futur est refusé et expliqué.
      await drawer.getByLabel('Date et heure').fill(schoolMoment(3 * 24 * 60));
      await drawer.getByRole('button', { name: 'Voir la situation' }).click();
      await expect(drawer.getByText(/ne peut pas être dans le futur/)).toBeVisible();

      // --- Journal de l'élève : la modification de classe et les consultations.
      await drawer.getByRole('button', { name: 'Journal de l’élève' }).click();
      const journal = drawer.getByRole('list', { name: 'Journal de l’élève' });
      await expect(journal.getByRole('listitem').filter({ hasText: 'Situation d’un élève consultée' })).toHaveCount(2);
      await expect(journal.getByRole('listitem').filter({ hasText: 'Élève créé / modifié' })).not.toHaveCount(0);

      // --- Un enseignant n'a accès à rien de tout cela.
      const studentId = (await (await admin.page.request.get('/api/admin/students')).json() as Array<{ id: string; lastName: string }>).find((s) => created.studentName.endsWith(s.lastName))!.id;
      for (const url of [`class-history`, `situation?at=${encodeURIComponent(schoolMoment(0))}`, `audit`]) {
        expect((await teacher.page.request.get(`/api/admin/students/${studentId}/${url}`)).status()).toBe(403);
      }
    } finally {
      await admin.context.close();
      await teacher.context.close();
    }
  });

  test('sur téléphone (320 px) : le tiroir ne déborde pas et reste accessible', async ({ browser }) => {
    const admin = await open(browser, 'admin', PHONE);
    try {
      const created = await createStudent(admin.page);
      const drawer = await openDrawer(admin.page, created);
      await drawer.getByLabel('Date et heure').fill(schoolMoment(0));
      await drawer.getByRole('button', { name: 'Voir la situation' }).click();
      await expect(drawer.getByRole('region', { name: 'Classe' })).toContainText(created.classB);
      await check(admin.page, 'Situation d’un élève (320 px)');
    } finally {
      await admin.context.close();
    }
  });
});
