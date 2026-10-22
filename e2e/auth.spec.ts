import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from './support/accounts';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * T030 — Authentification de bout en bout : connexion, changement de mot de passe imposé,
 * déconnexion, accessibilité des écrans de connexion (dont 320 px de large).
 */

test('la page de connexion est accessible et sans défilement horizontal', async ({ page }) => {
  await page.goto('/connexion');
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  await expectNoA11yViolations(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('un identifiant incorrect affiche un message clair', async ({ page }) => {
  await page.goto('/connexion');
  await page.getByLabel('Identifiant').fill('enseignante');
  await page.getByLabel('Mot de passe', { exact: true }).fill('mauvais-mot-de-passe');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('alert')).toHaveText('Identifiant ou mot de passe incorrect.');
});

test('connexion, page d’accueil accessible puis déconnexion', async ({ page }) => {
  await login(page, 'enseignante');
  await expect(page.getByRole('heading', { name: 'Mes demandes' })).toBeVisible();
  await expectNoA11yViolations(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();

  // La session est fermée : revenir sur l'accueil renvoie vers la connexion.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
});

test('la page de changement de mot de passe est accessible', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/mot-de-passe');
  await expect(page.getByRole('heading', { name: 'Changer votre mot de passe' })).toBeVisible();
  await expectNoA11yViolations(page);
});

test('le changement de mot de passe est imposé à la première connexion', async ({ page }, testInfo) => {
  // Le compte « nouveau » n'est utilisable qu'une fois par exécution (son mot de passe change).
  test.skip(testInfo.project.name !== 'chromium', 'Exécuté uniquement sur le projet chromium');

  await page.goto('/connexion');
  await page.getByLabel('Identifiant').fill('nouveau');
  await page.getByLabel('Mot de passe', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page.getByRole('heading', { name: 'Changer votre mot de passe' })).toBeVisible();
  // Tant que le mot de passe n'est pas changé, l'application reste inaccessible.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Changer votre mot de passe' })).toBeVisible();

  await page.getByLabel('Mot de passe actuel').fill(E2E_PASSWORD);
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('Nouveau-mot-de-passe-2026');
  await page.getByLabel('Confirmer le nouveau mot de passe').fill('Nouveau-mot-de-passe-2026');
  await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();

  await expect(page.getByRole('heading', { name: 'Mes demandes' })).toBeVisible();
});

test('changement volontaire depuis « Mon profil » : autres sessions fermées (spec 005)', async ({ browser }, testInfo) => {
  // Change le mot de passe d'un compte partagé : un seul projet, puis l'ancien est remis.
  test.skip(testInfo.project.name !== 'chromium', 'Exécuté uniquement sur le projet chromium');
  const NEW_PASSWORD = 'Profil-nouveau-mot-de-passe-2026';
  const main = await browser.newContext();
  const other = await browser.newContext();
  const page = await main.newPage();
  const otherPage = await other.newPage();
  let changed = false;
  try {
    await login(page, 'autre');
    await login(otherPage, 'autre');

    await page.getByRole('link', { name: /^Mon profil : / }).click();
    await expect(page.getByRole('heading', { name: 'Mon profil' })).toBeVisible();
    await page.getByRole('link', { name: 'Changer mon mot de passe' }).click();
    await page.getByLabel('Mot de passe actuel').fill(E2E_PASSWORD);
    await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirmer le nouveau mot de passe').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
    await expect(page.getByRole('heading', { name: 'Mon profil' })).toBeVisible();
    changed = true;
    await expect(page.getByRole('status').filter({ hasText: 'Mot de passe modifié.' })).toHaveText(
      'Mot de passe modifié. Vos autres sessions ont été fermées.',
    );

    // L'autre session est fermée côté serveur.
    await otherPage.reload();
    await expect(otherPage.getByRole('heading', { name: 'Connexion' })).toBeVisible();
    await login(otherPage, 'autre', NEW_PASSWORD);
    await expect(otherPage.getByRole('heading', { name: 'Mes demandes' })).toBeVisible();
  } finally {
    if (changed) {
      // Base e2e rejouable : l'ancien mot de passe est remis par la session encore ouverte.
      const res = await page.request.post('/api/auth/password', {
        headers: { Origin: new URL(page.url()).origin },
        data: { currentPassword: NEW_PASSWORD, newPassword: E2E_PASSWORD },
      });
      expect(res.status(), 'remise de l’ancien mot de passe').toBe(204);
    }
    await main.close();
    await other.close();
  }
});
