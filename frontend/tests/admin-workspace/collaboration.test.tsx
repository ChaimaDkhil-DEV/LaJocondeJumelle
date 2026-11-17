import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TransferDialog } from '../../src/features/admin-workspace/TransferDialog';
import { workspaceRoutes } from '../../src/features/admin-workspace/workspaceRoutes';
import { NOTIFICATION_LABELS } from '../../src/features/notifications/api';

/**
 * T036 — 018, US2 à US4 : « Collaboration » (propositions reçues, envoyées, historique), réponses avec
 * confirmation, envoi d'une délégation ou d'une demande de reprise.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const ME = { id: 'a2', username: 'admin2', displayName: 'M. Autre', jobTitle: null, role: 'ADMIN', permissions: [], mustChangePassword: false };
const ref = (id: string, displayName: string) => ({ id, displayName, jobTitle: 'Administration' });
const IN_90_MIN = new Date(Date.now() + 90 * 60_000).toISOString();

function transfer(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    type: 'DELEGATION_REQUEST',
    status: 'PENDING',
    reason: 'Je suis sur une urgence.',
    responseReason: null,
    cancelCause: null,
    request: { id: `r-${id}`, reference: 'D-2026-000009', title: `Serrure ${id}`, priority: 'NORMAL', status: 'PENDING_ADMIN_VALIDATION' },
    initiator: ref('a1', 'Mme Admin'),
    recipient: ref('a2', 'M. Autre'),
    currentOwner: ref('a1', 'Mme Admin'),
    createdAt: '2026-11-12T09:30:00.000Z',
    respondedAt: null,
    expiresAt: IN_90_MIN,
    cancelledAt: null,
    canAccept: true,
    canReject: true,
    canCancel: false,
    ...over,
  };
}

const page = (items: unknown[]) => json({ items, nextCursor: null });

interface Boxes {
  received?: unknown[];
  sent?: unknown[];
  history?: unknown[];
}

let calls: Array<{ url: string; method: string; body: unknown }> = [];

function stub(boxes: Boxes, onPost: (url: string) => Response | undefined = () => undefined) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (init?.method === 'POST') return onPost(url) ?? json(transfer('x', { status: 'ACCEPTED', canAccept: false, canReject: false }));
      if (url === '/api/auth/me') return json(ME);
      if (url.startsWith('/api/admin/transfers/received')) return page(boxes.received ?? []);
      if (url.startsWith('/api/admin/transfers/sent')) return page(boxes.sent ?? []);
      if (url.startsWith('/api/admin/transfers/history')) return page(boxes.history ?? []);
      if (url === '/api/admin/requests/summary') return json({ available: 0, mine: 0, active: 0, finished: 0, transfersReceivedPending: 2, transfersSentPending: 1 });
      if (url.includes('/transfer-candidates')) return json([ref('a2', 'M. Autre'), ref('a3', 'Mme Troisième')]);
      return json({ error: { code: 'NOT_FOUND', message: 'Introuvable' } }, 404);
    }),
  );
}

function wrap(ui: React.ReactNode) {
  const router = createMemoryRouter([{ path: '/', element: ui }, { path: '/demandes/:id', element: <h1>Détail</h1> }], { initialEntries: ['/'] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function renderWorkspace(path: string) {
  const router = createMemoryRouter([...workspaceRoutes, { path: '/demandes/:id', element: <h1>Détail</h1> }], { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

const section = async (name: string) => (await screen.findByRole('heading', { level: 3, name })).closest('section')!;

describe('Collaboration', () => {
  it('trois sections ; une proposition reçue montre qui, à qui, quoi, pourquoi, depuis quand et le délai restant', async () => {
    stub({ received: [transfer('1')] });
    renderWorkspace('/espace/collaboration');
    const received = await section('Demandes reçues');
    expect(await section('Demandes envoyées')).toBeVisible();
    expect(await section('Historique des transferts')).toBeVisible();

    const card = await within(received).findByRole('article', { name: 'Serrure 1' });
    expect(within(card).getByText('Délégation')).toBeVisible();
    expect(within(card).getByText('En attente')).toBeVisible();
    expect(within(card).getByText('Mme Admin')).toBeVisible();
    expect(within(card).getByText('M. Autre')).toBeVisible();
    expect(within(card).getByText('Je suis sur une urgence.')).toBeVisible();
    expect(within(card).getByText('12 nov. 2026', { exact: false })).toBeVisible();
    expect(within(card).getByText(/Réponse attendue sous 1 h (29|30)/)).toBeVisible();
    expect(within(card).getByRole('link', { name: 'Serrure 1' })).toHaveAttribute('href', '/demandes/r-1');

    // Accepter et Refuser se distinguent par leur libellé, pas par la couleur seule.
    expect(within(card).getByRole('button', { name: 'Accepter : Serrure 1' })).toBeEnabled();
    expect(within(card).getByRole('button', { name: 'Refuser : Serrure 1' })).toBeEnabled();
    expect(within(card).queryByRole('button', { name: /Annuler/ })).toBeNull();
  });

  it('états vides de chaque section, sans chiffre inventé', async () => {
    stub({});
    renderWorkspace('/espace/collaboration');
    expect(await within(await section('Demandes reçues')).findByText('Aucune proposition en attente de votre réponse')).toBeVisible();
    expect(await within(await section('Demandes envoyées')).findByText('Aucune proposition envoyée en attente')).toBeVisible();
    expect(await within(await section('Historique des transferts')).findByText('Aucun transfert passé')).toBeVisible();
  });

  it('accepter : confirmation d’abord, puis un seul appel, sans identifiant d’administrateur', async () => {
    stub({ received: [transfer('1')] });
    renderWorkspace('/espace/collaboration');
    await userEvent.click(await screen.findByRole('button', { name: 'Accepter : Serrure 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Accepter cette proposition ?' });
    expect(within(dialog).getByText(/Serrure 1/)).toBeVisible();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Accepter' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toEqual([{ url: '/api/admin/transfers/1/accept', method: 'POST', body: undefined }]));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('refuser : motif facultatif, transmis s’il est saisi', async () => {
    stub({ received: [transfer('1')] }, () => json(transfer('1', { status: 'REJECTED', canAccept: false, canReject: false })));
    renderWorkspace('/espace/collaboration');
    await userEvent.click(await screen.findByRole('button', { name: 'Refuser : Serrure 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Refuser cette proposition ?' });
    await userEvent.type(within(dialog).getByLabelText('Motif du refus (facultatif)'), 'Je suis en congé demain.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmer le refus' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'POST')).toEqual([
        { url: '/api/admin/transfers/1/reject', method: 'POST', body: { responseReason: 'Je suis en congé demain.' } },
      ]),
    );
  });

  it('refuser sans motif est permis', async () => {
    stub({ received: [transfer('1')] });
    renderWorkspace('/espace/collaboration');
    await userEvent.click(await screen.findByRole('button', { name: 'Refuser : Serrure 1' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirmer le refus' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toEqual([{ url: '/api/admin/transfers/1/reject', method: 'POST', body: {} }]));
  });

  it('proposition envoyée : l’auteur peut l’annuler, après confirmation, sans pouvoir y répondre', async () => {
    const sent = transfer('2', { type: 'TAKEOVER_REQUEST', initiator: ref('a2', 'M. Autre'), recipient: ref('a1', 'Mme Admin'), canAccept: false, canReject: false, canCancel: true });
    stub({ sent: [sent] });
    renderWorkspace('/espace/collaboration');
    const card = await within(await section('Demandes envoyées')).findByRole('article', { name: 'Serrure 2' });
    expect(within(card).getByText('Demande de reprise')).toBeVisible();
    expect(within(card).queryByRole('button', { name: /Accepter|Refuser/ })).toBeNull();
    await userEvent.click(within(card).getByRole('button', { name: 'Annuler la proposition : Serrure 2' }));
    const dialog = await screen.findByRole('dialog', { name: 'Annuler cette proposition ?' });
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Annuler la proposition' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toEqual([{ url: '/api/admin/transfers/2/cancel', method: 'POST', body: undefined }]));
  });

  it('réponse arrivée trop tard : le message du serveur est affiché', async () => {
    stub({ received: [transfer('1')] }, () =>
      json({ error: { code: 'TRANSFER_ALREADY_ANSWERED', message: 'Cette proposition a déjà reçu une réponse, a été annulée ou a expiré.' } }, 409),
    );
    renderWorkspace('/espace/collaboration');
    await userEvent.click(await screen.findByRole('button', { name: 'Accepter : Serrure 1' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Accepter' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Cette proposition a déjà reçu une réponse, a été annulée ou a expiré.');
  });

  it('historique : statut, motif du refus, cause d’une annulation, aucune action', async () => {
    stub({
      history: [
        transfer('3', { status: 'REJECTED', responseReason: 'Je suis en congé demain.', respondedAt: '2026-11-12T10:00:00.000Z', canAccept: false, canReject: false }),
        transfer('4', { status: 'CANCELLED', cancelCause: 'REQUEST_FINISHED', cancelledAt: '2026-11-12T10:00:00.000Z', canAccept: false, canReject: false }),
        transfer('5', { status: 'EXPIRED', cancelledAt: '2026-11-12T11:30:00.000Z', canAccept: false, canReject: false }),
        transfer('6', { status: 'ACCEPTED', respondedAt: '2026-11-12T10:00:00.000Z', canAccept: false, canReject: false }),
      ],
    });
    renderWorkspace('/espace/collaboration');
    const history = await section('Historique des transferts');
    const refused = await within(history).findByRole('article', { name: 'Serrure 3' });
    expect(within(refused).getByText('Refusée')).toBeVisible();
    expect(within(refused).getByText(/Je suis en congé demain\./)).toBeVisible();
    const cancelled = within(history).getByRole('article', { name: 'Serrure 4' });
    expect(within(cancelled).getByText('Annulée')).toBeVisible();
    expect(within(cancelled).getByText(/la demande a été terminée entre-temps/)).toBeVisible();
    expect(within(within(history).getByRole('article', { name: 'Serrure 5' })).getByText('Expirée')).toBeVisible();
    expect(within(within(history).getByRole('article', { name: 'Serrure 6' })).getByText('Acceptée')).toBeVisible();
    expect(within(history).queryByRole('button')).toBeNull();
    expect(within(history).queryByText(/Réponse attendue/)).toBeNull();
  });

  it('rubrique « Collaboration » dans l’espace, et compteurs de transferts sur le tableau de bord', async () => {
    stub({});
    renderWorkspace('/espace');
    const nav = await screen.findByRole('navigation', { name: 'Rubriques de l’espace de travail' });
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Tableau de bord',
      'File commune',
      'Mes demandes',
      'Demandes en cours',
      'Demandes terminées',
      'Collaboration',
      'Mon historique',
    ]);
    expect(await screen.findByRole('link', { name: 'Transferts reçus en attente : 2' })).toHaveAttribute('href', '/espace/collaboration');
    expect(screen.getByRole('link', { name: 'Transferts envoyés en attente : 1' })).toHaveAttribute('href', '/espace/collaboration');
  });
});

describe('Proposer un transfert', () => {
  const request = { id: 'r9', title: 'Serrure du gymnase' };

  it('délégation : destinataire et motif obligatoires, puis envoi au serveur', async () => {
    stub({}, () => json(transfer('9'), 201));
    const onClose = vi.fn();
    wrap(<TransferDialog open type="DELEGATION_REQUEST" request={request} onClose={onClose} />);
    const dialog = await screen.findByRole('dialog', { name: 'Proposer une délégation' });
    expect(within(dialog).getByText(/Serrure du gymnase/)).toBeVisible();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Envoyer la proposition' }));
    expect(await within(dialog).findByText('Choisissez l’administrateur à qui confier la demande.')).toBeVisible();
    expect(within(dialog).getByText('Le motif est obligatoire.')).toBeVisible();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Administrateur destinataire' }));
    await userEvent.click(await screen.findByRole('option', { name: /Mme Troisième/ }));
    await userEvent.type(within(dialog).getByLabelText(/^Motif/), 'Je pars en réunion.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Envoyer la proposition' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'POST')).toEqual([
        { url: '/api/admin/requests/r9/transfers', method: 'POST', body: { type: 'DELEGATION_REQUEST', recipientId: 'a3', reason: 'Je pars en réunion.' } },
      ]),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('demande de reprise : motif seulement, aucun destinataire transmis', async () => {
    stub({}, () => json(transfer('9', { type: 'TAKEOVER_REQUEST' }), 201));
    wrap(<TransferDialog open type="TAKEOVER_REQUEST" request={request} onClose={() => undefined} />);
    const dialog = await screen.findByRole('dialog', { name: 'Demander la reprise' });
    expect(within(dialog).queryByRole('combobox')).toBeNull();
    expect(calls.some((c) => c.url.includes('transfer-candidates'))).toBe(false);
    await userEvent.type(within(dialog).getByLabelText(/^Motif/), 'Je connais ce fournisseur.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Envoyer la demande' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'POST')).toEqual([
        { url: '/api/admin/requests/r9/transfers', method: 'POST', body: { type: 'TAKEOVER_REQUEST', reason: 'Je connais ce fournisseur.' } },
      ]),
    );
  });

  it('refus du serveur : son message est affiché, le dialogue reste ouvert', async () => {
    stub({}, () => json({ error: { code: 'TRANSFER_PENDING_EXISTS', message: 'Une proposition de transfert est déjà en attente pour cette demande.' } }, 409));
    const onClose = vi.fn();
    wrap(<TransferDialog open type="TAKEOVER_REQUEST" request={request} onClose={onClose} />);
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^Motif/), 'Je m’en charge.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Envoyer la demande' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Une proposition de transfert est déjà en attente pour cette demande.');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Notifications des transferts', () => {
  it('chaque nouveau type a un libellé lisible', () => {
    expect(NOTIFICATION_LABELS.TRANSFER_TAKEOVER_REQUESTED).toBe('Demande de reprise reçue');
    expect(NOTIFICATION_LABELS.TRANSFER_DELEGATION_REQUESTED).toBe('Délégation proposée');
    expect(NOTIFICATION_LABELS.TRANSFER_ACCEPTED).toBe('Transfert accepté');
    expect(NOTIFICATION_LABELS.TRANSFER_REJECTED).toBe('Transfert refusé');
    expect(NOTIFICATION_LABELS.TRANSFER_CANCELLED).toBe('Transfert annulé');
    expect(NOTIFICATION_LABELS.TRANSFER_EXPIRED).toBe('Transfert expiré');
    expect(NOTIFICATION_LABELS.ADMIN_OWNER_REASSIGNED).toBe('Demande réattribuée');
  });
});
