import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { navItemsFor } from '../../src/app/AppLayout';
import { RequestDetailPage } from '../../src/features/requests/RequestDetailPage';
import type { RequestDetail } from '../../src/features/requests/types';

/**
 * T026 — 018, US1 : le détail d'une demande montre son responsable ; un collègue la consulte en lecture
 * seule ; une demande libre peut être prise en charge depuis sa page. Entrée de menu « Espace de travail ».
 */

vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  values: async () => [],
}));

const me = (id: string, role = 'ADMIN') => ({ id, username: id, displayName: id, jobTitle: null, role, permissions: [], mustChangePassword: false });
const OWNER = { id: 'a1', displayName: 'Mme Admin', jobTitle: 'Administration' };

/** Délégation proposée par Mme Admin (a1) à l'utilisateur a2, en attente. */
const PENDING_TRANSFER = {
  id: 't1',
  type: 'DELEGATION_REQUEST',
  status: 'PENDING',
  reason: 'Je suis sur une urgence.',
  responseReason: null,
  cancelCause: null,
  request: { id: 'r1', reference: 'D-2026-000006', title: 'Réparer le vidéoprojecteur', priority: 'NORMAL', status: 'PENDING_ADMIN_VALIDATION' },
  initiator: OWNER,
  recipient: { id: 'a2', displayName: 'M. Autre', jobTitle: null },
  currentOwner: OWNER,
  createdAt: '2026-11-12T09:30:00.000Z',
  respondedAt: null,
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  cancelledAt: null,
  canAccept: true,
  canReject: true,
  canCancel: false,
};

function detail(over: Partial<RequestDetail> = {}): RequestDetail {
  return {
    id: 'r1',
    reference: 'D-2026-000006',
    title: 'Réparer le vidéoprojecteur',
    category: { id: 'c1', name: 'Intervention technique' },
    priority: 'NORMAL',
    status: 'PENDING_ADMIN_VALIDATION',
    requester: { id: 'u1', displayName: 'Enseignante' },
    assignee: null,
    adminOwner: null,
    adminOwnedAt: null,
    createdAt: '2026-10-12T10:00:00.000Z',
    currentStage: null,
    currentDueAt: null,
    warnAt: null,
    overdueStage: null,
    hasVoice: false,
    unreadCount: 0,
    description: 'Salle 12',
    voice: null,
    rulesSnapshot: { circuit: 'B_ADMIN_VALIDATION', photoRequired: false, closureMode: 'MANAGER', finalValidation: true },
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
    version: 4,
    rejectionReason: null,
    allowedActions: ['APPROVE', 'REJECT', 'CHANGE_PRIORITY'],
    canWriteInThread: true,
    ownership: { canClaim: true },
    ...over,
  };
}

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let posts: Array<{ url: string; body: unknown }> = [];

function renderDetail(request: RequestDetail, user = me('a2')) {
  posts = [];
  let current = request;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        if (url === '/api/admin/requests/r1/claim') {
          current = { ...current, adminOwner: { id: user.id, displayName: 'Moi', jobTitle: null }, ownership: { canClaim: false }, version: current.version + 1 };
          return json(200, current);
        }
      }
      if (url === '/api/auth/me') return json(200, user);
      if (url === '/api/requests/r1') return json(200, current);
      if (url.startsWith('/api/requests/r1/messages')) return json(200, { items: [], nextCursor: null });
      if (url === '/api/requests/r1/history') return json(200, []);
      if (url === '/api/requests/r1/assignees') return json(200, []);
      if (url === '/api/admin/transfers/t1') return json(200, PENDING_TRANSFER);
      if (url === '/api/admin/requests/r1/transfer-candidates') return json(200, [{ id: 'a3', displayName: 'Mme Troisième', jobTitle: null }]);
      return json(404, { error: { code: 'NOT_FOUND', message: 'Introuvable' } });
    }),
  );
  const router = createMemoryRouter([{ path: '/demandes/:id', element: <RequestDetailPage /> }], { initialEntries: ['/demandes/r1'] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

const info = async () => (await screen.findByRole('heading', { name: 'Informations' })).closest('section')!;

describe('Détail d’une demande — responsable administratif', () => {
  it('demande libre : « Prise en charge par : personne » et bouton « Prendre en charge » avec confirmation', async () => {
    renderDetail(detail());
    expect(within(await info()).getByText('Prise en charge par')).toBeVisible();
    expect(within(await info()).getByText('Personne pour le moment')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Prendre en charge' }));
    const dialog = await screen.findByRole('dialog', { name: 'Prendre en charge cette demande ?' });
    expect(posts).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Prendre en charge' }));

    expect(await within(await info()).findByText('Moi')).toBeVisible();
    expect(posts).toEqual([{ url: '/api/admin/requests/r1/claim', body: { version: 4 } }]);
    expect(screen.queryByRole('button', { name: 'Prendre en charge' })).toBeNull();
  });

  it('demande prise par un collègue : son nom, un bandeau « lecture seule », aucun bouton de prise en charge', async () => {
    renderDetail(detail({ adminOwner: OWNER, ownership: { canClaim: false }, allowedActions: [], canWriteInThread: false }));
    expect(within(await info()).getByText('Mme Admin')).toBeVisible();
    expect(screen.getByText('Mme Admin a pris cette demande en charge : vous la consultez en lecture seule.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Prendre en charge' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Approuver|Valider|Refuser/ })).toBeNull();
  });

  it('le responsable lui-même ne voit pas le bandeau « lecture seule »', async () => {
    renderDetail(detail({ adminOwner: OWNER, ownership: { canClaim: false } }), me('a1'));
    expect(within(await info()).getByText('Mme Admin')).toBeVisible();
    expect(screen.queryByText(/vous la consultez en lecture seule/)).toBeNull();
  });

  it('demande directe (sans responsable possible) : aucune ligne « Prise en charge par » pour la demandeuse', async () => {
    renderDetail(detail({ status: 'SENT', ownership: { canClaim: false }, allowedActions: ['CANCEL'] }), me('u1', 'EMPLOYEE'));
    expect(within(await info()).queryByText('Prise en charge par')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Prendre en charge' })).toBeNull();
  });
});

describe('Détail d’une demande — transferts', () => {
  it('celui qui a la demande à sa charge peut proposer une délégation à un collègue', async () => {
    renderDetail(detail({ adminOwner: OWNER, ownership: { canClaim: false, canDelegate: true, canAskTakeover: false, pendingTransferId: null } }), me('a1'));
    await userEvent.click(await screen.findByRole('button', { name: 'Proposer une délégation' }));
    const dialog = await screen.findByRole('dialog', { name: 'Proposer une délégation' });
    expect(within(dialog).getByRole('combobox', { name: 'Administrateur destinataire' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Demander la reprise' })).toBeNull();
  });

  it('un collègue peut demander la reprise, sans choisir de destinataire', async () => {
    renderDetail(
      detail({ adminOwner: OWNER, allowedActions: [], canWriteInThread: false, ownership: { canClaim: false, canDelegate: false, canAskTakeover: true, pendingTransferId: null } }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Demander la reprise' }));
    const dialog = await screen.findByRole('dialog', { name: 'Demander la reprise' });
    expect(within(dialog).queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Proposer une délégation' })).toBeNull();
  });

  it('proposition en attente : affichée sur la demande, avec les actions du destinataire, et aucune nouvelle proposition possible', async () => {
    renderDetail(
      detail({ adminOwner: OWNER, allowedActions: [], canWriteInThread: false, ownership: { canClaim: false, canDelegate: false, canAskTakeover: false, pendingTransferId: 't1' } }),
    );
    const section = (await screen.findByRole('heading', { name: 'Proposition de transfert en attente' })).closest('section')!;
    const card = await within(section).findByRole('article', { name: 'Réparer le vidéoprojecteur' });
    expect(within(card).getByText('Délégation')).toBeVisible();
    expect(within(card).getByText('Je suis sur une urgence.')).toBeVisible();
    expect(within(card).getByRole('button', { name: /^Accepter/ })).toBeEnabled();
    expect(within(card).getByRole('button', { name: /^Refuser/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Proposer une délégation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Demander la reprise' })).toBeNull();
  });

  it('sans droit de transfert (demandeuse, demande libre) : aucun bouton ni bandeau', async () => {
    renderDetail(detail({ ownership: { canClaim: false, canDelegate: false, canAskTakeover: false, pendingTransferId: null }, allowedActions: ['CANCEL'] }), me('u1', 'EMPLOYEE'));
    await info();
    expect(screen.queryByRole('button', { name: /délégation|reprise/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Proposition de transfert en attente' })).toBeNull();
  });
});

describe('Menu — « Espace de travail »', () => {
  const labels = (role: string) => navItemsFor({ ...me('x', role), isTeacher: false, isSupervisor: false } as never).map((item) => item.label);

  it('présent pour un admin, après « Nouvelle demande », sans déplacer les entrées existantes', () => {
    expect(labels('ADMIN')).toEqual(['Mes demandes', 'Nouvelle demande', 'Espace de travail', 'Surveillance', 'Communications', 'Administrateur']);
  });

  it('absent pour le super administrateur, les employés et les parents', () => {
    expect(labels('SUPER_ADMIN')).not.toContain('Espace de travail');
    expect(labels('EMPLOYEE')).not.toContain('Espace de travail');
    expect(labels('PARENT')).not.toContain('Espace de travail');
  });
});
