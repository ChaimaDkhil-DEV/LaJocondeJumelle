import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateRequestPage } from '../../src/features/requests/CreateRequestPage';
import { RequestListPage } from '../../src/features/requests/RequestListPage';
import { installFakeMedia } from '../mocks/media-recorder';

/** Mode de routage dans l'interface : destinataire selon le mode, collègue absent signalé, onglet « Suivi ». */

vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  values: async () => [],
}));

const CATEGORIES = [
  { id: 'direct', name: 'Photocopies', circuit: 'A_DIRECT', routingMode: 'DIRECT', photoRequired: false },
  { id: 'peer', name: 'Enseignants', circuit: 'A_DIRECT', routingMode: 'PEER', photoRequired: false },
  { id: 'via', name: 'Surveillance', circuit: 'B_ADMIN_VALIDATION', routingMode: 'VIA_ADMIN', photoRequired: false },
];

const RECIPIENTS: Record<string, unknown[]> = {
  direct: [{ id: 'repro', displayName: 'Reprographie', jobTitle: 'Reprographie', availability: 'AVAILABLE' }],
  peer: [
    { id: 'collegue', displayName: 'Mme Martin', jobTitle: null, availability: 'AVAILABLE' },
    { id: 'absente', displayName: 'M. Durand', jobTitle: null, availability: 'ABSENT' },
  ],
};

type Call = { url: string; method: string; body: unknown };

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function stub(me = { id: 'ens', displayName: 'Enseignante', role: 'EMPLOYEE', permissions: [], mustChangePassword: false }): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
      if (url === '/api/auth/me') return json(200, me);
      if (url === '/api/categories') return json(200, CATEGORIES);
      const recipients = /^\/api\/categories\/(\w+)\/recipients$/.exec(url);
      if (recipients) return json(200, RECIPIENTS[recipients[1]] ?? []);
      if (url === '/api/requests' && method === 'POST') return json(201, { id: 'r1' });
      if (url.startsWith('/api/requests?')) return json(200, { items: [], nextCursor: null });
      return json(404, { error: { code: 'NOT_FOUND', message: 'Introuvable' } });
    }),
  );
  return calls;
}

function renderAt(path: string): void {
  const router = createMemoryRouter(
    [
      { path: '/', element: <RequestListPage /> },
      { path: '/demandes/nouvelle', element: <CreateRequestPage /> },
      { path: '/demandes/:id', element: <p>Détail de la demande</p> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function choose(label: string, option: string): Promise<void> {
  await userEvent.click(screen.getByRole('combobox', { name: label }));
  await userEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: option }));
}

async function fillAndSend(): Promise<void> {
  await userEvent.click(screen.getByRole('radio', { name: 'Normale' }));
  await userEvent.type(screen.getByLabelText('Titre'), 'Demande');
  await userEvent.type(screen.getByLabelText('Description (facultative)'), 'Détails');
  await userEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
}

describe('Formulaire de demande selon le mode de routage', () => {
  beforeEach(() => installFakeMedia());
  afterEach(() => vi.unstubAllGlobals());

  it('direct : le service seul est choisi d’office et envoyé', async () => {
    const calls = stub();
    renderAt('/demandes/nouvelle');
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await choose('Catégorie', 'Photocopies');
    expect(await screen.findByRole('combobox', { name: 'Destinataire (service)' })).toHaveTextContent('Reprographie — Reprographie');
    await fillAndSend();
    await screen.findByText('Détail de la demande');
    const post = calls.find((c) => c.url === '/api/requests' && c.method === 'POST');
    expect(post?.body).toMatchObject({ categoryId: 'direct', recipientId: 'repro' });
  });

  it('entre enseignants : collègue à choisir, absence signalée sans bloquer l’envoi', async () => {
    const calls = stub();
    renderAt('/demandes/nouvelle');
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await choose('Catégorie', 'Enseignants');
    const picker = await screen.findByRole('combobox', { name: 'Enseignant destinataire' });
    expect(picker).not.toHaveTextContent(/Martin|Durand/);
    expect(screen.queryByText(/signalé absent/)).not.toBeInTheDocument();

    await choose('Enseignant destinataire', 'M. Durand (absent)');
    expect(screen.getByText(/signalé absent/)).toBeVisible();
    await fillAndSend();
    await screen.findByText('Détail de la demande');
    expect(calls.find((c) => c.url === '/api/requests' && c.method === 'POST')?.body).toMatchObject({ categoryId: 'peer', recipientId: 'absente' });
  });

  it('via l’administration : pas de destinataire à choisir', async () => {
    stub();
    renderAt('/demandes/nouvelle');
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await choose('Catégorie', 'Surveillance');
    expect(screen.queryByRole('combobox', { name: /Destinataire/ })).not.toBeInTheDocument();
    expect(screen.getByText(/validée par un admin/)).toBeVisible();
  });
});

describe('Onglet « Suivi » de l’administration', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('proposé aux admins : charge toutes les demandes visibles (scope all)', async () => {
    const calls = stub({ id: 'm1', displayName: 'Responsable', role: 'ADMIN', permissions: [], mustChangePassword: false });
    renderAt('/');
    await userEvent.click(await screen.findByRole('tab', { name: 'Suivi' }));
    await waitFor(() => expect(calls.some((c) => c.url.startsWith('/api/requests?scope=all'))).toBe(true));
    expect(await screen.findByText('Aucune demande à suivre.')).toBeVisible();
  });

  it('absent pour un employé', async () => {
    stub();
    renderAt('/');
    expect(await screen.findByRole('tab', { name: 'Reçues' })).toBeVisible();
    expect(screen.queryByRole('tab', { name: 'Suivi' })).not.toBeInTheDocument();
  });
});
