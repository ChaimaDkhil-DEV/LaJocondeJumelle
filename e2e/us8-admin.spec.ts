import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * T102 — US8 : administration (V16). Chaque projet crée son propre compte et sa propre catégorie :
 * aucune modification des données partagées (catégories de démonstration, réglages, permissions).
 */

async function openNavigation(page: Page): Promise<void> {
  const menu = page.getByRole('button', { name: 'Ouvrir le menu' });
  if (await menu.isVisible()) await menu.click();
}

async function logout(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
}

test('V16 — le super administrateur crée un compte, une catégorie circuit B et ses délais ; un responsable est refusé', async ({ page }, testInfo) => {
  test.slow();
  const marker = `${testInfo.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
  const username = `e2e.${marker}`;
  const categoryName = `Travaux ${marker}`.slice(0, 60);

  await login(page, 'superadmin');
  await openNavigation(page);
  await page.getByRole('link', { name: 'Administration' }).click();
  await expect(page.getByRole('heading', { name: 'Comptes' })).toBeVisible();

  // Compte : mot de passe provisoire affiché une seule fois.
  await page.getByRole('button', { name: 'Nouveau compte' }).click();
  const userDialog = page.getByRole('dialog', { name: 'Nouveau compte' });
  await userDialog.getByLabel(/Identifiant/).fill(username);
  await userDialog.getByLabel(/Nom affiché/).fill(`Agent ${marker}`);
  await userDialog.getByLabel(/Fonction/).fill('Entretien');
  await userDialog.getByRole('button', { name: 'Créer le compte' }).click();
  const passwordDialog = page.getByRole('dialog', { name: 'Mot de passe provisoire' });
  await expect(passwordDialog).toContainText('ne sera plus affiché');
  const temporaryPassword = await passwordDialog.getByLabel('Mot de passe', { exact: true }).inputValue();
  expect(temporaryPassword).toMatch(/^\S{16,}$/);
  await expectNoA11yViolations(page);
  await passwordDialog.getByRole('button', { name: 'J’ai noté le mot de passe' }).click();
  await expect(passwordDialog).toBeHidden();
  await expect(page.getByLabel('Mot de passe', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('listitem').filter({ hasText: username })).toContainText('Mot de passe à changer');

  // Catégorie circuit B avec photo obligatoire, destinataire et responsable.
  await page.getByRole('link', { name: 'Catégories' }).click();
  await page.getByRole('button', { name: 'Nouvelle catégorie' }).click();
  const categoryDialog = page.getByRole('dialog', { name: 'Nouvelle catégorie' });
  await categoryDialog.getByLabel(/Nom de la catégorie/).fill(categoryName);
  await categoryDialog.getByRole('radio', { name: /Via l’administration/ }).check();
  await categoryDialog.getByRole('checkbox', { name: 'Photo de preuve obligatoire' }).check();
  await categoryDialog.getByRole('combobox', { name: 'Destinataires' }).click();
  await page.getByRole('option', { name: 'Reprographie', exact: true }).click();
  await categoryDialog.getByRole('combobox', { name: 'Responsables' }).click();
  await page.getByRole('option', { name: 'Responsable administratif', exact: true }).click();
  await expectNoA11yViolations(page);
  await categoryDialog.getByRole('button', { name: 'Enregistrer la catégorie' }).click();
  await expect(categoryDialog).toBeHidden();
  const card = page.getByRole('listitem').filter({ hasText: categoryName });
  await expect(card).toContainText('Photo obligatoire');
  await expect(card).toContainText('Destinataires : Reprographie');

  // Délais : la prise en charge urgente passe à 5 minutes.
  await card.getByRole('button', { name: `Délais de ${categoryName}` }).click();
  const deadlines = page.getByRole('dialog', { name: `Délais : ${categoryName}` });
  const urgent = deadlines.getByRole('group', { name: 'Urgente' });
  await urgent.getByLabel(/Prise en charge/).fill('5');
  await expect(urgent.getByText('5 min')).toBeVisible();
  await deadlines.getByRole('button', { name: 'Enregistrer les délais' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Délais enregistrés' })).toBeVisible();

  // Réglages consultables (non modifiés : données partagées entre projets).
  await page.getByRole('link', { name: 'Réglages' }).click();
  await expect(page.getByLabel(/Durée maximale d’un vocal/)).toHaveValue(/^\d+$/);
  await expect(page.getByRole('group', { name: 'Responsable' })).toBeVisible();
  await expectNoA11yViolations(page);

  // Journal d'audit : la création du compte est tracée.
  await page.getByRole('link', { name: 'Journal d’audit' }).click();
  await page.getByRole('combobox', { name: 'Action' }).click();
  await page.getByRole('option', { name: 'Compte créé' }).click();
  await expect(page.getByRole('list', { name: 'Entrées du journal' }).getByRole('listitem').filter({ hasText: username }).first()).toBeVisible();
  await expectNoA11yViolations(page);

  // Le responsable n'a ni menu ni accès (interface et API).
  await logout(page);
  await login(page, 'admin');
  await openNavigation(page);
  await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.goto('/admin/comptes');
  await expect(page.getByText('Accès réservé au super administrateur.')).toBeVisible();
  expect((await page.request.get('/api/admin/users')).status()).toBe(403);

  // Le nouveau compte se connecte avec le mot de passe provisoire et doit le changer.
  await logout(page);
  await page.getByLabel('Identifiant').fill(username);
  await page.getByLabel('Mot de passe', { exact: true }).fill(temporaryPassword);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/mot-de-passe$/);
});
