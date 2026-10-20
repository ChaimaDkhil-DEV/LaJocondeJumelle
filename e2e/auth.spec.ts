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
