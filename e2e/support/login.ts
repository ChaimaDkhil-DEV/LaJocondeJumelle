import { expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, accounts, type AccountName } from './accounts';

/** Se connecte avec un compte de démonstration du seed e2e. */
export async function login(page: Page, account: AccountName, password = E2E_PASSWORD): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel('Identifiant').fill(accounts[account]);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeHidden();
}
