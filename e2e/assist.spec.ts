import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { installFakeMediaRecorder } from './support/fake-media-recorder';
import { login } from './support/login';

/**
 * T039 (spec 009) — assistance à la création : consigne créée par le super administrateur,
 * propositions appliquées puis envoyées, historique « Propositions automatiques », transcription
 * de démonstration d'un vocal. Fournisseurs `demo` : aucun appel externe.
 */

function unique(base: string, testInfo: TestInfo): string {
  return `${base} [${testInfo.project.name} ${Date.now()}]`;
}

async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
}

test('le super administrateur crée une consigne ; l’enseignante applique les propositions et les retrouve dans l’historique', async ({
  page,
}, testInfo) => {
  const guideline = unique('Toner épuisé', testInfo);
  await login(page, 'superadmin');
  await page.goto('/admin/consignes');
  await expect(page.getByRole('heading', { name: 'Consignes' })).toBeVisible();
  await page.getByRole('button', { name: 'Nouvelle consigne' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle consigne' });
  await dialog.getByLabel('Titre').fill(guideline);
  await dialog.getByLabel('Texte').fill('Toner épuisé sur une imprimante : Priorité : Moyenne.');
  await dialog.getByRole('button', { name: 'Enregistrer la consigne' }).click();
  await expect(page.getByRole('list', { name: 'Consignes' }).getByText(guideline)).toBeVisible();
  await expectNoA11yViolations(page);
  await logout(page);

  await login(page, 'enseignante');
  await page.goto('/demandes/nouvelle');
  await expect(page.getByRole('heading', { name: 'Nouvelle demande' })).toBeVisible();
  const description = `La photocopieuse du premier étage est en panne depuis ce matin (${testInfo.project.name} ${Date.now()}).`;
  await page.getByLabel('Description (facultative)').fill(description);
  await page.getByRole('button', { name: 'Proposer une catégorie et une priorité' }).click();

  const panel = page.getByRole('region', { name: 'Propositions automatiques' });
  await expect(panel.getByRole('button', { name: 'Tout appliquer' })).toBeVisible();
  await expect(panel.getByText('Pannes de reprographie', { exact: true })).toBeVisible();
  await expectNoA11yViolations(page);
  await panel.getByRole('button', { name: 'Tout appliquer' }).click();

  await expect(page.getByRole('combobox', { name: 'Catégorie' })).toHaveText('Photocopies');
  await expect(page.getByRole('radio', { name: 'Haute' })).toBeChecked();
  const title = await page.getByLabel('Titre', { exact: true }).inputValue();
  expect(title).toContain('La photocopieuse du premier étage est en panne');
  await page.getByRole('combobox', { name: /^Destinataire/ }).click();
  await page.getByRole('option', { name: 'Reprographie — Reprographie' }).click();
  await page.getByRole('button', { name: 'Envoyer la demande' }).click();

  await expect(page.getByText('Votre demande a été envoyée.')).toBeVisible();
  const history = page.getByRole('list', { name: 'Historique' });
  await expect(history.getByText(/^Propositions automatiques : catégorie « Photocopies » \(retenue\), priorité Haute \(retenue\)/)).toBeVisible();
  await expect(history.getByText('Consignes : Pannes de reprographie')).toBeVisible();
  await expectNoA11yViolations(page);
});

test('un vocal est transcrit (démonstration), affiché à vérifier, puis sert aux propositions', async ({ page, browserName }) => {
  if (browserName === 'webkit') await installFakeMediaRecorder(page);
  await login(page, 'enseignante');
  await page.goto('/demandes/nouvelle');
  await expect(page.getByRole('heading', { name: 'Nouvelle demande' })).toBeVisible();

  await page.getByRole('button', { name: 'Enregistrer un message vocal' }).click();
  await expect(page.getByRole('button', { name: 'Arrêter l’enregistrement' })).toBeVisible();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Arrêter l’enregistrement' }).click();
  await expect(page.getByRole('button', { name: 'Lire le message vocal' })).toBeVisible();

  await page.getByRole('button', { name: 'Proposer une catégorie et une priorité' }).click();
  await expect(page.getByLabel('Transcription (à vérifier)')).toHaveValue(/photocopieuse du premier étage est en panne/);
  const panel = page.getByRole('region', { name: 'Propositions automatiques' });
  await expect(panel.getByRole('button', { name: 'Tout appliquer' })).toBeVisible();

  await page.getByRole('button', { name: 'Utiliser comme description' }).click();
  await expect(page.getByLabel('Description (facultative)')).toHaveValue(/photocopieuse du premier étage est en panne/);
  await expectNoA11yViolations(page);
});
