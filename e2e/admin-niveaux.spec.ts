import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * Niveaux scolaires : en production, une installation neuve n'a aucun niveau et n'avait aucun moyen d'en
 * créer, alors qu'un élève ne s'inscrit que dans une classe rattachée à un niveau. Parcours complet depuis
 * l'administration : créer un niveau, créer une classe rattachée à ce niveau, inscrire un élève. Rejouable :
 * le niveau, la classe et l'élève portent un marqueur unique, les données partagées ne sont pas modifiées.
 */
test.describe('Niveaux scolaires', () => {
  // Playwright impose un motif de déstructuration en premier argument, même sans fixture.
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Écrans d’administration (Chromium)');
    test.setTimeout(90_000);
  });

  test('créer un niveau, une classe rattachée, puis inscrire un élève', async ({ page }) => {
    const marker = Date.now();
    const levelName = `Niveau e2e ${marker}`;
    const className = `Classe e2e ${marker}`;
    const lastName = `Elève${marker}`;
    const toast = (text: string) => page.getByRole('status').filter({ hasText: text });

    await login(page, 'superadmin');

    // --- Niveaux : un niveau est créé avec le prochain ordre d'affichage libre.
    await page.goto('/admin/niveaux');
    await expect(page.getByRole('heading', { name: 'Niveaux' })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByRole('button', { name: 'Nouveau niveau' }).click();
    const levelDialog = page.getByRole('dialog', { name: 'Nouveau niveau' });
    await levelDialog.getByLabel(/Nom du niveau/).fill(levelName);
    await expectNoA11yViolations(page);
    await levelDialog.getByRole('button', { name: 'Enregistrer le niveau' }).click();
    await expect(toast('Niveau créé.')).toBeVisible();
    const levelRow = page.getByRole('list', { name: 'Niveaux' }).getByRole('listitem').filter({ hasText: levelName });
    await expect(levelRow).toContainText('0 classe');

    // --- Classes : une classe est rattachée à ce niveau dès sa création.
    await page.goto('/admin/classes');
    await page.getByRole('button', { name: 'Nouvelle classe' }).click();
    const classDialog = page.getByRole('dialog', { name: 'Nouvelle classe' });
    await classDialog.getByLabel(/Nom de la classe/).fill(className);
    await classDialog.getByRole('combobox', { name: /Étage/ }).click();
    await page.getByRole('option').first().click();
    await classDialog.getByRole('combobox', { name: /Niveau scolaire/ }).click();
    await page.getByRole('option', { name: levelName }).click();
    await expectNoA11yViolations(page);
    await classDialog.getByRole('button', { name: 'Enregistrer la classe' }).click();
    await expect(toast('Classe créée.')).toBeVisible();
    await expect(page.getByText(className).locator('xpath=ancestor::li[1]')).toContainText(levelName);

    // --- Élèves : la classe est proposée, l'élève s'inscrit.
    await page.goto('/admin/eleves');
    await expect(page.getByText('Aucune classe n’est rattachée à un niveau scolaire')).toHaveCount(0);
    await page.getByRole('button', { name: 'Nouvel élève' }).click();
    const studentDialog = page.getByRole('dialog', { name: 'Nouvel élève' });
    await studentDialog.getByLabel(/Prénom/).fill('Amine');
    await studentDialog.getByLabel(/^Nom/).fill(lastName);
    await studentDialog.getByRole('combobox', { name: /Classe/ }).click();
    await page.getByRole('option', { name: className }).click();
    await studentDialog.getByLabel(/Téléphone d’un parent/).fill('06 12 34 56 78');
    await studentDialog.getByRole('button', { name: 'Enregistrer l’élève' }).click();
    await expect(toast('Élève ajouté.')).toBeVisible();

    await page.getByPlaceholder('Rechercher un élève…').fill(lastName);
    const studentRow = page.getByRole('list', { name: 'Élèves' }).getByRole('listitem').filter({ hasText: lastName });
    await expect(studentRow).toContainText(className);

    // --- Retour sur les niveaux : le décompte suit.
    await page.goto('/admin/niveaux');
    await expect(
      page.getByRole('list', { name: 'Niveaux' }).getByRole('listitem').filter({ hasText: levelName }),
    ).toContainText('1 classe · 1 élève');
  });
});
