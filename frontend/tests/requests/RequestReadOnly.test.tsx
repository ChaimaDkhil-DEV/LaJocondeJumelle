import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestDetailPage } from '../../src/features/requests/RequestDetailPage';
import { RequestListPage } from '../../src/features/requests/RequestListPage';
import { isReadOnlyStatus } from '../../src/features/requests/readOnly';
import type { RequestDetail } from '../../src/features/requests/types';
import { installFakeMedia } from '../mocks/media-recorder';

/** Demande terminée en lecture seule, référence masquée, délais affichés seulement si la demande est active. */

vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  values: async () => [],
}));

const REQUESTER = { id: 'u1', displayName: 'Enseignante', role: 'EMPLOYEE', permissions: ['PRIORITY_CHANGE_OWN'], mustChangePassword: false };
const IN_ONE_HOUR = new Date(Date.now() + 3_600_000).toISOString();

function detail(overrides: Partial<RequestDetail> = {}): RequestDetail {
  return {
    id: 'r1',
    reference: 'D-2026-000006',
    title: 'Photocopies du contrôle',
    category: { id: 'c1', name: 'Photocopies' },
    priority: 'NORMAL',
    status: 'SENT',
    requester: { id: 'u1', displayName: 'Enseignante' },
    assignee: { id: 'u2', displayName: 'Reprographie' },
    createdAt: '2026-10-12T10:00:00.000Z',
    currentStage: 'TAKEOVER',
    currentDueAt: IN_ONE_HOUR,
    warnAt: null,
    overdueStage: null,
    hasVoice: false,
    unreadCount: 0,
    description: 'Trente copies recto verso.',
    voice: null,
    rulesSnapshot: { circuit: 'A_DIRECT', photoRequired: false, closureMode: 'REQUESTER', finalValidation: false },
    timestamps: {
      createdAt: '2026-10-12T10:00:00.000Z',
      submittedAt: null,
      approvedAt: null,
      rejectedAt: null,
      assignedAt: null,
      acceptedAt: null,
      startedAt: null,
      doneAt: null,
      finalValidatedAt: null,
      closedAt: null,
      cancelledAt: null,
    },
    proofPhotos: [],
    autoCloseAt: null,
    version: 3,
    rejectionReason: null,
    allowedActions: ['CANCEL', 'CHANGE_PRIORITY'],
    canWriteInThread: true,
    ...overrides,
  };
}

/** Terminée, avec des données de délai périmées : rien ne doit s'en afficher. */
const DONE = detail({
  status: 'DONE',
  currentStage: 'TAKEOVER',
  currentDueAt: '2026-10-12T09:00:00.000Z',
  overdueStage: 'TAKEOVER',
  allowedActions: ['CLOSE', 'REQUEST_CORRECTION'],
  canWriteInThread: false,
});

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function stubFetch(request: RequestDetail): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/me') return json(200, REQUESTER);
      if (url === '/api/requests/r1') return json(200, request);
      if (url.startsWith('/api/requests/r1/messages')) return json(200, { items: [], nextCursor: null });
      if (url === '/api/requests/r1/history') return json(200, []);
      if (url.startsWith('/api/requests?')) return json(200, { items: [request], nextCursor: null });
      return json(404, { error: { code: 'NOT_FOUND', message: 'Introuvable' } });
    }),
  );
}

function renderAt(path: string, request: RequestDetail): void {
  stubFetch(request);
  installFakeMedia();
  const router = createMemoryRouter(
    [
      { path: '/', element: <RequestListPage /> },
      { path: '/demandes/:id', element: <RequestDetailPage /> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Statuts en lecture seule', () => {
  it('fige le travail terminé et les statuts finaux', () => {
    expect(['DONE', 'PENDING_FINAL_VALIDATION', 'CLOSED', 'REJECTED', 'CANCELLED'].every((s) => isReadOnlyStatus(s as never))).toBe(true);
    expect(['DRAFT', 'PENDING_ADMIN_VALIDATION', 'SENT', 'ACCEPTED', 'IN_PROGRESS', 'TO_CORRECT'].some((s) => isReadOnlyStatus(s as never))).toBe(false);
  });
});

describe('Détail d’une demande', () => {
  it('demande active : référence masquée, délai affiché, réponse possible', async () => {
    renderAt('/demandes/r1', detail());
    expect(await screen.findByRole('heading', { name: 'Photocopies du contrôle' })).toBeVisible();
    expect(screen.queryByText(/D-2026-000006/)).toBeNull();
    expect(screen.getByText(/Reste .* pour la prise en charge/)).toBeVisible();
    expect(screen.queryByText(/consultation uniquement/)).toBeNull();
    expect(await screen.findByLabelText('Votre message')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Annuler la demande' })).toBeEnabled();
  });

  it('demande terminée : bandeau, édition désactivée, consultation et actions du circuit conservées', async () => {
    renderAt('/demandes/r1', DONE);
    expect(await screen.findByText('Demande terminée, consultation uniquement.')).toBeVisible();
    expect(screen.queryByText(/D-2026-000006/)).toBeNull();
    // Aucun compte à rebours ni alerte de retard, même avec des données de délai périmées.
    expect(screen.queryByText(/Reste/)).toBeNull();
    expect(screen.queryByText(/En retard/)).toBeNull();

    expect(await screen.findByLabelText('Votre message')).toBeDisabled();
    for (const name of ['Envoyer le message', 'Enregistrer un message vocal', 'Changer la priorité', 'Annuler la demande']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    for (const label of ['Prendre une photo', 'Choisir dans la galerie', 'Joindre un PDF']) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }

    expect(screen.getByText('Trente copies recto verso.')).toBeVisible();
    expect(screen.getByText('Aucun message n’a été échangé sur cette demande.')).toBeVisible();
    expect(screen.queryByText('Posez une question ou apportez une précision.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Clôturer' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Renvoyer à corriger' })).toBeEnabled();
  });

  it('demande annulée : bandeau adapté', async () => {
    renderAt('/demandes/r1', detail({ status: 'CANCELLED', allowedActions: [], canWriteInThread: false, currentStage: null, currentDueAt: null }));
    expect(await screen.findByText('Demande annulée, consultation uniquement.')).toBeVisible();
  });
});

describe('Liste « Mes demandes »', () => {
  it('masque la référence et n’affiche le délai que pour une demande active', async () => {
    renderAt('/?onglet=envoyees', detail());
    const active = await screen.findByRole('link', { name: /Photocopies du contrôle/ });
    const row = active.closest('li') as HTMLElement;
    expect(within(row).queryByText(/D-2026-000006/)).toBeNull();
    expect(within(row).getByText(/Reste .* pour la prise en charge/)).toBeVisible();
  });

  it('aucun délai ni retard sur une demande terminée', async () => {
    renderAt('/?onglet=envoyees', DONE);
    const link = await screen.findByRole('link', { name: /Photocopies du contrôle/ });
    const row = link.closest('li') as HTMLElement;
    expect(within(row).queryByText(/Reste|En retard/)).toBeNull();
  });
});
