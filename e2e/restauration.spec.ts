import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * Restauration : l'administration fait passer un élève de la cantine au panier, et retour, en gardant
 * l'historique ; un employé n'y a pas accès. Recalcul de l'échéance quand la priorité d'une demande
 * change. Rejouable : le niveau, la classe et l'élève portent un marqueur unique.
 */

async function createStudent(page: Page, marker: number): Promise<{ firstName: string; lastName: string; className: string }> {
  const headers = { Origin: new URL(page.url()).origin };
  const post = async (url: string, data: Record<string, unknown>) => {
    const res = await page.request.post(url, { headers, data });
    expect(res.ok()).toBe(true);
    return res.json();
  };
  const className = `Classe repas ${marker}`;
  const levelName = `Niveau repas ${marker}`;
  const levels = (await post('/api/admin/levels', { name: levelName, cycle: 'PRIMARY', position: (marker % 900) + 50 })) as Array<{ id: string; name: string }>;
  const floors = (await (await page.request.get('/api/admin/floors')).json()) as Array<{ id: string }>;
  const classes = (await post('/api/admin/coverage/classes', {
    name: className,
    floorId: floors[0].id,
    levelId: levels.find((l) => l.name === levelName)!.id,
  })) as Array<{ id: string; name: string }>;
  const student = { firstName: 'Aya', lastName: `Repas${marker}` };
  await post('/api/admin/students', {
    ...student,
    classId: classes.find((c) => c.name === className)!.id,
    parentPhone: '06 12 34 56 78',
    mealService: 'CANTINE',
  });
  return { ...student, className };
}

test.describe('Restauration et échéances', () => {
  // Playwright impose un motif de déstructuration en premier argument, même sans fixture.
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(!['chromium', 'mobile-320'].includes(testInfo.project.name), 'Parcours d’administration (Chromium, petit écran)');
    test.setTimeout(120_000);
  });

  test('l’administration change le service d’un élève et retrouve l’historique', async ({ page, browser }, testInfo) => {
    await login(page, 'superadmin');
    const student = await createStudent(page, Date.now());
    const name = `${student.firstName} ${student.lastName}`;
    await page.context().clearCookies();

    await login(page, 'admin');
    const menu = page.getByRole('navigation', { name: 'Navigation principale' });
    if (testInfo.project.name === 'chromium') await menu.getByRole('link', { name: 'Restauration' }).click();
    else await page.goto('/restauration');
    await expect(page.getByRole('heading', { name: 'Restauration' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Rechercher un élève' }).fill(student.lastName);
    const row = page.getByRole('list', { name: 'Élèves' }).getByRole('listitem').filter({ hasText: student.lastName });
    await expect(row).toContainText('Cantine');
    await expect(row).toContainText(student.className);
    await expect(page.getByText('06 12 34 56 78')).toHaveCount(0);
    await expectNoA11yViolations(page);
    await page.screenshot({ path: testInfo.outputPath('1-liste.png'), fullPage: true });

    // Cantine → panier, avec un motif.
    await row.getByRole('button', { name: `Passer au panier : ${name}` }).click();
    const dialog = page.getByRole('dialog', { name: `Changer le service : ${name}` });
    await dialog.getByRole('textbox', { name: 'Motif (facultatif)' }).fill('Allergie signalée par les parents');
    await expectNoA11yViolations(page);
    await page.screenshot({ path: testInfo.outputPath('2-confirmation.png'), fullPage: true });
    await dialog.getByRole('button', { name: 'Confirmer' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: `${name} : service changé.` })).toBeVisible();
    await expect(row).toContainText('Panier');

    // Panier → cantine, sans motif.
    await row.getByRole('button', { name: `Passer à la cantine : ${name}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(row).toContainText('Cantine');

    // Historique après rechargement : données lues depuis le serveur, la plus récente d'abord.
    await page.reload();
    await page.getByRole('textbox', { name: 'Rechercher un élève' }).fill(student.lastName);
    await row.getByRole('button', { name: `Historique de ${name}` }).click();
    const changes = page.getByRole('list', { name: 'Changements de service' }).getByRole('listitem');
    await expect(changes).toHaveCount(2);
    await expect(changes.nth(0)).toContainText('Panier → Cantine');
    await expect(changes.nth(1)).toContainText('Cantine → Panier');
    await expect(changes.nth(1)).toContainText('Allergie signalée par les parents');
    await expectNoA11yViolations(page);
    await page.screenshot({ path: testInfo.outputPath('3-historique.png'), fullPage: true });

    // Un employé n'a ni l'entrée de menu ni les données, même en ouvrant l'adresse directement.
    const context = await browser.newContext(testInfo.project.use);
    const employee = await context.newPage();
    await login(employee, 'enseignante');
    await expect(employee.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Restauration' })).toHaveCount(0);
    await employee.goto('/restauration');
    await expect(employee.getByText('Vous n’avez pas accès à la liste des élèves.')).toBeVisible({ timeout: 20_000 });
    await expect(employee.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
    await expect(employee.getByText(student.lastName)).toHaveCount(0);
    await employee.screenshot({ path: testInfo.outputPath('4-employe-refuse.png'), fullPage: true });
    await context.close();
  });

  test('passer une demande en Urgente raccourcit son échéance à l’écran', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Logique serveur : un navigateur suffit');
    await login(page, 'enseignante');
    const headers = { Origin: new URL(page.url()).origin };
    const categories = (await (await page.request.get('/api/categories')).json()) as Array<{ id: string; name: string }>;
    const category = categories.find((c) => c.name === 'Photocopies')!;
    const recipients = (await (await page.request.get(`/api/categories/${category.id}/recipients`)).json()) as Array<{ id: string }>;
    const created = await page.request.post('/api/requests', {
      headers,
      data: { clientId: crypto.randomUUID(), title: `Priorité ${Date.now()}`, description: 'x', categoryId: category.id, recipientId: recipients[0].id, priority: 'NORMAL' },
    });
    expect(created.status()).toBe(201);
    const { id, currentDueAt } = (await created.json()) as { id: string; currentDueAt: string };

    await page.goto(`/demandes/${id}`);
    await expect(page.getByText(/^Reste .* pour la prise en charge$/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('5-avant-priorite.png'), fullPage: true });

    await page.getByRole('button', { name: 'Changer la priorité' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Changer la priorité' });
    await dialog.getByRole('radio', { name: 'Urgente' }).check();
    await dialog.getByRole('button', { name: 'Enregistrer la priorité' }).click();
    await expect(dialog).toBeHidden();

    // Règle du seed « Photocopies » en Urgente : prise en charge en 1 min depuis l'envoi.
    await expect(page.getByText(/^(Reste|Bientôt en retard : reste) (\d+ s|1 min \d+ s) pour la prise en charge$/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('6-apres-priorite.png'), fullPage: true });
    const detail = (await (await page.request.get(`/api/requests/${id}`)).json()) as { currentDueAt: string };
    expect(Date.parse(detail.currentDueAt)).toBeLessThan(Date.parse(currentDueAt));
  });
});
