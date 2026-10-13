import { expect, test } from '@playwright/test';
import { installFakeMediaRecorder } from './support/fake-media-recorder';
import { login } from './support/login';

/**
 * T118 — SC-001 : sur téléphone (profils Pixel 7 et iPhone 13), le parcours complet de création
 * d'une demande vocale — ouverture du formulaire, catégorie, destinataire, priorité, titre,
 * enregistrement de 10 s, réécoute, envoi, confirmation « Envoyée » — prend moins de 60 s.
 * Mesure le temps de l'application (chargements, envoi, conversion), pas la vitesse d'un humain :
 * cette dernière est évaluée au test d'utilisabilité (T120).
 */
const PHONES = ['Pixel 7', 'iPhone 13'];
const RECORDING_SECONDS = 10;
const LIMIT_MS = 60_000;

test('SC-001 — demande vocale complète créée et envoyée en moins de 60 s', async ({ page, browserName }, testInfo) => {
  test.skip(!PHONES.includes(testInfo.project.name), 'Mesure réservée aux profils téléphone');
  test.slow();
  if (browserName === 'webkit') await installFakeMediaRecorder(page);
  await login(page, 'enseignante');
  const title = `SC-001 ${testInfo.project.name} ${Date.now()}`;

  const started = Date.now();
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.getByRole('link', { name: 'Nouvelle demande' }).click();
  await expect(page.getByRole('heading', { name: 'Nouvelle demande' })).toBeVisible();

  await page.getByRole('combobox', { name: 'Catégorie' }).click();
  await page.getByRole('option', { name: 'Photocopies' }).click();
  await page.getByRole('combobox', { name: 'Destinataire' }).click();
  await page.getByRole('option', { name: 'Reprographie — Reprographie' }).click();
  await page.getByRole('radio', { name: 'Urgente' }).check();
  await page.getByLabel('Titre').fill(title);

  await page.getByRole('button', { name: 'Enregistrer un message vocal' }).click();
  await expect(page.getByRole('button', { name: 'Arrêter l’enregistrement' })).toBeVisible();
  await page.waitForTimeout(RECORDING_SECONDS * 1000);
  await page.getByRole('button', { name: 'Arrêter l’enregistrement' }).click();
  await page.getByRole('button', { name: 'Lire le message vocal' }).click();

  await page.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(page.getByText('Votre demande a été envoyée.')).toBeVisible();
  await expect(page.getByText('Envoyée', { exact: true })).toBeVisible();
  const elapsed = Date.now() - started;

  testInfo.annotations.push({ type: 'SC-001', description: `${testInfo.project.name} : ${(elapsed / 1000).toFixed(1)} s (limite 60 s)` });
  expect(elapsed, `durée du parcours : ${elapsed} ms`).toBeLessThan(LIMIT_MS);
});
