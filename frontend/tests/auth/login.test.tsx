import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangePasswordPage } from '../../src/features/auth/ChangePasswordPage';
import { LoginPage } from '../../src/features/auth/LoginPage';
import { RequireAuth } from '../../src/features/auth/RequireAuth';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const me = { id: 'u1', displayName: 'Enseignante', role: 'EMPLOYEE', permissions: [], mustChangePassword: false };

function renderAt(path: string, handler: Handler): void {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => handler(url, init)));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/connexion', element: <LoginPage /> },
      { path: '/mot-de-passe', element: <ChangePasswordPage /> },
      {
        path: '/',
        element: (
          <RequireAuth>
            <p>Page protégée</p>
          </RequireAuth>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(<RouterProvider router={router} />, { wrapper });
}

describe('LoginPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a des champs libellés et un bouton explicite', () => {
    renderAt('/connexion', () => json(401));
    expect(screen.getByLabelText('Identifiant')).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
  });

  it('signale les champs vides sans appeler l’API', async () => {
    const handler = vi.fn(() => json(200, { user: me }));
    renderAt('/connexion', handler);
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText('Saisissez votre identifiant.')).toBeVisible();
    expect(screen.getByText('Saisissez votre mot de passe.')).toBeVisible();
    expect(handler).not.toHaveBeenCalled();
  });

  it('affiche le message d’erreur de l’API dans une alerte', async () => {
    renderAt('/connexion', (url) =>
      url.endsWith('/login')
        ? json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Identifiant ou mot de passe incorrect.' } })
        : json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }),
    );
    await userEvent.type(screen.getByLabelText('Identifiant'), 'enseignante');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'faux');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Identifiant ou mot de passe incorrect.');
  });

  it('redirige vers la page d’accueil après connexion', async () => {
    renderAt('/connexion', (url) => (url.endsWith('/login') ? json(200, { user: me }) : json(200, me)));
    await userEvent.type(screen.getByLabelText('Identifiant'), 'enseignante');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'Mot-de-passe-2026');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText('Page protégée')).toBeVisible();
  });

  it('redirige vers le changement de mot de passe si celui-ci est imposé', async () => {
    const pending = { ...me, mustChangePassword: true };
    renderAt('/connexion', (url) => (url.endsWith('/login') ? json(200, { user: pending }) : json(200, pending)));
    await userEvent.type(screen.getByLabelText('Identifiant'), 'nouveau');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'provisoire');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('heading', { name: 'Changer votre mot de passe' })).toBeVisible();
  });
});

describe('RequireAuth', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renvoie vers la connexion sans session (401)', async () => {
    renderAt('/', () => json(401, { error: { code: 'UNAUTHENTICATED', message: 'Session expirée' } }));
    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeVisible();
  });

  it('renvoie vers le changement de mot de passe quand il est imposé', async () => {
    renderAt('/', () => json(200, { ...me, mustChangePassword: true }));
    expect(await screen.findByRole('heading', { name: 'Changer votre mot de passe' })).toBeVisible();
  });

  it('affiche la page protégée avec une session valide', async () => {
    renderAt('/', () => json(200, me));
    expect(await screen.findByText('Page protégée')).toBeVisible();
  });
});

describe('ChangePasswordPage', () => {
  let calls: Array<{ url: string; body: unknown }>;

  beforeEach(() => {
    calls = [];
  });
  afterEach(() => vi.unstubAllGlobals());

  function handler(url: string, init: RequestInit): Response {
    if (url.endsWith('/auth/password')) {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(null, { status: 204 });
    }
    return json(200, { ...me, mustChangePassword: calls.length === 0 });
  }

  it('exige 12 caractères et une confirmation identique', async () => {
    renderAt('/mot-de-passe', handler);
    await userEvent.type(await screen.findByLabelText('Mot de passe actuel'), 'provisoire');
    await userEvent.type(screen.getByLabelText('Nouveau mot de passe'), 'court');
    await userEvent.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), 'autre');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le mot de passe' }));
    expect(await screen.findByText('Au moins 12 caractères.')).toBeVisible();
    expect(screen.getByText('Les deux mots de passe ne correspondent pas.')).toBeVisible();
    expect(calls).toHaveLength(0);
  });

  it('enregistre le nouveau mot de passe puis ouvre l’application', async () => {
    renderAt('/mot-de-passe', handler);
    await userEvent.type(await screen.findByLabelText('Mot de passe actuel'), 'provisoire');
    await userEvent.type(screen.getByLabelText('Nouveau mot de passe'), 'Nouveau-mot-de-passe-2026');
    await userEvent.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), 'Nouveau-mot-de-passe-2026');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le mot de passe' }));
    await waitFor(() =>
      expect(calls[0]?.body).toEqual({ currentPassword: 'provisoire', newPassword: 'Nouveau-mot-de-passe-2026' }),
    );
    expect(await screen.findByText('Page protégée')).toBeVisible();
  });
});
