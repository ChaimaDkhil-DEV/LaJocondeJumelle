import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { installFakeMediaRecorder } from './support/fake-media-recorder';
import { clickInView, fillDescription } from './support/click';
import { login } from './support/login';

/**
 * T039 (spec 009) — assistance à la création : consigne créée par le super administrateur,
 * propositions reprises dans les champs puis envoyées, historique « Propositions automatiques ».
 * Création vocale assistée : vocal analysé dès la fin de l'enregistrement, envoyé avec la demande
 * et écouté par le destinataire. Fournisseurs `demo` : aucun appel externe.
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
  await fillDescription(page, description);
  await clickInView(page.getByRole('button', { name: 'Proposer une catégorie et une priorité' }));

  // Une seule phrase sous le vocal ; les champs préremplis portent le badge « Suggéré ».
  await expect(page.getByText(/^Champs préremplis d’après votre message/)).toBeVisible();
  await expectNoA11yViolations(page);

  await expect(page.getByRole('combobox', { name: 'Catégorie' })).toHaveText('Photocopies');
  await expect(page.getByRole('radio', { name: 'Haute' })).toBeChecked();
  const title = await page.getByLabel('Titre', { exact: true }).inputValue();
  expect(title).toContain('La photocopieuse du premier étage est en panne');
  // Seul destinataire de « Photocopies » : déjà prérempli.
  await expect(page.getByRole('combobox', { name: /^Destinataire/ })).toHaveText('Reprographie — Reprographie');
  await clickInView(page.getByRole('button', { name: 'Envoyer la demande' }));

  await expect(page.getByText('Votre demande a été envoyée.')).toBeVisible();
  const history = page.getByRole('list', { name: 'Historique' });
  await expect(history.getByText(/^Propositions automatiques : catégorie « Photocopies » \(retenue\), priorité Haute \(retenue\)/)).toBeVisible();
  await expect(history.getByText('Consignes : Pannes de reprographie')).toBeVisible();
  await expectNoA11yViolations(page);
});

test('un vocal est analysé dès la fin de l’enregistrement, envoyé avec la demande et écouté par le destinataire', async ({
  page,
  browserName,
}, testInfo) => {
  if (browserName === 'webkit') await installFakeMediaRecorder(page);
  await login(page, 'enseignante');
  await page.goto('/demandes/nouvelle');
  await expect(page.getByRole('heading', { name: 'Nouvelle demande' })).toBeVisible();

  await page.getByRole('button', { name: 'Enregistrer un message vocal' }).click();
  await expect(page.getByRole('button', { name: 'Arrêter l’enregistrement' })).toBeVisible();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Arrêter l’enregistrement' }).click();
  await expect(page.getByRole('button', { name: 'Lire le message vocal' })).toBeVisible();

  // Aucun clic : transcription puis propositions, reprises dans les champs vides.
  await expect(page.getByText(/^Champs préremplis d’après votre message/)).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Catégorie' })).toHaveText('Photocopies');
  await expect(page.getByRole('combobox', { name: /^Destinataire/ })).toHaveText('Reprographie — Reprographie');
  await expect(page.getByLabel('Titre', { exact: true })).not.toHaveValue('');
  await expectNoA11yViolations(page);

  // Les propositions restent modifiables : titre propre à ce test.
  const title = `Vocal transmis (${testInfo.project.name} ${Date.now()})`;
  await page.getByLabel('Titre', { exact: true }).fill(title);
  await clickInView(page.getByRole('radio', { name: 'Moyenne' }));
  await expect(page.getByRole('radio', { name: 'Moyenne' })).toBeChecked();
  await clickInView(page.getByRole('button', { name: 'Envoyer la demande' }));
  await expect(page.getByText('Votre demande a été envoyée.')).toBeVisible();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const requestUrl = page.url();

  // Le destinataire écoute le vocal original.
  await logout(page);
  await login(page, 'reprographie');
  await page.goto(requestUrl);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lire le message vocal' })).toBeVisible();
  // Fichier servi au destinataire, avec sa session : le vocal original joint à la demande.
  const requestId = new URL(requestUrl).pathname.split('/').pop();
  const detail = (await (await page.request.get(`/api/requests/${requestId}`)).json()) as { voice: { fileId: string } | null };
  expect(detail.voice).not.toBeNull();
  const audio = await page.request.get(`/api/files/${detail.voice!.fileId}`);
  expect(audio.status()).toBe(200);
  expect(audio.headers()['content-type']).toBe('audio/mp4');
  expect((await audio.body()).length).toBeGreaterThan(0);
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
  await fillDescription(page, `Le ${marker} de la salle 12 est en panne.`);
  await clickInView(page.getByRole('button', { name: 'Proposer une catégorie et une priorité' }));

  // Repliées derrière une pastille « N demande(s) similaire(s) ».
  await clickInView(page.getByRole('button', { name: /demandes? similaires?$/ }));
  const list = page.getByRole('list', { name: 'Demandes similaires' });
  const link = list.getByRole('link', { name: new RegExp(marker) });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('href', `/demandes/${((await created.json()) as { id: string }).id}`);
  await expectNoA11yViolations(page);
});
