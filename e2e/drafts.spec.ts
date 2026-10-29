import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { fillDescription } from './support/click';
import { expectNoA11yViolations } from './support/axe';
import { login } from './support/login';

/**
 * Spec 007 — brouillons de demande : enregistrer, retrouver, reprendre et envoyer (T013),
 * supprimer (T017). Parcours rejoués sur Chromium ; 320 px dans a11y-responsive (V18).
 */

function uniqueTitle(base: string, testInfo: TestInfo): string {
  return `${base} [${testInfo.project.name} ${Date.now()}]`;
}

const byTitle = (title: string) => new RegExp(title.replace(/[[\]]/g, '\\$&'));

async function choose(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

async function recordVoice(page: Page, seconds = 2): Promise<void> {
  await page.getByRole('button', { name: 'Enregistrer un message vocal' }).click();
  await expect(page.getByRole('button', { name: 'Arrêter l’enregistrement' })).toBeVisible();
  await page.waitForTimeout(seconds * 1000);
  await page.getByRole('button', { name: 'Arrêter l’enregistrement' }).click();
  await expect(page.getByRole('button', { name: 'Lire le message vocal' })).toBeVisible();
}

async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
}

/** Brouillon « Photocopies » avec titre et message vocal, sans description ; la page brouillon est ouverte. */
async function saveDraft(page: Page, title: string): Promise<void> {
  await page.getByRole('link', { name: 'Nouvelle demande' }).first().click();
  await expect(page.getByRole('heading', { name: 'Nouvelle demande' })).toBeVisible();
  await choose(page, 'Catégorie', 'Photocopies');
  await choose(page, 'Destinataire', 'Reprographie — Reprographie');
  await page.getByLabel('Titre').fill(title);
  await recordVoice(page);
  await page.getByRole('button', { name: 'Enregistrer en brouillon' }).click();
  await expect(page.getByText('Brouillon enregistré.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Brouillon de demande' })).toBeVisible();
}

const ONLY_CHROMIUM = 'Parcours rejoué sur Chromium ; 320 px dans a11y-responsive';

test.describe('Brouillons de demande (spec 007)', () => {

  test('enregistrer en brouillon, le retrouver, le compléter et l’envoyer', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', ONLY_CHROMIUM);
    const title = uniqueTitle('Photocopies du contrôle', testInfo);

    await login(page, 'enseignante');
    await saveDraft(page, title);
    await expectNoA11yViolations(page);

    // Onglet « Brouillons » ; « Envoyées » ne le montre pas.
    await page.getByRole('link', { name: 'Retour aux demandes' }).click();
    await expect(page.getByRole('tab', { name: 'Brouillons' })).toHaveAttribute('aria-selected', 'true');
    const row = page.getByRole('link', { name: byTitle(title) });
    await expect(row).toBeVisible();
    await expect(row.getByText('Brouillon', { exact: true })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByRole('tab', { name: 'Envoyées' }).click();
    await expect(page.getByRole('tab', { name: 'Envoyées' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('link', { name: byTitle(title) })).toHaveCount(0);

    // Invisible du destinataire tant qu'il n'est pas envoyé.
    await logout(page);
    await login(page, 'reprographie');
    await expect(page.getByRole('tab', { name: 'Reçues' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('link', { name: byTitle(title) })).toHaveCount(0);
    await logout(page);

    // Reprise : formulaire pré-rempli, vocal réécoutable, description ajoutée, envoi.
    await login(page, 'enseignante');
    await page.getByRole('tab', { name: 'Brouillons' }).click();
    await page.getByRole('link', { name: byTitle(title) }).click();
    await expect(page.getByRole('heading', { name: 'Brouillon de demande' })).toBeVisible();
    await expect(page.getByLabel('Titre')).toHaveValue(title);
    await expect(page.getByRole('button', { name: 'Lire le message vocal' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remplacer le message vocal' })).toBeVisible();
    await fillDescription(page, 'Vingt-huit copies recto verso.');
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();

    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('Votre demande a été envoyée.')).toBeVisible();
    await expect(page.getByText('Envoyée', { exact: true })).toBeVisible();

    // Le destinataire la reçoit comme une demande créée directement.
    await logout(page);
    await login(page, 'reprographie');
    await page.getByRole('link', { name: byTitle(title) }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('Vingt-huit copies recto verso.')).toBeVisible();
  });

  test('supprimer un brouillon après confirmation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', ONLY_CHROMIUM);
    const title = uniqueTitle('Brouillon à supprimer', testInfo);

    await login(page, 'enseignante');
    await saveDraft(page, title);

    // Annuler la confirmation ne supprime rien.
    await page.getByRole('button', { name: 'Supprimer le brouillon' }).click();
    const dialog = page.getByRole('dialog', { name: 'Supprimer ce brouillon ?' });
    await expect(dialog).toBeVisible();
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Brouillon de demande' })).toBeVisible();

    await page.getByRole('button', { name: 'Supprimer le brouillon' }).click();
    await dialog.getByRole('button', { name: 'Supprimer' }).click();
    await expect(page.getByText('Brouillon supprimé.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mes demandes' })).toBeVisible();

    // L'onglet reste affichable par l'adresse, même vide : le brouillon n'y est plus.
    await page.goto('/?onglet=brouillons');
    await expect(page.getByRole('tab', { name: 'Brouillons' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('link', { name: byTitle(title) })).toHaveCount(0);
  });
});
