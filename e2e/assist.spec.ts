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

test('les demandes similaires visibles s’affichent, ouvertes dans un nouvel onglet (010)', async ({ page }, testInfo) => {
  await login(page, 'enseignante');
  const origin = new URL(page.url()).origin;
  // Mot unique : la demande créée est la plus proche, même si la base contient d'autres demandes.
  const marker = `rétroprojecteur${testInfo.project.name.replace(/\W/g, '')}${Date.now()}`;
  const categories = (await (await page.request.get('/api/categories')).json()) as Array<{ id: string; name: string }>;
  const photocopies = categories.find((c) => c.name === 'Photocopies')!;
  const recipients = (await (await page.request.get(`/api/categories/${photocopies.id}/recipients`)).json()) as Array<{ id: string }>;
  const created = await page.request.post('/api/requests', {
    headers: { Origin: origin },
    data: {
      clientId: crypto.randomUUID(),
      title: `Le ${marker} ne s’allume plus`,
      description: 'Salle 12.',
      categoryId: photocopies.id,
      recipientId: recipients[0].id,
      priority: 'HIGH',
    },
  });
  expect(created.status()).toBe(201);

  await page.goto('/demandes/nouvelle');
  await page.getByLabel('Description (facultative)').fill(`Le ${marker} de la salle 12 est en panne.`);
  await page.getByRole('button', { name: 'Proposer une catégorie et une priorité' }).click();

  const list = page.getByRole('list', { name: 'Demandes similaires' });
  const link = list.getByRole('link', { name: new RegExp(marker) });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('href', `/demandes/${((await created.json()) as { id: string }).id}`);
  await expectNoA11yViolations(page);
});
