import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateRequestPage } from '../../src/features/requests/CreateRequestPage';
import { installFakeMedia } from '../mocks/media-recorder';

/**
 * Catégorie de garde dans « Nouvelle demande » : listée avec un repère « Garde », sans destinataire ;
 * l'envoi devient « Continuer dans Gardes » et ouvre « Nouvelle affectation » sans aucun appel API.
 */

const store = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async (key: string) => store.get(key),
  set: async (key: string, value: unknown) => void store.set(key, value),
  del: async (key: string) => void store.delete(key),
  values: async () => [...store.values()],
}));

const CATEGORIES = [
  { id: 'cat-a', name: 'Photocopies', circuit: 'A_DIRECT', routingMode: 'DIRECT', photoRequired: false, kind: 'WORK' },
  { id: 'cat-g', name: 'Garde de classe', circuit: 'A_DIRECT', routingMode: 'DIRECT', photoRequired: false, kind: 'COVERAGE' },
];
const RECIPIENTS = [{ id: 'repro', displayName: 'Reprographie', jobTitle: null, availability: 'AVAILABLE' }];
const SETTINGS = { voiceMaxSeconds: 180, attachmentMaxBytes: 1, attachmentMaxPerMessage: 5, draftsEnabled: true, assistSuggestions: true, assistTranscription: false };
const RESULT = {
  suggestion: { title: 'Photocopieuse en panne', categoryId: 'cat-a', priority: 'NORMAL', missing: [] },
  sources: [],
  noGuideline: true,
  token: 'jeton-1',
};

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Calls = Array<{ url: string; method: string }>;

function Location() {
  const location = useLocation();
  return <p>Nouvelle affectation : {location.pathname + location.search}</p>;
}

function setup(): Calls {
  const calls: Calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method });
      if (url === '/api/settings/client') return json(200, SETTINGS);
      if (url === '/api/categories') return json(200, CATEGORIES);
      if (url === '/api/categories/cat-a/recipients') return json(200, RECIPIENTS);
      if (url === '/api/assist/suggestions' && method === 'POST') return json(200, RESULT);
      return json(404, { error: { code: 'NOT_FOUND', message: 'Introuvable' } });
    }),
  );
  const router = createMemoryRouter(
    [
      { path: '/demandes/nouvelle', element: <CreateRequestPage /> },
      { path: '/gardes/nouvelle', element: <Location /> },
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

async function chooseCategory(name: RegExp): Promise<void> {
  await userEvent.click(screen.getByRole('combobox', { name: 'Catégorie' }));
  await userEvent.click(await screen.findByRole('option', { name }));
}

const suggestionCalls = (calls: Calls) => calls.filter((c) => c.url === '/api/assist/suggestions');

describe('Catégorie de garde dans « Nouvelle demande »', () => {
  beforeEach(() => {
    store.clear();
    installFakeMedia();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('les catégories de garde portent le repère « Garde » dans le menu, pas les catégories de travail', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await userEvent.click(screen.getByRole('combobox', { name: 'Catégorie' }));
    const listbox = await screen.findByRole('listbox');
    expect(within(within(listbox).getByRole('option', { name: /Garde de classe/ })).getByText('Garde')).toBeVisible();
    expect(within(within(listbox).getByRole('option', { name: /Photocopies/ })).queryByText('Garde')).not.toBeInTheDocument();
  });

  it('garde choisie : pas de destinataire (ni appel), « Continuer dans Gardes », pas de brouillon', async () => {
    const calls = setup();
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await chooseCategory(/Garde de classe/);

    expect(screen.queryByRole('combobox', { name: /Destinataire/ })).not.toBeInTheDocument();
    expect(screen.getByText(/se crée dans Gardes/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Continuer dans Gardes' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Envoyer la demande' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer en brouillon' })).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/recipients'))).toBe(false);
  });

  it('« Continuer dans Gardes » sans titre ni priorité : ouvre /gardes/nouvelle, sans appel ni boîte d’envoi', async () => {
    const calls = setup();
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await chooseCategory(/Garde de classe/);
    await userEvent.click(screen.getByRole('button', { name: 'Continuer dans Gardes' }));

    expect(await screen.findByText('Nouvelle affectation : /gardes/nouvelle')).toBeVisible();
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
    expect(store.size).toBe(0);
  });

  it('choisir une garde ne relance pas l’analyse automatique', async () => {
    const calls = setup();
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter une description (facultatif)' }));
    await userEvent.type(screen.getByLabelText('Description (facultative)'), 'M. Martin est absent ce matin.');
    await userEvent.click(screen.getByRole('button', { name: 'Proposer une catégorie et une priorité' }));
    await screen.findByRole('button', { name: 'Relancer l’analyse' });
    expect(suggestionCalls(calls)).toHaveLength(1);

    await chooseCategory(/Garde de classe/);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(suggestionCalls(calls)).toHaveLength(1);
  });

  it('revenir à une catégorie de travail rétablit le destinataire et l’envoi', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await chooseCategory(/Garde de classe/);
    await chooseCategory(/Photocopies/);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Destinataire (service)' })).toBeVisible());
    expect(screen.getByRole('button', { name: 'Envoyer la demande' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Continuer dans Gardes' })).not.toBeInTheDocument();
  });
});
