import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupervisionPage } from '../../src/features/admin/SupervisionPage';

/**
 * T050 — 018, US5 : supervision du super administrateur. Demandes et leur responsable (filtres),
 * administrateurs et leur charge, propositions de transfert, réattribution et libération avec motif.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const ref = (id: string, displayName: string) => ({ id, displayName, jobTitle: 'Administration' });

function supervised(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    reference: `D-2026-00000${id}`,
    title: `Demande ${id}`,
    category: { id: 'c', name: 'Intervention technique' },
    priority: 'NORMAL',
    status: 'PENDING_ADMIN_VALIDATION',
    requester: { id: 'u1', displayName: 'Mme Martin' },
    assignee: null,
    adminOwner: ref('a1', 'Mme Admin'),
    adminOwnedAt: '2026-11-10T09:00:00.000Z',
    adminOwnerUnavailable: false,
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

const ADMINS = [
  { ...ref('a1', 'Mme Admin'), active: true, ownedActive: 2, ownedFinished: 5, transfersPending: 1, lastOperationAt: '2026-11-12T09:30:00.000Z' },
  { ...ref('a2', 'M. Autre'), active: false, ownedActive: 1, ownedFinished: 0, transfersPending: 0, lastOperationAt: null },
];

const TRANSFER = {
  id: 't1',
  type: 'DELEGATION_REQUEST',
  status: 'PENDING',
  reason: 'Je suis sur une urgence.',
  responseReason: null,
  cancelCause: null,
  request: { id: '1', reference: 'D-1', title: 'Demande 1', priority: 'NORMAL', status: 'PENDING_ADMIN_VALIDATION' },
  initiator: ref('a1', 'Mme Admin'),
  recipient: ref('a2', 'M. Autre'),
  currentOwner: ref('a1', 'Mme Admin'),
  createdAt: '2026-11-12T09:30:00.000Z',
  respondedAt: null,
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  cancelledAt: null,
  canAccept: false,
  canReject: false,
  canCancel: false,
};

let calls: Array<{ url: string; method: string; body: unknown }> = [];

/** Administrateurs que le serveur déclare éligibles pour la demande (actifs, admins de sa catégorie, sans celui qui l'a déjà). */
let candidates: unknown[] = [];
/** Seconde page de demandes, servie quand l'interface renvoie le curseur de la première. */
let nextRequests: unknown[] = [];
/** Vrai : la liste des transferts a une seconde page. */
let moreTransfers = false;

function renderPage(requests: unknown[], onPost: () => Response = () => json(supervised('1'))) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (init?.method === 'POST') return onPost();
      if (url.includes('/reassign-candidates')) return json(candidates);
      if (url.startsWith('/api/super-admin/requests')) {
        if (url.includes('cursor=suite')) return json({ items: nextRequests, nextCursor: null });
        return json({ items: requests, nextCursor: nextRequests.length ? 'suite' : null });
      }
      if (url === '/api/super-admin/administrators') return json(ADMINS);
      if (url.startsWith('/api/super-admin/transfers')) {
        if (url.includes('cursor=suite')) {
          return json({ items: [{ ...TRANSFER, id: 't2', request: { ...TRANSFER.request, id: '2', title: 'Demande 2' } }], nextCursor: null });
        }
        return json({ items: [TRANSFER], nextCursor: moreTransfers ? 'suite' : null });
      }
      return json({ error: { code: 'NOT_FOUND', message: 'Introuvable' } }, 404);
    }),
  );
  const router = createMemoryRouter([{ path: '/', element: <SupervisionPage /> }, { path: '/demandes/:id', element: <h1>Détail</h1> }], { initialEntries: ['/'] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const lastRequestsCall = () =>
  calls.filter((c) => c.url.startsWith('/api/super-admin/requests') && !c.url.includes('reassign-candidates')).at(-1)!.url;

afterEach(() => {
  vi.unstubAllGlobals();
  candidates = [];
  nextRequests = [];
  moreTransfers = false;
});

describe('Supervision — demandes', () => {
  it('liste les demandes avec la personne qui les a prises en charge ; « Libre » sinon ; responsable indisponible signalé', async () => {
    renderPage([supervised('1'), supervised('2', { adminOwner: null, adminOwnedAt: null }), supervised('3', { adminOwner: ref('a2', 'M. Autre'), adminOwnerUnavailable: true })]);
    const first = await screen.findByRole('article', { name: 'Demande 1' });
    expect(within(first).getByText('Mme Admin')).toBeVisible();
    expect(within(first).getByText('En attente de validation administrative')).toBeVisible();
    expect(within(first).getByRole('link', { name: 'Demande 1' })).toHaveAttribute('href', '/demandes/1');
    expect(within(screen.getByRole('article', { name: 'Demande 2' })).getByText('Libre')).toBeVisible();
    const flagged = screen.getByRole('article', { name: 'Demande 3' });
    expect(within(flagged).getByText('Administrateur indisponible')).toBeVisible();
    expect(within(flagged).getByRole('button', { name: 'Réattribuer : Demande 3' })).toBeEnabled();
  });

  it('une demande terminée ne peut plus être réattribuée', async () => {
    renderPage([supervised('4', { status: 'CLOSED' })]);
    const row = await screen.findByRole('article', { name: 'Demande 4' });
    expect(within(row).queryByRole('button', { name: /Réattribuer/ })).toBeNull();
  });

  it('filtres : prise en charge, état, administrateur, priorité, statut et période sont transmis au serveur', async () => {
    renderPage([supervised('1')]);
    await screen.findByRole('article', { name: 'Demande 1' });
    const choose = async (label: string, option: string) => {
      await userEvent.click(screen.getByRole('combobox', { name: label }));
      await userEvent.click(await screen.findByRole('option', { name: option }));
    };
    await choose('Prise en charge', 'Prises en charge');
    await waitFor(() => expect(lastRequestsCall()).toContain('ownership=owned'));
    await choose('État', 'En cours');
    await waitFor(() => expect(lastRequestsCall()).toContain('state=active'));
    await choose('Administrateur', 'Mme Admin');
    await waitFor(() => expect(lastRequestsCall()).toContain('adminId=a1'));
    await choose('Priorité', 'Urgente');
    await waitFor(() => expect(lastRequestsCall()).toContain('priority=URGENT'));
    await choose('Statut', 'Envoyée');
    await waitFor(() => expect(lastRequestsCall()).toContain('status=SENT'));
    await userEvent.type(screen.getByLabelText('Créées à partir du'), '2026-11-01');
    await waitFor(() => expect(lastRequestsCall()).toContain('from=2026-11-01'));
    await userEvent.type(screen.getByLabelText('Créées jusqu’au'), '2026-11-30');
    await waitFor(() => expect(lastRequestsCall()).toContain('to=2026-11-30'));
    expect(lastRequestsCall()).toMatch(/ownership=owned.*state=active.*adminId=a1/);

    await userEvent.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
    await waitFor(() => expect(lastRequestsCall()).not.toMatch(/ownership|state=|adminId|priority|status=|from=|to=/));
  });

  it('liste paginée : « Afficher plus de demandes » charge la page suivante avec le curseur et les filtres en cours', async () => {
    nextRequests = [supervised('8'), supervised('9')];
    renderPage([supervised('1'), supervised('2')]);
    await screen.findByRole('article', { name: 'Demande 1' });
    expect(lastRequestsCall()).toContain('limit=25');
    expect(screen.queryByRole('article', { name: 'Demande 8' })).toBeNull();

    await userEvent.click(screen.getByRole('combobox', { name: 'Priorité' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Urgente' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Afficher plus de demandes' }));
    expect(await screen.findByRole('article', { name: 'Demande 9' })).toBeVisible();
    expect(screen.getByRole('article', { name: 'Demande 1' })).toBeVisible();
    expect(lastRequestsCall()).toMatch(/priority=URGENT/);
    expect(lastRequestsCall()).toContain('cursor=suite');
    // Dernière page atteinte : plus de bouton.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Afficher plus de demandes' })).toBeNull());
  });

  it('une seule page : pas de bouton « Afficher plus »', async () => {
    renderPage([supervised('1')]);
    await screen.findByRole('article', { name: 'Demande 1' });
    expect(screen.queryByRole('button', { name: 'Afficher plus de demandes' })).toBeNull();
  });

  it('état vide et erreur avec « Réessayer »', async () => {
    renderPage([]);
    expect(await screen.findByText('Aucune demande ne correspond à ces critères')).toBeVisible();
  });
});

describe('Supervision — réattribution', () => {
  async function openDialog() {
    renderPage([supervised('1')], () => json(supervised('1', { adminOwner: ref('a2', 'M. Autre') })));
    await userEvent.click(await screen.findByRole('button', { name: 'Réattribuer : Demande 1' }));
    return screen.findByRole('dialog', { name: 'Réattribuer la demande' });
  }

  it('motif et destinataire obligatoires ; sans administrateur éligible, seule la remise dans la file commune est proposée', async () => {
    const dialog = await openDialog();
    expect(within(dialog).getByText(/Demande 1/)).toBeVisible();
    expect(within(dialog).getByText(/sans l’accord des administrateurs/)).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Réattribuer' }));
    expect(await within(dialog).findByText('Choisissez un administrateur, ou la remise dans la file commune.')).toBeVisible();
    expect(within(dialog).getByText('Le motif est obligatoire.')).toBeVisible();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Nouvelle attribution' }));
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options).toEqual(['Remettre dans la file commune (personne)']);
  });

  it('ne propose que les administrateurs que le serveur déclare éligibles pour cette demande', async () => {
    // Le serveur ne renvoie que l'admin de la catégorie ; la liste générale des administrateurs en compte d'autres.
    candidates = [ref('a9', 'Mme Éligible')];
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Nouvelle attribution' }));
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options).toEqual(['Mme Éligible — Administration', 'Remettre dans la file commune (personne)']);
    expect(calls.some((c) => c.url === '/api/super-admin/requests/1/reassign-candidates')).toBe(true);

    await userEvent.click(screen.getByRole('option', { name: 'Mme Éligible — Administration' }));
    await userEvent.type(within(dialog).getByLabelText(/^Motif/), 'Absence imprévue.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Réattribuer' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'POST')).toEqual([
        { url: '/api/super-admin/requests/1/reassign', method: 'POST', body: { adminId: 'a9', reason: 'Absence imprévue.' } },
      ]),
    );
  });

  it('demande libre sans administrateur éligible : le dialogue le dit et n’envoie rien', async () => {
    renderPage([supervised('2', { adminOwner: null, adminOwnedAt: null })]);
    await userEvent.click(await screen.findByRole('button', { name: 'Réattribuer : Demande 2' }));
    const dialog = await screen.findByRole('dialog', { name: 'Réattribuer la demande' });
    expect(await within(dialog).findByText('Aucun administrateur actif ne s’occupe de la catégorie de cette demande.')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Réattribuer' })).toBeDisabled();
  });

  it('libération : envoie « personne » et le motif, puis ferme', async () => {
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Nouvelle attribution' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Remettre dans la file commune (personne)' }));
    await userEvent.type(within(dialog).getByLabelText(/^Motif/), 'Mme Admin est absente.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Réattribuer' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'POST')).toEqual([
        { url: '/api/super-admin/requests/1/reassign', method: 'POST', body: { adminId: null, reason: 'Mme Admin est absente.' } },
      ]),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('refus du serveur : son message est affiché, le dialogue reste ouvert', async () => {
    renderPage([supervised('1')], () =>
      json({ error: { code: 'TRANSFER_RECIPIENT_INVALID', message: 'Choisissez un autre administrateur, actif et admin de la catégorie de la demande.' } }, 422),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Réattribuer : Demande 1' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Nouvelle attribution' }));
    await userEvent.click(await screen.findByRole('option', { name: /Remettre dans la file commune/ }));
    await userEvent.type(within(dialog).getByLabelText(/^Motif/), 'x');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Réattribuer' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Choisissez un autre administrateur, actif et admin de la catégorie de la demande.');
  });
});

describe('Supervision — administrateurs et transferts', () => {
  it('administrateurs : charge de chacun, compte désactivé signalé, accès à ses demandes', async () => {
    renderPage([supervised('1')]);
    await userEvent.click(await screen.findByRole('tab', { name: 'Administrateurs' }));
    const active = await screen.findByRole('article', { name: 'Mme Admin' });
    expect(within(active).getByText('Actif')).toBeVisible();
    expect(within(active).getByText('2')).toBeVisible();
    expect(within(active).getByText('5')).toBeVisible();
    expect(within(active).getByText('1')).toBeVisible();
    expect(within(active).getByText('12 nov. 2026', { exact: false })).toBeVisible();
    const inactive = screen.getByRole('article', { name: 'M. Autre' });
    expect(within(inactive).getByText('Désactivé')).toBeVisible();
    expect(within(inactive).getByText('Aucune opération')).toBeVisible();

    await userEvent.click(within(inactive).getByRole('button', { name: 'Voir ses demandes : M. Autre' }));
    expect(await screen.findByRole('tab', { name: 'Demandes' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(lastRequestsCall()).toContain('adminId=a2'));
  });

  it('transferts : toutes les propositions, filtrées par statut, sans action', async () => {
    renderPage([supervised('1')]);
    await userEvent.click(await screen.findByRole('tab', { name: 'Transferts' }));
    const card = await screen.findByRole('article', { name: 'Demande 1' });
    expect(within(card).getByText('Délégation')).toBeVisible();
    expect(within(card).queryByRole('button')).toBeNull();
    expect(calls.filter((c) => c.url.startsWith('/api/super-admin/transfers')).at(-1)!.url).toContain('status=PENDING');
    await userEvent.click(screen.getByRole('combobox', { name: 'Statut des propositions' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Refusée' }));
    await waitFor(() => expect(calls.filter((c) => c.url.startsWith('/api/super-admin/transfers')).at(-1)!.url).toContain('status=REJECTED'));
  });

  it('transferts : « Afficher plus de propositions » charge la page suivante', async () => {
    moreTransfers = true;
    renderPage([supervised('1')]);
    await userEvent.click(await screen.findByRole('tab', { name: 'Transferts' }));
    await screen.findByRole('article', { name: 'Demande 1' });
    await userEvent.click(screen.getByRole('button', { name: 'Afficher plus de propositions' }));
    expect(await screen.findByRole('article', { name: 'Demande 2' })).toBeVisible();
    const last = calls.filter((c) => c.url.startsWith('/api/super-admin/transfers')).at(-1)!.url;
    expect(last).toContain('status=PENDING');
    expect(last).toContain('cursor=suite');
  });
});
