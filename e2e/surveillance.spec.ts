import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';
import { openNavigation } from './support/navigation';

/**
 * 012 — Section « Surveillance » (ex-« Gardes ») : trois onglets pour l'administration, filtres du suivi gardés
 * dans l'adresse, anciennes adresses traduites, vues des enseignants inchangées. Lecture seule : aucune donnée
 * partagée n'est modifiée.
 */
test.describe('Section « Surveillance » (012)', () => {
  // Playwright impose un motif de déstructuration en premier argument, même sans fixture.
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Écrans d’administration (Chromium)');
    test.setTimeout(90_000);
  });

  test('admin : onglets, filtres, ancienne adresse, accessibilité', async ({ page }) => {
    await login(page, 'admin');
    await openNavigation(page);
    await page.getByRole('link', { name: 'Surveillance', exact: true }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Surveillance' })).toBeVisible();
    const tabs = page.getByRole('tablist', { name: 'Surveillance' }).getByRole('tab');
    // « Enseignants attendus » (020, 1fe44f2) : séances du jour et pointage.
    await expect(tabs).toHaveText([
      'Absences et retards',
      'Enseignants présents',
      'Enseignants attendus',
      'Affectation des surveillants',
      'Suivi des interventions',
    ]);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Suivi des présences' })).toBeVisible();
    await expectNoA11yViolations(page);

    // Par nom : l'onglet « Enseignants présents » (019) s'est inséré en deuxième position.
    await tabs.filter({ hasText: 'Affectation des surveillants' }).click();
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByRole('link', { name: 'Nouvelle affectation' })).toBeVisible();
    await expect(panel.getByRole('heading', { level: 2 }).filter({ hasText: /^(À assigner|Doublons possibles|Équipe)$/ })).toHaveText([
      'À assigner',
      'Doublons possibles',
      'Équipe',
    ]);
    await expectNoA11yViolations(page);

    await tabs.filter({ hasText: 'Suivi des interventions' }).click();
    const filters = page.getByRole('group', { name: 'Filtrer les interventions' });
    await expect(filters.getByRole('button', { name: 'Prise en charge' })).toHaveAttribute('aria-pressed', 'true');
    await filters.getByRole('button', { name: 'Terminée' }).click();
    await expect(page).toHaveURL(/\/gardes\?onglet=suivi&filtre=terminee$/);
    await page.reload();
    await expect(page.getByRole('group', { name: 'Filtrer les interventions' }).getByRole('button', { name: 'Terminée' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expectNoA11yViolations(page);

    // 320 px : filtres et onglets atteignables, sans défilement horizontal de la page.
    await page.setViewportSize({ width: 320, height: 640 });
    await expect(page.getByRole('group', { name: 'Filtrer les interventions' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 800 });

    // Ancienne adresse (favori) : traduite et réécrite.
    await page.goto('/gardes?onglet=terminees');
    await expect(page.getByRole('tab', { name: 'Suivi des interventions' })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\/gardes\?onglet=suivi&filtre=terminee$/);
  });

  test('enseignante : mêmes onglets qu’avant, titre « Mon assiduité »', async ({ page }) => {
    await login(page, 'enseignante');
    await page.goto('/gardes');
    await expect(page.getByRole('heading', { level: 1, name: 'Mon assiduité' })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Mon assiduité' }).getByRole('tab')).toHaveText(['Mes signalements', 'Mes présences']);
    await expect(page.getByRole('link', { name: 'Signaler un retard ou une absence' })).toBeVisible();
  });
});
