import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateRequestPage } from '../../src/features/requests/CreateRequestPage';
import { installFakeMedia } from '../mocks/media-recorder';

/** T035 — formulaire de création : ordre des champs, erreurs, boîte d'envoi. */

const store = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async (key: string) => store.get(key),
  set: async (key: string, value: unknown) => void store.set(key, value),
  del: async (key: string) => void store.delete(key),
  values: async () => [...store.values()],
}));

const CATEGORIES = [
  { id: 'cat-a', name: 'Photocopies', circuit: 'A_DIRECT', photoRequired: false },
  { id: 'cat-b', name: 'Intervention technique', circuit: 'B_ADMIN_VALIDATION', photoRequired: true },
];
const RECIPIENTS = [{ id: 'repro', displayName: 'Reprographie', jobTitle: 'Reprographie' }];

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Calls = Array<{ url: string; method: string; body: unknown }>;

function setup(onCreate: (body: unknown) => Response | Promise<Response>): Calls {
  const calls: Calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      calls.push({ url, method, body });
      if (url === '/api/categories') return json(200, CATEGORIES);
      if (url === '/api/categories/cat-a/recipients') return json(200, RECIPIENTS);
      if (url === '/api/categories/cat-b/recipients') return json(200, []);
      if (url === '/api/requests' && method === 'POST') return onCreate(body);
      return json(404, { error: { code: 'NOT_FOUND', message: 'Introuvable' } });
    }),
  );
  const router = createMemoryRouter(
    [
      { path: '/demandes/nouvelle', element: <CreateRequestPage /> },
      { path: '/demandes/:id', element: <p>Détail de la demande</p> },
    ],
    { initialEntries: ['/demandes/nouvelle'] },
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return calls;
}

async function choose(label: string, option: string): Promise<void> {
  await userEvent.click(screen.getByRole('combobox', { name: label }));
  await userEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: option }));
}

describe('CreateRequestPage', () => {
  beforeEach(() => {
    store.clear();
    installFakeMedia();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fait choisir la catégorie avant le destinataire, parmi les destinataires de la catégorie', async () => {
    setup(() => json(201, { id: 'r1' }));
    expect(await screen.findByRole('heading', { name: 'Nouvelle demande' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Destinataire' })).toHaveAttribute('aria-disabled', 'true');

    await choose('Catégorie', 'Photocopies');
    await userEvent.click(screen.getByRole('combobox', { name: 'Destinataire' }));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Reprographie — Reprographie']);
  });

  it('en circuit B, n’affiche pas de destinataire et l’explique', async () => {
    setup(() => json(201, { id: 'r1' }));
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await choose('Catégorie', 'Intervention technique');
    expect(screen.queryByRole('combobox', { name: 'Destinataire' })).not.toBeInTheDocument();
    expect(screen.getByText(/validée par un responsable/)).toBeVisible();
  });

  it('signale chaque champ manquant sans envoyer', async () => {
    const calls = setup(() => json(201, { id: 'r1' }));
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    expect(await screen.findByText('Choisissez une catégorie.')).toBeVisible();
    expect(screen.getByText('Choisissez une priorité.')).toBeVisible();
    expect(screen.getByText('Saisissez un titre.')).toBeVisible();
    expect(screen.getByText('Enregistrez un message vocal ou écrivez une description.')).toBeVisible();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    await choose('Catégorie', 'Photocopies');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    expect(await screen.findByText('Choisissez un destinataire.')).toBeVisible();
  });

  it('envoie la demande avec un clientId puis ouvre son détail', async () => {
    const calls = setup(() => json(201, { id: 'r1' }));
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await choose('Catégorie', 'Photocopies');
    await choose('Destinataire', 'Reprographie — Reprographie');
    await userEvent.click(screen.getByRole('radio', { name: 'Urgente' }));
    await userEvent.type(screen.getByLabelText('Titre'), 'Photocopies du contrôle');
    await userEvent.type(screen.getByLabelText('Description (facultative)'), '30 exemplaires recto-verso');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    expect(await screen.findByText('Détail de la demande')).toBeVisible();
    const post = calls.find((c) => c.url === '/api/requests' && c.method === 'POST');
    expect(post?.body).toEqual({
      clientId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      title: 'Photocopies du contrôle',
      description: '30 exemplaires recto-verso',
      categoryId: 'cat-a',
      recipientId: 'repro',
      priority: 'URGENT',
    });
  });

  it('affiche les erreurs de l’API au bon endroit', async () => {
    setup(() =>
      json(422, { error: { code: 'RECIPIENT_NOT_ALLOWED', message: 'Ce destinataire ne peut pas recevoir les demandes de cette catégorie.' } }),
    );
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await choose('Catégorie', 'Photocopies');
    await choose('Destinataire', 'Reprographie — Reprographie');
    await userEvent.click(screen.getByRole('radio', { name: 'Normale' }));
    await userEvent.type(screen.getByLabelText('Titre'), 'X');
    await userEvent.type(screen.getByLabelText('Description (facultative)'), 'Y');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce destinataire ne peut pas recevoir');
  });

  it('en cas de coupure réseau, conserve la demande dans la boîte d’envoi', async () => {
    setup(() => Promise.reject(new TypeError('Failed to fetch')));
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await choose('Catégorie', 'Photocopies');
    await choose('Destinataire', 'Reprographie — Reprographie');
    await userEvent.click(screen.getByRole('radio', { name: 'Normale' }));
    await userEvent.type(screen.getByLabelText('Titre'), 'Affiches');
    await userEvent.type(screen.getByLabelText('Description (facultative)'), 'A3');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/n’a pas pu être envoyée/);
    expect(alert).toHaveTextContent(/boîte d’envoi/);
    await waitFor(() => expect(store.size).toBe(1));
    const [entry] = [...store.values()] as Array<{ payload: { title: string; clientId: string } }>;
    expect(entry.payload).toMatchObject({ title: 'Affiches', clientId: expect.any(String) });
  });
});
