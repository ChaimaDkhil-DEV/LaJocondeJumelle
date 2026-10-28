import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../src/app/routes';

/** Page d'accueil : tableau de bord pour le super administrateur, « Mes demandes » pour les autres rôles. */

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
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const EMPLOYEE = {
  id: 'u1',
  username: 'enseignante',
  displayName: 'Enseignante',
  jobTitle: null,
  role: 'EMPLOYEE',
  permissions: [],
  mustChangePassword: false,
  isTeacher: false,
  isSupervisor: false,
};
const SUPER_ADMIN = { ...EMPLOYEE, id: 'sa', username: 'superadmin', displayName: 'Super administrateur', role: 'SUPER_ADMIN' };
const ADMIN = { ...EMPLOYEE, id: 'ad', username: 'admin', displayName: 'Admin', role: 'ADMIN' };

function renderAt(path: string, me: unknown) {
  // Barre latérale de bureau (point de rupture « md »).
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('min-width'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })),
  );
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url === '/api/auth/me') return json(200, me);
      if (url.includes('/api/notifications')) return json(200, { items: [], nextCursor: null, unreadTotal: 0 });
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { urls, router };
}

const mainNav = () => screen.getByRole('navigation', { name: 'Navigation principale' });

describe('Page d’accueil', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('super administrateur : le tableau de bord, en première entrée de la navigation', async () => {
    const { urls } = renderAt('/', SUPER_ADMIN);
    // Premier rendu : le module du tableau de bord (Recharts) est chargé à la demande.
    expect(await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' }, { timeout: 10_000 })).toBeVisible();
    expect(urls.some((u) => u.startsWith('/api/admin/dashboard/'))).toBe(true);

    const links = within(mainNav()).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Tableau de bord', 'Mes demandes', 'Nouvelle demande', 'Gardes', 'Administrateur']);
    expect(links[0]).toHaveAttribute('href', '/');
    expect(links[0]).toHaveAttribute('aria-current', 'page');
    expect(links[1]).toHaveAttribute('href', '/demandes');
  });

  it('super administrateur : « Mes demandes » reste accessible sur /demandes', async () => {
    renderAt('/demandes', SUPER_ADMIN);
    expect(await screen.findByRole('heading', { level: 1, name: 'Mes demandes' })).toBeVisible();
    expect(within(mainNav()).getByRole('link', { name: 'Mes demandes' })).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['employé', EMPLOYEE],
    ['admin', ADMIN],
  ])('%s : « Mes demandes » comme avant, sans tableau de bord ni appel /api/admin', async (_label, me) => {
    const { urls } = renderAt('/', me);
    expect(await screen.findByRole('heading', { level: 1, name: 'Mes demandes' })).toBeVisible();
    expect(within(mainNav()).queryByRole('link', { name: 'Tableau de bord' })).not.toBeInTheDocument();
    const mine = within(mainNav()).getByRole('link', { name: 'Mes demandes' });
    expect(mine).toHaveAttribute('href', '/demandes');
    expect(mine).toHaveAttribute('aria-current', 'page');
    expect(urls.some((u) => u.startsWith('/api/admin'))).toBe(false);
  });

  it('l’ancienne adresse /admin/tableau-de-bord mène à l’accueil, vue conservée', async () => {
    const { router } = renderAt('/admin/tableau-de-bord?vue=delais', SUPER_ADMIN);
    // Premier rendu : le module du tableau de bord (Recharts) est chargé à la demande.
    expect(await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' }, { timeout: 10_000 })).toBeVisible();
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('?vue=delais');
  });
});
