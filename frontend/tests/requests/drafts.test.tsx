import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CLIENT_SETTINGS } from '../../src/api/settings';
import { ToastProvider } from '../../src/components/Toast';
import { CreateRequestPage } from '../../src/features/requests/CreateRequestPage';
import { DraftPage } from '../../src/features/requests/DraftPage';
import { RequestDetailPage } from '../../src/features/requests/RequestDetailPage';
import { RequestListPage } from '../../src/features/requests/RequestListPage';
import { installFakeMedia } from '../mocks/media-recorder';

/** Spec 007 — brouillons de demande : enregistrer (US1), liste et page brouillon (US2), suppression (US3). */

vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  values: async () => [],
}));

const CATEGORIES = [
  { id: 'cat-a', name: 'Photocopies', circuit: 'A_DIRECT', routingMode: 'DIRECT', photoRequired: false },
  { id: 'cat-b', name: 'Intervention technique', circuit: 'B_ADMIN_VALIDATION', routingMode: 'VIA_ADMIN', photoRequired: true },
];
const RECIPIENTS = [
  { id: 'repro', displayName: 'Reprographie', jobTitle: 'Reprographie' },
  { id: 'repro2', displayName: 'Reprographie 2', jobTitle: 'Reprographie' },
];

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Call = { url: string; method: string; body: unknown };
type Handler = (call: Call) => Response | Promise<Response> | undefined;

/** Routes de l'application utiles aux brouillons ; `handler` répond avant les réponses par défaut. */
function setup(path: string, routes: RouteObject[], handler: Handler = () => undefined, draftsEnabled = true): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call: Call = {
        url,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
      };
      calls.push(call);
      const custom = await handler(call);
      if (custom) return custom;
      if (url === '/api/settings/client') return json(200, { ...DEFAULT_CLIENT_SETTINGS, draftsEnabled });
      if (url === '/api/categories') return json(200, CATEGORIES);
      if (url === '/api/categories/cat-a/recipients') return json(200, RECIPIENTS);
      if (url === '/api/categories/cat-b/recipients') return json(200, []);
      if (url === '/api/files' && call.method === 'POST') return json(201, { id: 'file-1' });
      return json(404, { error: { code: 'NOT_FOUND', message: 'Introuvable' } });
    }),
  );
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return calls;
}

const CREATE_ROUTES: RouteObject[] = [
  { path: '/demandes/nouvelle', element: <CreateRequestPage /> },
  { path: '/demandes/:id/brouillon', element: <p>Page brouillon</p> },
];

const posts = (calls: Call[], url: string) => calls.filter((c) => c.method === 'POST' && c.url === url);

async function choose(label: string, option: string): Promise<void> {
  await userEvent.click(await screen.findByRole('combobox', { name: label }));
  await userEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: option }));
}

describe('« Enregistrer en brouillon » (US1)', () => {
  beforeEach(() => installFakeMedia());
  afterEach(() => vi.unstubAllGlobals());

  it('proposé quand le réglage l’autorise', async () => {
    setup('/demandes/nouvelle', CREATE_ROUTES);
    expect(await screen.findByRole('button', { name: 'Enregistrer en brouillon' })).toBeVisible();
  });

  it('absent quand le réglage est désactivé', async () => {
    setup('/demandes/nouvelle', CREATE_ROUTES, () => undefined, false);
    await screen.findByRole('heading', { name: 'Nouvelle demande' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Enregistrer en brouillon' })).not.toBeInTheDocument());
  });

  it('validation réduite : catégorie et titre seulement', async () => {
    const calls = setup('/demandes/nouvelle', CREATE_ROUTES);
    await userEvent.click(await screen.findByRole('button', { name: 'Enregistrer en brouillon' }));
    expect(await screen.findByText('Choisissez une catégorie.')).toBeVisible();
    expect(screen.getByText('Saisissez un titre.')).toBeVisible();
    expect(screen.queryByText('Choisissez une priorité.')).not.toBeInTheDocument();
    expect(screen.queryByText('Enregistrez un message vocal ou écrivez une description.')).not.toBeInTheDocument();
    expect(posts(calls, '/api/requests')).toHaveLength(0);
  });

  it('enregistre avec asDraft, priorité « Normale » par défaut, puis ouvre le brouillon', async () => {
    const calls = setup('/demandes/nouvelle', CREATE_ROUTES, (call) =>
      call.url === '/api/requests' && call.method === 'POST' ? json(201, { id: 'd1', status: 'DRAFT' }) : undefined,
    );
    await choose('Catégorie', 'Photocopies');
    await userEvent.type(screen.getByLabelText('Titre'), 'Photocopies du contrôle');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer en brouillon' }));
    await waitFor(() => expect(posts(calls, '/api/requests')).toHaveLength(1));
    expect(posts(calls, '/api/requests')[0].body).toMatchObject({
      title: 'Photocopies du contrôle',
      categoryId: 'cat-a',
      priority: 'NORMAL',
      asDraft: true,
    });
    expect(posts(calls, '/api/requests')[0].body).not.toHaveProperty('description');
    expect(await screen.findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(await screen.findByText('Page brouillon')).toBeVisible();
  });

  it('téléverse d’abord le message vocal enregistré', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const calls = setup('/demandes/nouvelle', CREATE_ROUTES, (call) =>
        call.url === '/api/requests' && call.method === 'POST' ? json(201, { id: 'd1', status: 'DRAFT' }) : undefined,
      );
      await user.click(await screen.findByRole('combobox', { name: 'Catégorie' }));
      await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Photocopies' }));
      await user.type(screen.getByLabelText('Titre'), 'Avec vocal');
      await user.click(screen.getByRole('button', { name: 'Enregistrer un message vocal' }));
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      await user.click(await screen.findByRole('button', { name: 'Arrêter l’enregistrement' }));
      await user.click(screen.getByRole('button', { name: 'Enregistrer en brouillon' }));
      await waitFor(() => expect(posts(calls, '/api/requests')).toHaveLength(1));
      const files = calls.findIndex((c) => c.method === 'POST' && c.url === '/api/files');
      const create = calls.findIndex((c) => c.method === 'POST' && c.url === '/api/requests');
      expect(files).toBeGreaterThanOrEqual(0);
      expect(files).toBeLessThan(create);
      expect(posts(calls, '/api/requests')[0].body).toMatchObject({ voiceFileId: 'file-1', asDraft: true });
    } finally {
      vi.useRealTimers();
    }
  });
});

const ME = { id: 'u1', displayName: 'Enseignante', role: 'EMPLOYEE', permissions: [], mustChangePassword: false };

function summary(over: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    reference: 'D-0001',
    title: 'Photocopies du contrôle',
    category: { id: 'cat-a', name: 'Photocopies' },
    priority: 'HIGH',
    status: 'DRAFT',
    requester: { id: 'u1', displayName: 'Enseignante' },
    assignee: { id: 'repro2', displayName: 'Reprographie 2' },
    createdAt: '2026-10-20T08:00:00.000Z',
    currentStage: null,
    currentDueAt: null,
    warnAt: null,
    overdueStage: null,
    hasVoice: true,
    unreadCount: 0,
    ...over,
  };
}

function draft(over: Record<string, unknown> = {}) {
  return {
    ...summary(),
    description: 'Deux copies',
    voice: { fileId: 'v1', durationSeconds: 4 },
    rulesSnapshot: { circuit: 'A_DIRECT', photoRequired: false, closureMode: 'REQUESTER', finalValidation: false },
    timestamps: {},
    proofPhotos: [],
    autoCloseAt: null,
    version: 3,
    rejectionReason: null,
    allowedActions: [],
    canWriteInThread: false,
    ...over,
  };
}

const page = (items: unknown[]) => json(200, { items, nextCursor: null });

describe('onglet « Brouillons » (US2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const LIST_ROUTES: RouteObject[] = [
    { path: '/', element: <RequestListPage /> },
    { path: '/demandes/:id/brouillon', element: <p>Page brouillon</p> },
  ];

  function listSetup(drafts: unknown[], initial = '/'): Call[] {
    return setup(initial, LIST_ROUTES, (call) => {
      if (call.url === '/api/auth/me') return json(200, ME);
      if (call.url.startsWith('/api/requests?scope=drafts')) return page(drafts);
      if (call.url.startsWith('/api/requests?')) return page([]);
      return undefined;
    });
  }

  it('absent quand l’utilisateur n’a aucun brouillon', async () => {
    const calls = listSetup([]);
    expect(await screen.findByRole('tab', { name: 'Envoyées' })).toBeVisible();
    await waitFor(() => expect(calls.some((c) => c.url === '/api/requests?scope=drafts&limit=1')).toBe(true));
    await waitFor(() => expect(screen.queryByRole('tab', { name: 'Brouillons' })).not.toBeInTheDocument());
  });

  it('présent après « Envoyées » quand il existe au moins un brouillon', async () => {
    listSetup([summary()]);
    const tab = await screen.findByRole('tab', { name: 'Brouillons' });
    const names = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(names.indexOf('Brouillons')).toBe(names.indexOf('Envoyées') + 1);
    expect(tab).toBeVisible();
  });

  it('liste les brouillons (scope=drafts) et mène à la page brouillon', async () => {
    const calls = listSetup([summary()], '/?onglet=brouillons');
    const link = await screen.findByRole('link', { name: /Photocopies du contrôle/ });
    expect(within(link).getByText('Brouillon')).toBeVisible();
    expect(calls.some((c) => c.url === '/api/requests?scope=drafts')).toBe(true);
    expect(link).toHaveAttribute('href', '/demandes/d1/brouillon');
  });
});

const DRAFT_ROUTES: RouteObject[] = [
  { path: '/', element: <p>Liste des demandes</p> },
  { path: '/demandes/:id/brouillon', element: <DraftPage /> },
  { path: '/demandes/:id', element: <p>Détail de la demande</p> },
];

/** Page brouillon : `onCall` répond aux appels propres au test (PATCH, actions, DELETE). */
function draftSetup(detail: unknown, onCall: Handler = () => undefined): Call[] {
  return setup('/demandes/d1/brouillon', DRAFT_ROUTES, (call) => {
    const custom = onCall(call);
    if (custom) return custom;
    if (call.url === '/api/requests/d1' && call.method === 'GET') return json(200, detail);
    return undefined;
  });
}

const calledWith = (calls: Call[], method: string, url: string) => calls.filter((c) => c.method === method && c.url === url);

describe('page brouillon (US2)', () => {
  beforeEach(() => installFakeMedia());
  afterEach(() => vi.unstubAllGlobals());

  it('pré-remplit le formulaire avec le brouillon', async () => {
    draftSetup(draft());
    expect(await screen.findByRole('heading', { name: 'Brouillon de demande' })).toBeVisible();
    expect(await screen.findByRole('combobox', { name: 'Catégorie' })).toHaveTextContent('Photocopies');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Destinataire (service)' })).toHaveTextContent('Reprographie 2'));
    expect(screen.getByRole('radio', { name: 'Haute' })).toBeChecked();
    expect(screen.getByLabelText('Titre')).toHaveValue('Photocopies du contrôle');
    expect(screen.getByLabelText('Description (facultative)')).toHaveValue('Deux copies');
  });

  it('propose de remplacer ou supprimer le message vocal existant ; le supprimer envoie voiceFileId: null', async () => {
    const calls = draftSetup(draft(), (call) =>
      call.method === 'PATCH' ? json(200, draft({ voice: null, hasVoice: false, version: 4 })) : undefined,
    );
    expect(await screen.findByRole('button', { name: 'Remplacer le message vocal' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer le message vocal' }));
    expect(await screen.findByRole('button', { name: 'Enregistrer un message vocal' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    await waitFor(() => expect(calledWith(calls, 'PATCH', '/api/requests/d1')).toHaveLength(1));
    expect(calledWith(calls, 'PATCH', '/api/requests/d1')[0].body).toEqual({ voiceFileId: null });
  });

  it('« Enregistrer le brouillon » n’envoie que les champs changés', async () => {
    const calls = draftSetup(draft(), (call) => (call.method === 'PATCH' ? json(200, draft({ title: 'Nouveau titre', version: 4 })) : undefined));
    const title = await screen.findByLabelText('Titre');
    await userEvent.clear(title);
    await userEvent.type(title, 'Nouveau titre');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    await waitFor(() => expect(calledWith(calls, 'PATCH', '/api/requests/d1')).toHaveLength(1));
    expect(calledWith(calls, 'PATCH', '/api/requests/d1')[0].body).toEqual({ title: 'Nouveau titre' });
    expect(await screen.findByText('Brouillon enregistré.')).toBeInTheDocument();
    expect(calledWith(calls, 'POST', '/api/requests/d1/actions')).toHaveLength(0);
  });

  it('« Envoyer la demande » sans changement : SUBMIT avec la version, puis le détail', async () => {
    const calls = draftSetup(draft(), (call) =>
      call.url === '/api/requests/d1/actions' ? json(200, draft({ status: 'SENT', version: 4 })) : undefined,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Envoyer la demande' }));
    await waitFor(() => expect(calledWith(calls, 'POST', '/api/requests/d1/actions')).toHaveLength(1));
    expect(calledWith(calls, 'PATCH', '/api/requests/d1')).toHaveLength(0);
    expect(calledWith(calls, 'POST', '/api/requests/d1/actions')[0].body).toEqual({ action: 'SUBMIT', version: 3 });
    expect(await screen.findByText('Votre demande a été envoyée.')).toBeInTheDocument();
    expect(await screen.findByText('Détail de la demande')).toBeVisible();
  });

  it('« Envoyer la demande » après modification : enregistre puis envoie avec la version renvoyée', async () => {
    const calls = draftSetup(draft(), (call) => {
      if (call.method === 'PATCH') return json(200, draft({ description: 'Trois copies', version: 7 }));
      if (call.url === '/api/requests/d1/actions') return json(200, draft({ status: 'SENT', version: 8 }));
      return undefined;
    });
    const description = await screen.findByLabelText('Description (facultative)');
    await userEvent.clear(description);
    await userEvent.type(description, 'Trois copies');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    await waitFor(() => expect(calledWith(calls, 'POST', '/api/requests/d1/actions')).toHaveLength(1));
    expect(calledWith(calls, 'PATCH', '/api/requests/d1')[0].body).toEqual({ description: 'Trois copies' });
    expect(calledWith(calls, 'POST', '/api/requests/d1/actions')[0].body).toEqual({ action: 'SUBMIT', version: 7 });
    const writes = calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.url}`);
    expect(writes).toEqual(['PATCH /api/requests/d1', 'POST /api/requests/d1/actions']);
  });

  it('envoi incomplet (ni description ni vocal) : message, rien n’est envoyé', async () => {
    const calls = draftSetup(draft({ description: null, voice: null, hasVoice: false }));
    await userEvent.click(await screen.findByRole('button', { name: 'Envoyer la demande' }));
    expect(await screen.findByText('Enregistrez un message vocal ou écrivez une description.')).toBeVisible();
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  it('brouillon déjà envoyé ailleurs (409) : message, puis retour à la liste', async () => {
    draftSetup(draft(), (call) =>
      call.url === '/api/requests/d1/actions'
        ? json(409, { error: { code: 'STATE_CHANGED', message: 'Cette demande a changé entre-temps.' } })
        : undefined,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Envoyer la demande' }));
    expect(await screen.findByText('Cette demande a changé entre-temps.')).toBeInTheDocument();
    expect(await screen.findByText('Liste des demandes')).toBeVisible();
  });

  it('brouillon introuvable : message et retour aux demandes', async () => {
    setup('/demandes/d1/brouillon', DRAFT_ROUTES);
    expect(await screen.findByText('Ce brouillon est introuvable ou a déjà été envoyé ou supprimé.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Retour aux demandes' }));
    expect(await screen.findByText('Liste des demandes')).toBeVisible();
  });

  it('une demande qui n’est plus un brouillon s’ouvre sur son détail', async () => {
    draftSetup(draft({ status: 'SENT' }));
    expect(await screen.findByText('Détail de la demande')).toBeVisible();
  });

  it('le détail d’un brouillon redirige vers la page brouillon', async () => {
    setup(
      '/demandes/d1',
      [
        { path: '/demandes/:id', element: <RequestDetailPage /> },
        { path: '/demandes/:id/brouillon', element: <p>Page brouillon</p> },
      ],
      (call) => (call.url === '/api/requests/d1' ? json(200, draft()) : undefined),
    );
    expect(await screen.findByText('Page brouillon')).toBeVisible();
  });
});

describe('supprimer un brouillon (US3)', () => {
  beforeEach(() => installFakeMedia());
  afterEach(() => vi.unstubAllGlobals());

  it('demande confirmation ; « Annuler » ne supprime rien', async () => {
    const calls = draftSetup(draft());
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer le brouillon' }));
    const dialog = await screen.findByRole('dialog', { name: 'Supprimer ce brouillon ?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calledWith(calls, 'DELETE', '/api/requests/d1')).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'Brouillon de demande' })).toBeVisible();
  });

  it('« Supprimer » : DELETE, message et retour à « Mes demandes »', async () => {
    const calls = draftSetup(draft(), (call) => (call.method === 'DELETE' ? new Response(null, { status: 204 }) : undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer le brouillon' }));
    const dialog = await screen.findByRole('dialog', { name: 'Supprimer ce brouillon ?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(calledWith(calls, 'DELETE', '/api/requests/d1')).toHaveLength(1));
    expect(await screen.findByText('Brouillon supprimé.')).toBeInTheDocument();
    expect(await screen.findByText('Liste des demandes')).toBeVisible();
  });
});
