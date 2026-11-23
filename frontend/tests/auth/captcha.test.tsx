import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../../src/features/auth/LoginPage';
import { TURNSTILE_SCRIPT_URL, type TurnstileOptions } from '../../src/features/auth/turnstile';

/** CAPTCHA Cloudflare Turnstile de la page de connexion : l'API de Cloudflare et celle de l'application sont simulées. */

const me = { id: 'u1', displayName: 'Enseignante', role: 'EMPLOYEE', permissions: [], mustChangePassword: false };
const SITE_KEY = '1x00000000000000000000AA';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
const apiError = (status: number, code: string, message: string) => json(status, { error: { code, message } });

const turnstile = { render: vi.fn<(container: HTMLElement, options: TurnstileOptions) => string>(), reset: vi.fn(), remove: vi.fn() };
/** Options du dernier widget affiché : ses rappels simulent Cloudflare. */
const widget = () => turnstile.render.mock.calls.at(-1)![1];
const solve = (token: string) => act(() => widget().callback(token));

let siteKey: string | null;
let captchaAnswer: () => Response;
let loginBodies: Array<Record<string, unknown>>;
let loginAnswer: () => Response;

function renderLogin(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/captcha')) return captchaAnswer();
      loginBodies.push(JSON.parse(String(init.body)));
      return loginAnswer();
    }),
  );
  const router = createMemoryRouter(
    [
      { path: '/connexion', element: <LoginPage /> },
      { path: '/', element: <p>Accueil</p> },
    ],
    { initialEntries: ['/connexion'] },
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function submit(): Promise<void> {
  fireEvent.change(screen.getByLabelText('Identifiant'), { target: { value: 'enseignante' } });
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'Mot-de-passe-2026' } });
  await userEvent.click(screen.getByRole('button', { name: /Se connecter/ }));
}
const scripts = () => [...document.querySelectorAll('script')].filter((s) => s.src === TURNSTILE_SCRIPT_URL);
const widgetReady = () => waitFor(() => expect(turnstile.render).toHaveBeenCalled());

beforeEach(() => {
  siteKey = SITE_KEY;
  captchaAnswer = () => json(200, { siteKey });
  loginBodies = [];
  loginAnswer = () => json(200, { user: me });
  let count = 0;
  turnstile.render.mockReset().mockImplementation(() => `widget-${(count += 1)}`);
  turnstile.reset.mockReset();
  turnstile.remove.mockReset();
  vi.stubGlobal('turnstile', turnstile);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  for (const script of scripts()) script.remove();
});

describe('CAPTCHA désactivé', () => {
  it('ne charge rien de Cloudflare et envoie la connexion comme avant', async () => {
    siteKey = null;
    vi.stubGlobal('turnstile', undefined);
    renderLogin();
    await submit();
    expect(await screen.findByText('Accueil')).toBeVisible();
    expect(loginBodies).toEqual([{ username: 'enseignante', password: 'Mot-de-passe-2026' }]);
    expect(scripts()).toHaveLength(0);
  });
});

describe('CAPTCHA activé', () => {
  it('affiche le widget avec la clé publique, l’action et la langue, sans l’imposer aux personnes légitimes', async () => {
    renderLogin();
    await widgetReady();
    expect(widget()).toMatchObject({ sitekey: SITE_KEY, action: 'login', language: 'fr', appearance: 'interaction-only' });
    expect(['compact', 'flexible']).toContain(widget().size);
  });

  it('envoie le jeton avec la connexion', async () => {
    renderLogin();
    await widgetReady();
    await solve('jeton-1');
    await submit();
    expect(await screen.findByText('Accueil')).toBeVisible();
    expect(loginBodies).toEqual([{ username: 'enseignante', password: 'Mot-de-passe-2026', captchaToken: 'jeton-1' }]);
  });

  it('attend la fin de la vérification avant d’envoyer la connexion', async () => {
    renderLogin();
    await widgetReady();
    await submit();
    expect(loginBodies).toHaveLength(0);
    await solve('jeton-tardif');
    await waitFor(() => expect(loginBodies).toHaveLength(1));
    expect(loginBodies[0]).toMatchObject({ captchaToken: 'jeton-tardif' });
  });

  it('retire le widget en quittant la page', async () => {
    renderLogin();
    await widgetReady();
    await solve('jeton-1');
    await submit();
    await screen.findByText('Accueil');
    expect(turnstile.remove).toHaveBeenCalledWith('widget-1');
  });

  it.each([
    ['mot de passe faux', 401, 'INVALID_CREDENTIALS', 'Identifiant ou mot de passe incorrect.'],
    ['jeton refusé', 403, 'CAPTCHA_INVALID', 'La vérification anti-robot a échoué. Réessayez.'],
    ['jeton expiré', 403, 'CAPTCHA_EXPIRED', 'La vérification anti-robot a expiré. Réessayez.'],
    ['Cloudflare indisponible', 503, 'CAPTCHA_UNAVAILABLE', 'La vérification anti-robot est momentanément indisponible. Réessayez dans quelques minutes.'],
  ])('après un refus (%s) : message clair, CAPTCHA réinitialisé, et un nouveau jeton au second essai', async (_label, status, code, message) => {
    loginAnswer = () => apiError(status, code, message);
    renderLogin();
    await widgetReady();
    await solve('jeton-1');
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(turnstile.reset).toHaveBeenCalledWith('widget-1');

    loginAnswer = () => json(200, { user: me });
    await submit();
    expect(loginBodies).toHaveLength(1);
    await solve('jeton-2');
    expect(await screen.findByText('Accueil')).toBeVisible();
    expect(loginBodies.map((b) => b.captchaToken)).toEqual(['jeton-1', 'jeton-2']);
  });

  it('n’envoie jamais un jeton expiré : il attend le suivant', async () => {
    renderLogin();
    await widgetReady();
    await solve('jeton-expire');
    act(() => widget()['expired-callback']());
    await submit();
    expect(loginBodies).toHaveLength(0);
    await solve('jeton-neuf');
    await waitFor(() => expect(loginBodies[0]).toMatchObject({ captchaToken: 'jeton-neuf' }));
  });

  it('erreur du widget : message et relance, sans envoyer la connexion sans jeton', async () => {
    renderLogin();
    await widgetReady();
    act(() => widget()['error-callback']());
    expect(await screen.findByText(/vérification anti-robot n’a pas pu démarrer/)).toBeVisible();
    await submit();
    expect(await screen.findByText(/Connexion non envoyée/)).toBeVisible();
    expect(loginBodies).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Relancer la vérification' }));
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(2));
    expect(turnstile.remove).toHaveBeenCalledWith('widget-1');
    expect(screen.queryByText(/n’a pas pu démarrer/)).not.toBeInTheDocument();
    await solve('jeton-2');
    await submit();
    expect(await screen.findByText('Accueil')).toBeVisible();
  });

  it('une erreur passagère que Cloudflare résout seul efface le message', async () => {
    renderLogin();
    await widgetReady();
    act(() => widget()['error-callback']());
    expect(await screen.findByText(/n’a pas pu démarrer/)).toBeVisible();
    await solve('jeton-1');
    expect(screen.queryByText(/n’a pas pu démarrer/)).not.toBeInTheDocument();
  });

  it('vérification jamais terminée : la connexion rend la main avec un message, sans interrompre le widget', async () => {
    renderLogin();
    await widgetReady();
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 20 });
    fireEvent.change(screen.getByLabelText('Identifiant'), { target: { value: 'enseignante' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'Mot-de-passe-2026' } });
    fireEvent.click(screen.getByRole('button', { name: /Se connecter/ }));
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByText(/La vérification anti-robot n’est pas terminée/)).toBeVisible();
    expect(loginBodies).toHaveLength(0);
    expect(turnstile.reset).not.toHaveBeenCalled();
  });

  it('script bloqué : message, et la relance recharge la page (la politique de sécurité ouverte avec elle a pu changer)', async () => {
    vi.stubGlobal('turnstile', undefined);
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    renderLogin();
    await waitFor(() => expect(scripts()).toHaveLength(1));
    act(() => void scripts()[0]!.dispatchEvent(new Event('error')));
    expect(await screen.findByText(/n’a pas pu démarrer/)).toBeVisible();
    expect(scripts()).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Relancer la vérification' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('script qui ne répond jamais : le message et la relance apparaissent', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 20 });
    vi.stubGlobal('turnstile', undefined);
    renderLogin();
    await waitFor(() => expect(scripts()).toHaveLength(1));
    await act(() => vi.advanceTimersByTimeAsync(16_000));
    expect(screen.getByRole('button', { name: 'Relancer la vérification' })).toBeVisible();
    expect(scripts()).toHaveLength(0);
  });

  it('vérification jamais terminée puis CAPTCHA désactivé en urgence : l’essai suivant aboutit sans recharger la page', async () => {
    renderLogin();
    await widgetReady();
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 20 });
    fireEvent.change(screen.getByLabelText('Identifiant'), { target: { value: 'enseignante' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'Mot-de-passe-2026' } });
    fireEvent.click(screen.getByRole('button', { name: /Se connecter/ }));
    siteKey = null;
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    vi.useRealTimers();
    await waitFor(() => expect(turnstile.remove).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Se connecter/ }));
    expect(await screen.findByText('Accueil')).toBeVisible();
    expect(loginBodies).toEqual([{ username: 'enseignante', password: 'Mot-de-passe-2026' }]);
  });

  it('un rappel tardif d’un widget retiré ne touche pas au nouveau', async () => {
    renderLogin();
    await widgetReady();
    const old = widget();
    act(() => old['error-callback']());
    await userEvent.click(await screen.findByRole('button', { name: 'Relancer la vérification' }));
    await waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(2));
    await solve('jeton-neuf');
    act(() => {
      old['expired-callback']();
      old['error-callback']();
    });
    await submit();
    expect(await screen.findByText('Accueil')).toBeVisible();
    expect(loginBodies[0]).toMatchObject({ captchaToken: 'jeton-neuf' });
  });

  it('CAPTCHA activé après l’ouverture de la page : le refus du serveur affiche le widget, la connexion suivante aboutit', async () => {
    siteKey = null;
    loginAnswer = () => apiError(403, 'CAPTCHA_REQUIRED', 'La vérification anti-robot est obligatoire. Rechargez la page puis réessayez.');
    renderLogin();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    siteKey = SITE_KEY;
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('La vérification anti-robot est obligatoire');
    await widgetReady();
    loginAnswer = () => json(200, { user: me });
    await solve('jeton-1');
    await submit();
    expect(await screen.findByText('Accueil')).toBeVisible();
  });

  it('CAPTCHA désactivé en urgence pendant une panne : relancer la vérification suffit à pouvoir se connecter', async () => {
    renderLogin();
    await widgetReady();
    act(() => widget()['error-callback']());
    siteKey = null;
    await userEvent.click(await screen.findByRole('button', { name: 'Relancer la vérification' }));
    await waitFor(() => expect(turnstile.remove).toHaveBeenCalledWith('widget-1'));
    await submit();
    expect(await screen.findByText('Accueil')).toBeVisible();
    expect(loginBodies).toEqual([{ username: 'enseignante', password: 'Mot-de-passe-2026' }]);
  });

  it('configuration illisible : la connexion n’est pas bloquée par l’interface, le serveur décide', async () => {
    captchaAnswer = () => apiError(500, 'INTERNAL_ERROR', 'x');
    renderLogin();
    await submit();
    expect(await screen.findByText('Accueil')).toBeVisible();
    expect(loginBodies).toEqual([{ username: 'enseignante', password: 'Mot-de-passe-2026' }]);
  });
});
