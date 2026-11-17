import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { workspaceRoutes } from '../../src/features/admin-workspace/workspaceRoutes';

/**
 * T016 — 018, US1 et US4 : espace de travail de l'administrateur (tableau de bord, file commune, mes
 * demandes, mon historique). Les chiffres et les listes viennent du serveur ; rien n'est inventé.
 */

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const ADMIN = { id: 'a1', username: 'admin', displayName: 'Mme Admin', jobTitle: null, role: 'ADMIN', permissions: [], mustChangePassword: false, isTeacher: false, isSupervisor: false };

function summary(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    reference: `D-2026-00000${id}`,
    title: `Demande ${id}`,
    description: `Description ${id}`,
    category: { id: 'c', name: 'Intervention technique' },
    priority: 'NORMAL',
    status: 'PENDING_ADMIN_VALIDATION',
    requester: { id: 'u1', displayName: 'Mme Martin' },
    assignee: null,
    adminOwner: null,
    adminOwnedAt: null,
    createdAt: '2026-11-10T08:00:00.000Z',
    currentStage: null,
    currentDueAt: null,
    warnAt: null,
    overdueStage: null,
    hasVoice: false,
    unreadCount: 0,
    ...over,
  };
}

const page = (items: unknown[]) => json({ items, nextCursor: null });

/** Les appels reçus par le faux serveur, pour vérifier ce que l'interface envoie. */
let calls: Array<{ url: string; method: string; body: unknown }> = [];

function renderWorkspace(path: string, handler: Handler, me: unknown = ADMIN) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url === '/api/auth/me') return json(me);
      return (await handler(url, init)) ?? json({ error: { code: 'NOT_FOUND', message: `Route non simulée : ${url}` } }, 404);
    }),
  );
  const router = createMemoryRouter([...workspaceRoutes, { path: '/demandes/:id', element: <h1>Détail de la demande</h1> }], {
    initialEntries: [path],
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

afterEach(() => vi.unstubAllGlobals());

describe('Espace de travail — navigation et accès', () => {
  it('propose les rubriques de l’administrateur, la rubrique ouverte étant signalée', async () => {
    renderWorkspace('/espace/file', (url) => (url.startsWith('/api/admin/requests/available') ? page([]) : undefined));
    const nav = await screen.findByRole('navigation', { name: 'Rubriques de l’espace de travail' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Tableau de bord', 'File commune', 'Mes demandes', 'Demandes en cours', 'Demandes terminées', 'Collaboration', 'Mon historique']);
    expect(within(nav).getByRole('link', { name: 'File commune' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1, name: 'Espace de travail' })).toBeVisible();
  });

  it('refuse l’espace à un employé, sans appeler les routes d’administration', async () => {
    renderWorkspace('/espace', () => undefined, { ...ADMIN, role: 'EMPLOYEE' });
    expect(await screen.findByText('Accès réservé aux administrateurs.')).toBeVisible();
    expect(calls.filter((c) => c.url.startsWith('/api/admin/'))).toEqual([]);
  });
});

describe('Tableau de bord', () => {
  const counts = { available: 3, mine: 5, active: 4, finished: 1, transfersReceivedPending: 0, transfersSentPending: 0 };

  it('affiche les compteurs du serveur, chacun menant à sa liste', async () => {
    renderWorkspace('/espace', (url) => (url === '/api/admin/requests/summary' ? json(counts) : undefined));
    const card = async (name: RegExp) => screen.findByRole('link', { name });
    expect(await card(/Demandes disponibles : 3/)).toHaveAttribute('href', '/espace/file');
    expect(await card(/Mes demandes : 5/)).toHaveAttribute('href', '/espace/mes-demandes');
    expect(await card(/Demandes en cours : 4/)).toHaveAttribute('href', '/espace/en-cours');
    expect(await card(/Demandes terminées : 1/)).toHaveAttribute('href', '/espace/terminees');
  });

  it('n’affiche aucun chiffre tant que le serveur n’a pas répondu, ni en cas d’erreur', async () => {
    renderWorkspace('/espace', (url) => (url === '/api/admin/requests/summary' ? json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur' } }, 500) : undefined));
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les compteurs.');
    expect(screen.queryByRole('link', { name: /Demandes disponibles/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/admin/requests/summary').length).toBeGreaterThanOrEqual(2));
  });
});

describe('File commune', () => {
  it('liste les demandes libres avec les informations utiles et un bouton « Prendre en charge »', async () => {
    renderWorkspace('/espace/file', (url) =>
      url.startsWith('/api/admin/requests/available') ? page([summary('1', { priority: 'URGENT', title: 'Fuite d’eau' }), summary('2')]) : undefined,
    );
    const first = await screen.findByRole('article', { name: 'Fuite d’eau' });
    expect(within(first).getByText('Description 1')).toBeVisible();
    expect(within(first).getByText('Urgente')).toBeVisible();
    expect(within(first).getByText('En attente de validation administrative')).toBeVisible();
    expect(within(first).getByText('Mme Martin')).toBeVisible();
    expect(within(first).getByText('Intervention technique')).toBeVisible();
    expect(within(first).getByText('10 nov. 2026', { exact: false })).toBeVisible();
    expect(within(first).getByRole('link', { name: 'Ouvrir : Fuite d’eau' })).toHaveAttribute('href', '/demandes/1');
    expect(within(first).getByRole('button', { name: 'Prendre en charge : Fuite d’eau' })).toBeEnabled();
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('état vide et état d’erreur avec « Réessayer »', async () => {
    renderWorkspace('/espace/file', (url) => (url.startsWith('/api/admin/requests/available') ? page([]) : undefined));
    expect(await screen.findByText('Aucune demande disponible')).toBeVisible();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    renderWorkspace('/espace/file', (url) =>
      url.startsWith('/api/admin/requests/available') ? json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur' } }, 500) : undefined,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger la file commune.');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  });

  it('prise en charge : confirmation, envoi de la seule version, puis la demande s’ouvre', async () => {
    renderWorkspace('/espace/file', (url, init) => {
      if (url === '/api/admin/requests/1/claim' && init?.method === 'POST') return json(summary('1', { adminOwner: { id: 'a1', displayName: 'Mme Admin', jobTitle: null } }));
      if (url.startsWith('/api/admin/requests/available')) return page([summary('1', { version: 7 })]);
      return undefined;
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Prendre en charge : Demande 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Prendre en charge cette demande ?' });
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    expect(within(dialog).getByText(/Elle sera à votre charge/)).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Prendre en charge' }));
    expect(await screen.findByRole('heading', { name: 'Détail de la demande' })).toBeVisible();
    expect(calls.find((c) => c.method === 'POST')).toEqual({ url: '/api/admin/requests/1/claim', method: 'POST', body: { version: 7 } });
  });

  it('annuler la confirmation n’envoie rien', async () => {
    renderWorkspace('/espace/file', (url) => (url.startsWith('/api/admin/requests/available') ? page([summary('1', { version: 7 })]) : undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'Prendre en charge : Demande 1' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('demande prise entre-temps par un collègue : message du serveur affiché, file rechargée', async () => {
    let taken = false;
    renderWorkspace('/espace/file', (url, init) => {
      if (url === '/api/admin/requests/1/claim' && init?.method === 'POST') {
        taken = true;
        return json({ error: { code: 'REQUEST_ALREADY_CLAIMED', message: 'Un collègue vient de prendre cette demande en charge.' } }, 409);
      }
      if (url.startsWith('/api/admin/requests/available')) return page(taken ? [] : [summary('1', { version: 7 })]);
      return undefined;
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Prendre en charge : Demande 1' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Prendre en charge' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Un collègue vient de prendre cette demande en charge.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fermer' }));
    expect(await screen.findByText('Aucune demande disponible')).toBeVisible();
  });
});

describe('Mes demandes, en cours, terminées', () => {
  const owner = { id: 'a1', displayName: 'Mme Admin', jobTitle: null };

  it.each([
    ['/espace/mes-demandes', 'all', 'Mes demandes'],
    ['/espace/en-cours', 'active', 'Demandes en cours'],
    ['/espace/terminees', 'finished', 'Demandes terminées'],
  ])('%s interroge le périmètre « %s » sans transmettre d’identifiant d’administrateur', async (path, scope, title) => {
    renderWorkspace(path, (url) =>
      url.startsWith('/api/admin/requests/mine') ? page([summary('4', { status: scope === 'finished' ? 'CLOSED' : 'SENT', adminOwner: owner })]) : undefined,
    );
    expect(await screen.findByRole('heading', { level: 2, name: title })).toBeVisible();
    const row = await screen.findByRole('article', { name: 'Demande 4' });
    expect(within(row).getByRole('link', { name: 'Ouvrir : Demande 4' })).toHaveAttribute('href', '/demandes/4');
    expect(within(row).queryByRole('button', { name: /Prendre en charge/ })).toBeNull();
    const call = calls.find((c) => c.url.startsWith('/api/admin/requests/mine'))!;
    expect(call.url).toContain(`scope=${scope}`);
    expect(call.url).not.toMatch(/a1|adminId|ownerId/);
  });

  it('état vide', async () => {
    renderWorkspace('/espace/en-cours', (url) => (url.startsWith('/api/admin/requests/mine') ? page([]) : undefined));
    expect(await screen.findByText('Aucune demande en cours')).toBeVisible();
  });
});

describe('Mon historique', () => {
  const ref = (id: string, displayName: string) => ({ id, displayName, jobTitle: null });
  const rows = [
    { id: 'h2', operation: 'TRANSFERRED', request: { id: '9', reference: 'D-9', title: 'Serrure' }, admin: ref('a2', 'M. Autre'), previousAdmin: ref('a1', 'Mme Admin'), actor: ref('a2', 'M. Autre'), reason: 'Je connais le fournisseur.', createdAt: '2026-11-12T09:30:00.000Z' },
    { id: 'h1', operation: 'CLAIMED', request: { id: '9', reference: 'D-9', title: 'Serrure' }, admin: ref('a1', 'Mme Admin'), previousAdmin: null, actor: ref('a1', 'Mme Admin'), reason: null, createdAt: '2026-11-11T08:00:00.000Z' },
  ];

  it('liste les opérations avec leur type, la demande, l’auteur, la date et le motif', async () => {
    renderWorkspace('/espace/historique', (url) => (url.startsWith('/api/admin/assignments/mine') ? page(rows) : undefined));
    // Les rubriques de l'espace sont aussi des éléments de liste : on attend les lignes d'historique.
    await screen.findAllByRole('link', { name: 'Serrure' });
    const history = screen.getAllByRole('listitem').filter((item) => within(item).queryByRole('link', { name: 'Serrure' }));
    expect(history).toHaveLength(2);
    expect(within(history[0]).getByText('Transférée')).toBeVisible();
    expect(within(history[0]).getByText(/M\. Autre/)).toBeVisible();
    expect(within(history[0]).getByText(/Je connais le fournisseur\./)).toBeVisible();
    expect(within(history[0]).getByText('12 nov. 2026', { exact: false })).toBeVisible();
    expect(within(history[1]).getByText('Prise en charge')).toBeVisible();
    expect(within(history[1]).getByRole('link', { name: /Serrure/ })).toHaveAttribute('href', '/demandes/9');
  });

  it('état vide', async () => {
    renderWorkspace('/espace/historique', (url) => (url.startsWith('/api/admin/assignments/mine') ? page([]) : undefined));
    expect(await screen.findByText('Aucune opération pour le moment')).toBeVisible();
  });
});
