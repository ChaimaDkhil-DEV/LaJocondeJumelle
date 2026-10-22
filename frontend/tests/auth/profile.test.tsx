import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChangePasswordPage } from '../../src/features/auth/ChangePasswordPage';
import { ProfilePage } from '../../src/features/auth/ProfilePage';
import { RequireAuth } from '../../src/features/auth/RequireAuth';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const me = {
  id: 'u1',
  username: 'enseignante',
  displayName: 'Enseignante',
  jobTitle: 'Professeure des écoles',
  role: 'EMPLOYEE',
  permissions: [],
  mustChangePassword: false,
  isTeacher: true,
  isSupervisor: false,
};

/** /profil derrière RequireAuth, comme dans l'application (enfant du gabarit protégé). */
function renderAt(path: string, handler: Handler): void {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => handler(url, init)));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/mot-de-passe', element: <ChangePasswordPage /> },
      {
        path: '/profil',
        element: (
          <RequireAuth>
            <ProfilePage />
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

describe('ProfilePage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('affiche le titre « Mon profil » une fois le compte chargé', async () => {
    renderAt('/profil', () => json(200, me));
    expect(await screen.findByRole('heading', { level: 1, name: 'Mon profil' })).toBeVisible();
  });

  // Chargement et erreur : assurés par RequireAuth avant tout rendu de la page (état commun).
  it('montre l’état de chargement commun tant que le compte n’est pas chargé', () => {
    renderAt('/profil', () => new Promise<Response>(() => undefined));
    expect(screen.getByText('Chargement de votre espace')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mon profil' })).not.toBeInTheDocument();
  });

  it('montre l’état d’erreur commun si le compte ne peut pas être chargé', async () => {
    renderAt('/profil', () => json(500, { error: { code: 'INTERNAL', message: 'Service indisponible.' } }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Service indisponible.');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Mon profil' })).not.toBeInTheDocument();
  });

  it('propose « Changer mon mot de passe » vers le parcours existant (FR-006, FR-013)', async () => {
    renderAt('/profil', () => json(200, me));
    const action = await screen.findByRole('link', { name: 'Changer mon mot de passe' });
    expect(action).toHaveAttribute('href', '/mot-de-passe');
    await userEvent.click(action);
    expect(await screen.findByRole('heading', { name: 'Changer votre mot de passe' })).toBeVisible();
  });

  it('n’affiche aucune confirmation sans changement préalable', async () => {
    renderAt('/profil', () => json(200, me));
    await screen.findByRole('heading', { name: 'Mon profil' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('est inatteignable tant que le changement de mot de passe est imposé', async () => {
    renderAt('/profil', () => json(200, { ...me, mustChangePassword: true }));
    expect(await screen.findByRole('heading', { name: 'Changer votre mot de passe' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Mon profil' })).not.toBeInTheDocument();
  });
});

describe('ProfilePage — informations du compte (spec 005, US2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Valeur affichée pour un terme de la liste (élément dt suivi de son dd). */
  async function valueOf(term: string): Promise<string> {
    const dt = await screen.findByText(term, { selector: 'dt' });
    return dt.nextElementSibling?.textContent ?? '';
  }

  it('affiche nom, identifiant, fonction, rôle et groupes en lecture seule', async () => {
    renderAt('/profil', () => json(200, me));
    expect(await valueOf('Nom')).toBe('Enseignante');
    expect(await valueOf('Identifiant de connexion')).toBe('enseignante');
    expect(await valueOf('Fonction')).toBe('Professeure des écoles');
    expect(await valueOf('Rôle')).toBe('Employé');
    expect(await valueOf('Groupes d’affectation')).toBe('Enseignants');
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getByText('Pour modifier ces informations, adressez-vous à l’administration.')).toBeVisible();
  });

  it('affiche des libellés explicites pour une fonction absente et aucun groupe', async () => {
    renderAt('/profil', () => json(200, { ...me, jobTitle: null, isTeacher: false, isSupervisor: false }));
    expect(await valueOf('Fonction')).toBe('Non renseignée');
    expect(await valueOf('Groupes d’affectation')).toBe('Aucun');
  });

  it.each([
    ['ADMIN', 'Admin', true, false, 'Surveillants'],
    ['SUPER_ADMIN', 'Super administrateur', true, true, 'Surveillants, Enseignants'],
  ])('rôle %s et groupes', async (role, roleLabel, isSupervisor, isTeacher, groups) => {
    renderAt('/profil', () => json(200, { ...me, role, isSupervisor, isTeacher }));
    expect(await valueOf('Rôle')).toBe(roleLabel);
    expect(await valueOf('Groupes d’affectation')).toBe(groups);
  });
});
