import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangePasswordPage } from '../../src/features/auth/ChangePasswordPage';
import { ProfilePage } from '../../src/features/auth/ProfilePage';

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const me = {
  id: 'u1',
  username: 'autre',
  displayName: 'Autre employé',
  jobTitle: null,
  role: 'EMPLOYEE',
  permissions: [],
  mustChangePassword: false,
  isTeacher: false,
  isSupervisor: false,
};

const CONFIRMATION = 'Mot de passe modifié. Vos autres sessions ont été fermées.';

let posts: unknown[];

/** `forced` : état serveur avant le changement ; après, le compte n'a plus de changement imposé. */
function renderPasswordPage(forced: boolean, passwordResponse: () => Response = () => new Response(null, { status: 204 })): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/api/auth/password')) {
        posts.push(JSON.parse(String(init.body)));
        return passwordResponse();
      }
      return json(200, { ...me, mustChangePassword: forced && posts.length === 0 });
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/mot-de-passe', element: <ChangePasswordPage /> },
      { path: '/profil', element: <ProfilePage /> },
      { path: '/', element: <p>Accueil</p> },
    ],
    { initialEntries: ['/mot-de-passe'] },
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(<RouterProvider router={router} />, { wrapper });
}

async function fill(current: string, next: string, confirmation = next): Promise<void> {
  if (current) await userEvent.type(await screen.findByLabelText('Mot de passe actuel'), current);
  else await screen.findByLabelText('Mot de passe actuel');
  await userEvent.type(screen.getByLabelText('Nouveau mot de passe'), next);
  await userEvent.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), confirmation);
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le mot de passe' }));
}

describe('ChangePasswordPage — mode volontaire (spec 005, FR-007, FR-008)', () => {
  beforeEach(() => {
    posts = [];
  });
  afterEach(() => vi.unstubAllGlobals());

  it('« Annuler » ramène au profil sans rien enregistrer', async () => {
    renderPasswordPage(false);
    await userEvent.click(await screen.findByRole('button', { name: 'Annuler' }));
    expect(await screen.findByRole('heading', { name: 'Mon profil' })).toBeVisible();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it('après un changement réussi, revient au profil avec la confirmation annoncée', async () => {
    renderPasswordPage(false);
    await fill('Ancien-mot-de-passe-2026', 'Nouveau-mot-de-passe-2026');
    await waitFor(() =>
      expect(posts[0]).toEqual({ currentPassword: 'Ancien-mot-de-passe-2026', newPassword: 'Nouveau-mot-de-passe-2026' }),
    );
    expect(await screen.findByRole('heading', { name: 'Mon profil' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(CONFIRMATION);
  });

  it('garde les contrôles actuels : champs vides, longueur, confirmation', async () => {
    renderPasswordPage(false);
    await fill('', 'court', 'autre');
    expect(await screen.findByText('Saisissez votre mot de passe actuel.')).toBeVisible();
    expect(screen.getByText('Au moins 12 caractères.')).toBeVisible();
    expect(screen.getByText('Les deux mots de passe ne correspondent pas.')).toBeVisible();
    expect(posts).toHaveLength(0);
  });

  it('affiche sous le champ le refus du serveur pour un mot de passe actuel faux', async () => {
    renderPasswordPage(false, () =>
      json(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Certaines informations sont manquantes ou invalides.',
          details: { fields: [{ field: 'currentPassword', messages: ['Mot de passe actuel incorrect.'] }] },
        },
      }),
    );
    await fill('Faux-mot-de-passe-2026', 'Nouveau-mot-de-passe-2026');
    expect(await screen.findByText('Mot de passe actuel incorrect.')).toBeVisible();
    expect(screen.getByLabelText('Mot de passe actuel')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('heading', { name: 'Mon profil' })).not.toBeInTheDocument();
  });
});

describe('ChangePasswordPage — mode imposé inchangé (spec 005, FR-009)', () => {
  beforeEach(() => {
    posts = [];
  });
  afterEach(() => vi.unstubAllGlobals());

  it('n’offre pas d’annulation et mène à l’accueil après le changement', async () => {
    renderPasswordPage(true);
    expect(await screen.findByText(/Pour sécuriser votre compte/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument();
    await fill('Provisoire-2026-xyz', 'Nouveau-mot-de-passe-2026');
    expect(await screen.findByText('Accueil')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Mon profil' })).not.toBeInTheDocument();
  });
});
