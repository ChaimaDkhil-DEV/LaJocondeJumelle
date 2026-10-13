import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestListPage } from '../../src/features/requests/RequestListPage';

/** T092 — filtres de la liste : synchronisés avec l'URL, combinés, réinitialisables. */

vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  values: async () => [],
}));

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setup(initial = '/?onglet=envoyees') {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url === '/api/auth/me') return json(200, { id: 'u1', displayName: 'Enseignante', role: 'EMPLOYEE', permissions: [], mustChangePassword: false });
      if (url === '/api/categories') return json(200, [{ id: 'cat-a', name: 'Photocopies', circuit: 'A_DIRECT', photoRequired: false }]);
      if (url === '/api/categories/cat-a/recipients') return json(200, [{ id: 'repro', displayName: 'Reprographie', jobTitle: null }]);
      if (url.startsWith('/api/requests?')) return json(200, { items: [], nextCursor: null });
      return json(404);
    }),
  );
  const router = createMemoryRouter([{ path: '/', element: <RequestListPage /> }], { initialEntries: [initial] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const lastList = () => [...urls].reverse().find((u) => u.startsWith('/api/requests?')) ?? '';
  return { router, lastList };
}

async function openFilters(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: /^Filtres/ }));
}

async function choose(label: string, option: string): Promise<void> {
  await userEvent.click(screen.getByRole('combobox', { name: label }));
  await userEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: option }));
  await userEvent.keyboard('{Escape}');
}

describe('RequestFilters', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('combine statut et priorité, dans l’URL et dans la requête', async () => {
    const { router, lastList } = setup();
    await openFilters();
    await choose('Statut', 'En cours');
    await choose('Priorité', 'Urgente');
    await waitFor(() => expect(lastList()).toBe('/api/requests?scope=mine&status=IN_PROGRESS&priority=URGENT'));
    expect(router.state.location.search).toContain('statut=IN_PROGRESS');
    expect(router.state.location.search).toContain('priorite=URGENT');
  });

  it('recherche dans les titres à la validation', async () => {
    const { lastList } = setup();
    await openFilters();
    await userEvent.type(screen.getByLabelText('Rechercher dans les titres'), 'brevet{Enter}');
    await waitFor(() => expect(lastList()).toBe('/api/requests?scope=mine&q=brevet'));
  });

  it('filtre par catégorie puis par destinataire de la catégorie', async () => {
    const { lastList } = setup();
    await openFilters();
    expect(screen.queryByRole('combobox', { name: 'Destinataire' })).not.toBeInTheDocument();
    await choose('Catégorie', 'Photocopies');
    await choose('Destinataire', 'Reprographie');
    await waitFor(() => expect(lastList()).toBe('/api/requests?scope=mine&categoryId=cat-a&assigneeId=repro'));
  });

  it('filtre par période et par retard', async () => {
    const { lastList } = setup();
    await openFilters();
    await userEvent.type(screen.getByLabelText('Du'), '2026-04-01');
    await userEvent.type(screen.getByLabelText('Au'), '2026-04-30');
    await userEvent.click(screen.getByRole('checkbox', { name: 'En retard uniquement' }));
    await waitFor(() => expect(lastList()).toBe('/api/requests?scope=mine&from=2026-04-01&to=2026-04-30&overdue=true'));
  });

  it('reprend les filtres présents dans l’URL et indique leur nombre', async () => {
    const { lastList } = setup('/?onglet=envoyees&statut=DONE&priorite=HIGH&retard=1');
    expect(await screen.findByRole('button', { name: 'Filtres (3 actifs)' })).toBeVisible();
    await waitFor(() => expect(lastList()).toBe('/api/requests?scope=mine&status=DONE&priority=HIGH&overdue=true'));
  });

  it('réinitialise les filtres et annonce une liste vide filtrée', async () => {
    const { router, lastList } = setup('/?onglet=envoyees&statut=DONE');
    expect(await screen.findByText('Aucune demande ne correspond à ces filtres.')).toBeVisible();
    await openFilters();
    await userEvent.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
    await waitFor(() => expect(lastList()).toBe('/api/requests?scope=mine'));
    expect(router.state.location.search).toBe('?onglet=envoyees');
  });
});
