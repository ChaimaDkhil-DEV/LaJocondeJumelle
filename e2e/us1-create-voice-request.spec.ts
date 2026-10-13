import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectNoA11yViolations } from './support/axe';
import { installFakeMediaRecorder } from './support/fake-media-recorder';
import { login } from './support/login';

/**
 * T036 — US1 : créer et envoyer une demande vocale (V1), coupure réseau et boîte d'envoi (V3),
 * micro refusé (V4). WebKit n'ayant pas de micro simulé, l'enregistrement y est simulé ;
 * la lecture du vocal converti par le serveur reste réelle dans tous les navigateurs.
 */

function uniqueTitle(base: string, testInfo: TestInfo): string {
  return `${base} [${testInfo.project.name} ${Date.now()}]`;
}

async function choose(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

async function fillCommonFields(page: Page, title: string, priority = 'Normale'): Promise<void> {
  await choose(page, 'Catégorie', 'Photocopies');
  await choose(page, 'Destinataire', 'Reprographie — Reprographie');
  await page.getByRole('radio', { name: priority }).check();
  await page.getByLabel('Titre').fill(title);
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

test('V1 — l’enseignante envoie une demande vocale, la reprographie l’écoute', async ({ page, browserName }, testInfo) => {
  if (browserName === 'webkit') await installFakeMediaRecorder(page);
  const title = uniqueTitle('Photocopies du contrôle', testInfo);

  await login(page, 'enseignante');
  await page.getByRole('link', { name: 'Nouvelle demande' }).first().click();
  await expect(page.getByRole('heading', { name: 'Nouvelle demande' })).toBeVisible();
  await expectNoA11yViolations(page);

  await fillCommonFields(page, title, 'Urgente');
  await recordVoice(page);
  // Réécoute puis « Refaire » : seul le nouvel enregistrement sera envoyé.
  await page.getByRole('button', { name: 'Lire le message vocal' }).click();
  await page.getByRole('button', { name: 'Refaire l’enregistrement' }).click();
  await recordVoice(page);
  await page.getByRole('button', { name: 'Envoyer la demande' }).click();

  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('Votre demande a été envoyée.')).toBeVisible();
  await expect(page.getByText('Envoyée', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Message vocal' })).toBeVisible();
  await expectNoA11yViolations(page);

  await logout(page);
  await login(page, 'reprographie');
  await expect(page.getByRole('tab', { name: 'Reçues' })).toHaveAttribute('aria-selected', 'true');
  await expectNoA11yViolations(page);
  await page.getByRole('link', { name: new RegExp(title.replace(/[[\]]/g, '\\$&')) }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  // Lecture réelle du vocal converti en AAC/MP4 par le serveur. Le WebKit de Playwright sous Windows
  // est compilé sans décodeur AAC (Safari sur iPhone et Mac le lit) : on y vérifie alors le message
  // d'erreur, et la lecture sur un vrai iPhone est couverte par la vérification manuelle T119.
  await page.getByRole('button', { name: 'Lire le message vocal' }).click();
  const playbackError = page.getByRole('alert').filter({ hasText: 'Lecture impossible' });
  const audio = page.locator('audio');
  await expect
    .poll(
      async () =>
        (await playbackError.isVisible()) ||
        (await audio.evaluate((element: HTMLAudioElement) => element.currentTime)) > 0,
      { timeout: 10_000 },
    )
    .toBe(true);

  if (await playbackError.isVisible()) {
    // Seule exception tolérée : le WebKit de Playwright sous Windows (sans décodeur AAC).
    expect(browserName === 'webkit' && process.platform === 'win32', 'Lecture impossible').toBe(true);
    testInfo.annotations.push({
      type: 'limitation',
      description: 'WebKit Playwright sous Windows sans décodeur AAC : lecture vérifiée manuellement sur iPhone (T119)',
    });
    return;
  }
  const duration = await page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.duration);
  expect(duration).toBeGreaterThan(1);
});

test('V3 — une coupure réseau conserve la demande, renvoyée une seule fois', async ({ page }, testInfo) => {
  const title = uniqueTitle('Affiches A3', testInfo);
  await login(page, 'enseignante');
  await page.goto('/demandes/nouvelle');
  await fillCommonFields(page, title);
  await page.getByLabel('Description (facultative)').fill('20 exemplaires couleur');

  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Envoyer la demande' }).click();
  const sendError = page.getByRole('alert').filter({ hasText: 'n’a pas pu être envoyée' });
  await expect(sendError).toBeVisible();
  await expect(sendError).toContainText('boîte d’envoi');
  await page.context().setOffline(false);

  await page.goto('/');
  const outbox = page.getByRole('region', { name: 'Boîte d’envoi' });
  await expect(outbox).toContainText(title);
  await outbox.getByRole('button', { name: 'Réessayer' }).click();
  await expect(outbox).toBeHidden();

  await page.getByRole('tab', { name: 'Envoyées' }).click();
  await expect(page.getByRole('link', { name: new RegExp(title.replace(/[[\]]/g, '\\$&')) })).toHaveCount(1);
});

test('V4 — micro refusé : explication, et envoi possible avec une description', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => Promise.reject(new DOMException('Permission refusée', 'NotAllowedError')),
      },
    });
    if (typeof window.MediaRecorder === 'undefined') {
      Object.defineProperty(window, 'MediaRecorder', {
        configurable: true,
        value: class {
          static isTypeSupported(type: string) {
            return type === 'audio/mp4';
          }
        },
      });
    }
  });
  const title = uniqueTitle('Sans micro', testInfo);

  await login(page, 'enseignante');
  await page.goto('/demandes/nouvelle');
  await fillCommonFields(page, title);
  await page.getByRole('button', { name: 'Enregistrer un message vocal' }).click();
  await expect(page.getByRole('alert')).toContainText('micro');
  await expect(page.getByRole('alert')).toContainText('description écrite');

  await page.getByLabel('Description (facultative)').fill('Merci de photocopier le document posé sur votre bureau.');
  await page.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});
