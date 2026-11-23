import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD } from './support/accounts';
import { expectNoA11yViolations } from './support/axe';

/**
 * CAPTCHA Cloudflare Turnstile de la connexion, dans un vrai navigateur. Cloudflare et la clé publique sont simulés :
 * aucun appel externe. La vérification côté serveur est couverte par backend/test/integration/captcha.spec.ts.
 */

const SCRIPT = 'https://challenges.cloudflare.com/**';

/** Faux script Turnstile : une case à cocher aux dimensions du vrai widget, qui rend un jeton. */
const FAKE_TURNSTILE = `
  let count = 0;
  const widgets = new Map();
  const draw = (id) => {
    const { container, options } = widgets.get(id);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Je suis humain';
    button.style.cssText = options.size === 'compact' ? 'width:150px;height:140px' : 'width:100%;min-width:300px;height:65px';
    button.onclick = () => { button.disabled = true; options.callback('jeton-e2e-' + (count += 1)); };
    container.replaceChildren(button);
    options['before-interactive-callback']();
  };
  window.turnstile = {
    render: (container, options) => { const id = 'w' + widgets.size; widgets.set(id, { container, options }); draw(id); return id; },
    reset: (id) => draw(id),
    remove: (id) => { widgets.get(id)?.container.replaceChildren(); widgets.delete(id); },
  };
`;

async function enableCaptcha(page: Page): Promise<void> {
  await page.route('**/api/auth/captcha', (route) => route.fulfill({ json: { siteKey: '1x00000000000000000000AA' } }));
  await page.route(SCRIPT, (route) => route.fulfill({ contentType: 'text/javascript', body: FAKE_TURNSTILE }));
}

async function fill(page: Page, password: string): Promise<void> {
  await page.getByLabel('Identifiant').fill('enseignante');
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
}

async function expectFits(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test('le widget tient dans la page ; après un refus il est réinitialisé, et la connexion suivante aboutit', async ({ page }) => {
  await enableCaptcha(page);
  await page.goto('/connexion');
  const checkbox = page.getByRole('button', { name: 'Je suis humain' });
  await expect(checkbox).toBeVisible();
  await expectFits(page);
  await expectNoA11yViolations(page);

  const tokens: unknown[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/auth/login')) tokens.push((request.postDataJSON() as { captchaToken?: string }).captchaToken);
  });

  await checkbox.click();
  await fill(page, 'mauvais-mot-de-passe');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('alert')).toHaveText('Identifiant ou mot de passe incorrect.');

  await expect(checkbox).toBeEnabled();
  await checkbox.click();
  await fill(page, E2E_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();
  expect(tokens).toEqual(['jeton-e2e-1', 'jeton-e2e-2']);
});

test('script bloqué : message clair, rien n’est envoyé, et la relance permet de se connecter', async ({ page }) => {
  await page.route('**/api/auth/captcha', (route) => route.fulfill({ json: { siteKey: '1x00000000000000000000AA' } }));
  await page.route(SCRIPT, (route) => route.abort());
  let sent = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/auth/login')) sent += 1;
  });
  await page.goto('/connexion');
  const retry = page.getByRole('button', { name: 'Relancer la vérification' });
  await expect(retry).toBeVisible();
  await expectFits(page);
  await expectNoA11yViolations(page);

  await fill(page, E2E_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('Connexion non envoyée : la vérification anti-robot n’a pas abouti.')).toBeVisible();
  expect(sent).toBe(0);

  await page.unroute(SCRIPT);
  await enableCaptcha(page);
  await retry.click();
  await page.getByRole('button', { name: 'Je suis humain' }).click();
  await fill(page, E2E_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();
});
