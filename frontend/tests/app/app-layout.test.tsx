import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from '../../src/app/AppLayout';

// Temps réel neutralisé : AppLayout ouvre sa propre connexion Socket.IO.
vi.mock('socket.io-client', () => ({
  io: () => ({
    on() {
      return this;
    },
    disconnect() {
      return this;
    },
  }),
}));

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
  jobTitle: null,
  role: 'EMPLOYEE',
  permissions: [],
  mustChangePassword: false,
  isTeacher: true,
  isSupervisor: false,
};

/** Point de rupture « md » (900 px) de AppLayout : barre latérale au-dessus, tiroir en dessous. */
function setViewport(desktop: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: desktop && query.includes('min-width'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })),
  );
}

function renderLayout(path: string, desktop: boolean): void {
  setViewport(desktop);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/api/auth/me')) return json(200, me);
      if (url.includes('/api/notifications')) return json(200, { items: [], nextCursor: null, unreadTotal: 0 });
      return json(200, []);
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <p>Accueil</p> },
          { path: 'profil', element: <h1>Page profil</h1> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(<RouterProvider router={router} />, { wrapper });
}

const profileLink = () => screen.findByRole('link', { name: /^Mon profil : / });

describe('AppLayout — lien du bloc profil (spec 005, FR-001)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('desktop : le bloc profil est un lien vers /profil, nom accessible complet', async () => {
    renderLayout('/', true);
    const link = await profileLink();
    expect(link).toHaveAccessibleName('Mon profil : Enseignante, Employé');
    expect(link).toHaveAttribute('href', '/profil');
    expect(link).not.toHaveAttribute('aria-current');
    await userEvent.click(link);
    expect(await screen.findByRole('heading', { name: 'Page profil' })).toBeVisible();
  });

  it('marque le lien comme page courante sur /profil', async () => {
    renderLayout('/profil', true);
    expect(await profileLink()).toHaveAttribute('aria-current', 'page');
  });

  it('mobile : le lien est dans le tiroir du menu et le ferme', async () => {
    renderLayout('/', false);
    await userEvent.click(await screen.findByRole('button', { name: 'Ouvrir le menu' }));
    const drawer = await screen.findByRole('presentation');
    const link = within(drawer).getByRole('link', { name: /^Mon profil : / });
    await userEvent.click(link);
    expect(await screen.findByRole('heading', { name: 'Page profil' })).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('link', { name: /^Mon profil : / })).not.toBeInTheDocument());
  });
});
