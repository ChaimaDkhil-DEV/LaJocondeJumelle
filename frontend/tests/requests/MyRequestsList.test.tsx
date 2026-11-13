import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestListPage } from '../../src/features/requests/RequestListPage';

/** « Mes demandes » : onglet par défaut, sections, une ligne simple par demande, action principale. */

vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  values: async () => [],
}));

function summary(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    reference: `D-${id}`,
    title: `Demande ${id}`,
    category: { id: 'c', name: 'Photocopies' },
    priority: 'NORMAL',
    status: 'SENT',
    requester: { id: 'u1', displayName: 'Mme Martin' },
    assignee: { id: 'u2', displayName: 'Reprographie' },
    createdAt: '2026-11-10T08:00:00.000Z',
    currentStage: null,
    currentDueAt: null,
    warnAt: null,
    overdueStage: null,
    hasVoice: true,
    unreadCount: 0,
    ...over,
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

type Lists = Partial<Record<'managed' | 'assigned' | 'mine' | 'all', unknown[]>>;

function renderPage(lists: Lists, { role = 'ADMIN', path = '/' } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/me') {
        return json({ id: 'm1', displayName: 'Responsable', role, permissions: [], mustChangePassword: false });
      }
      if (url.startsWith('/api/requests?scope=drafts')) return json({ items: [], nextCursor: null });
      if (!url.startsWith('/api/requests?')) return json([]);
      const scope = /scope=(\w+)/.exec(url)?.[1] as keyof Lists | undefined;
      return json({ items: (scope && lists[scope]) ?? [], nextCursor: null });
    }),
  );
  const router = createMemoryRouter([{ path: '/', element: <RequestListPage /> }], { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('onglets', () => {
  it('ordre À valider (avec compteur), Reçues, Envoyées, Suivi ; À valider ouvert par défaut', async () => {
    renderPage({ managed: [summary('v1', { status: 'PENDING_ADMIN_VALIDATION' }), summary('v2', { status: 'PENDING_ADMIN_VALIDATION' })] });
    const first = await screen.findByRole('tab', { name: 'À valider (2)' });
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['À valider (2)', 'Reçues', 'Envoyées', 'Suivi']);
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Demande v1')).toBeVisible();
  });

  it('sans demande à valider : « Reçues » par défaut, onglet sans compteur', async () => {
    renderPage({ assigned: [summary('r1')] });
    const received = await screen.findByRole('tab', { name: 'Reçues' });
    expect(received).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('tab', { name: 'À valider' })).toBeVisible();
    expect(await screen.findByRole('tab', { name: 'Reçues' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Demande r1')).toBeVisible();
  });

  it('employé : Reçues par défaut, pas d’onglet À valider', async () => {
    renderPage({ assigned: [summary('r1')] }, { role: 'EMPLOYEE' });
    expect(await screen.findByRole('tab', { name: 'Reçues' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: /À valider/ })).toBeNull();
  });

  it('l’onglet demandé dans l’adresse l’emporte sur celui par défaut', async () => {
    renderPage({ managed: [summary('v1', { status: 'PENDING_ADMIN_VALIDATION' })], mine: [summary('e1')] }, { path: '/?onglet=envoyees' });
    expect(await screen.findByRole('tab', { name: 'Envoyées' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Demande e1')).toBeVisible();
  });
});

describe('liste', () => {
  const MIXED = [
    summary('normale', { createdAt: '2026-11-12T08:00:00.000Z' }),
    summary('close', { status: 'CLOSED', priority: 'URGENT' }),
    summary('retard', { overdueStage: 'TAKEOVER', createdAt: '2026-11-01T08:00:00.000Z' }),
    summary('urgente', { priority: 'URGENT' }),
    summary('refusee', { status: 'REJECTED' }),
  ];

  function titles(): string[] {
    return screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent ?? '');
  }

  it('deux sections ; urgentes puis en retard, puis normales puis closes', async () => {
    renderPage({ assigned: MIXED }, { role: 'EMPLOYEE' });
    await screen.findByText('Demande urgente');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Prioritaires', 'Autres']);
    expect(titles()).toEqual(['Demande urgente', 'Demande retard', 'Demande normale', 'Demande close', 'Demande refusee']);
    const priority = screen.getByRole('region', { name: 'Prioritaires' });
    expect(within(priority).getAllByRole('listitem')).toHaveLength(2);
  });

  it('pas de section vide : seules des demandes normales, pas de « Prioritaires »', async () => {
    renderPage({ assigned: [summary('a'), summary('b')] }, { role: 'EMPLOYEE' });
    await screen.findByText('Demande a');
    expect(screen.queryByText('Prioritaires')).toBeNull();
    expect(screen.getByText('Autres')).toBeVisible();
    expect(screen.getByText('Demande b')).toBeVisible();
  });

  it('ligne simple : titre, date, priorité toujours, « En retard » si besoin, statut Refusée/Clôturée', async () => {
    renderPage({ assigned: MIXED }, { role: 'EMPLOYEE' });
    await screen.findByText('Demande urgente');
    const row = (title: string) => screen.getByText(title).closest('li') as HTMLElement;

    expect(within(row('Demande urgente')).getByText('Urgente')).toBeVisible();
    expect(within(row('Demande urgente')).queryByText('En retard')).toBeNull();
    expect(within(row('Demande normale')).getByText('Normale')).toBeVisible();
    expect(within(row('Demande retard')).getByText('En retard')).toBeVisible();
    expect(within(row('Demande retard')).getByText('Normale')).toBeVisible();
    expect(within(row('Demande refusee')).getByText('Refusée')).toBeVisible();
    expect(within(row('Demande close')).getByText('Clôturée')).toBeVisible();
    expect(within(row('Demande normale')).queryByText(/Envoyée|Refusée|Clôturée/)).toBeNull();
    expect(row('Demande normale').querySelector('time')).not.toBeNull();
  });

  it('retire de la liste destinataire, catégorie, message vocal, statut long, phrase d’introduction et « N demandes »', async () => {
    renderPage({ assigned: [summary('a', { status: 'PENDING_ADMIN_VALIDATION' })] }, { role: 'EMPLOYEE' });
    await screen.findByText('Demande a');
    expect(screen.queryByText(/Pour :/)).toBeNull();
    expect(screen.queryByText(/De :/)).toBeNull();
    expect(screen.queryByText('Photocopies')).toBeNull();
    expect(screen.queryByText('Message vocal')).toBeNull();
    expect(screen.queryByText(/En attente de validation/)).toBeNull();
    expect(screen.queryByText(/^\d+ demandes?$/)).toBeNull();
  });

  it('une action principale par ligne : Valider (À valider), Corriger (À corriger), sinon Ouvrir', async () => {
    renderPage({
      managed: [summary('v1', { status: 'PENDING_ADMIN_VALIDATION' })],
      assigned: [summary('c1', { status: 'TO_CORRECT' }), summary('o1')],
    });
    expect(await screen.findByRole('link', { name: 'Valider : Demande v1' })).toHaveAttribute('href', '/demandes/v1');

    await userEvent.click(await screen.findByRole('tab', { name: 'Reçues' }));
    expect(await screen.findByRole('link', { name: 'Corriger : Demande c1' })).toHaveAttribute('href', '/demandes/c1');
    expect(screen.getByRole('link', { name: 'Ouvrir : Demande o1' })).toHaveAttribute('href', '/demandes/o1');
    expect(screen.queryByRole('link', { name: /Valider/ })).toBeNull();
  });

  it('cible tactile d’au moins 40 px (hauteur minimale de l’action)', async () => {
    renderPage({ assigned: [summary('a')] }, { role: 'EMPLOYEE' });
    const action = await screen.findByRole('link', { name: 'Ouvrir : Demande a' });
    expect(getComputedStyle(action).minHeight).toBe('40px');
  });
});
