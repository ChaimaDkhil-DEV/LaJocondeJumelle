import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestActions } from '../../src/features/requests/RequestActions';
import { RequestListPage } from '../../src/features/requests/RequestListPage';
import type { RequestDetail } from '../../src/features/requests/types';

/** T075 — US5 : approbation (employé choisi ou affectation automatique), refus, validation finale, onglet « À valider ». */

vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  values: async () => [],
}));

function detail(overrides: Partial<RequestDetail> = {}): RequestDetail {
  return {
    id: 'r1',
    reference: 'D-2026-000001',
    title: 'Vidéoprojecteur',
    category: { id: 'c1', name: 'Intervention technique' },
    priority: 'NORMAL',
    status: 'PENDING_ADMIN_VALIDATION',
    requester: { id: 'u1', displayName: 'Enseignante' },
    assignee: null,
    createdAt: '2026-10-12T10:00:00.000Z',
    currentStage: null,
    currentDueAt: null,
    warnAt: null,
    overdueStage: null,
    hasVoice: false,
    unreadCount: 0,
    description: 'Salle 12',
    voice: null,
    rulesSnapshot: { circuit: 'B_ADMIN_VALIDATION', photoRequired: true, closureMode: 'MANAGER', finalValidation: true, assignmentMode: 'MANUAL' },
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
    version: 2,
    rejectionReason: null,
    allowedActions: ['APPROVE', 'REJECT', 'CHANGE_PRIORITY'],
    canWriteInThread: true,
    ...overrides,
  };
}

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Call = { url: string; method: string; body: unknown };

function stubFetch(handler: (call: Call) => Response | undefined): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call = { url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined };
      calls.push(call);
      return handler(call) ?? json(404, { error: { code: 'NOT_FOUND', message: 'Introuvable' } });
    }),
  );
  return calls;
}

function renderActions(request: RequestDetail): Call[] {
  const calls = stubFetch((call) => {
    if (call.url === '/api/requests/r1/assignees') {
      return json(200, [
        { id: 'e1', displayName: 'Reprographie', jobTitle: 'Reprographie' },
        { id: 'e2', displayName: 'Agent technique', jobTitle: null },
      ]);
    }
    if (call.url === '/api/requests/r1/actions') return json(200, { ...request, status: 'SENT', version: 3 });
    return undefined;
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RequestActions request={request} />
    </QueryClientProvider>,
  );
  return calls;
}

const actionBody = (calls: Call[]) => calls.find((c) => c.url === '/api/requests/r1/actions')?.body;

describe('Approbation (circuit B)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('approuve en choisissant l’employé parmi ceux de la catégorie', async () => {
    const calls = renderActions(detail());
    await userEvent.click(screen.getByRole('button', { name: 'Approuver' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approuver la demande' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Approuver et affecter' }));
    expect(within(dialog).getByText('Choisissez l’employé qui réalisera la demande.')).toBeVisible();
    expect(actionBody(calls)).toBeUndefined();

    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Employé chargé de la demande' }));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Reprographie — Reprographie', 'Agent technique']);
    await userEvent.click(options[0]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approuver et affecter' }));
    await waitFor(() => expect(actionBody(calls)).toEqual({ action: 'APPROVE', version: 2, assigneeId: 'e1' }));
  });

  it('en affectation automatique, approuve sans choix d’employé', async () => {
    const calls = renderActions(
      detail({ rulesSnapshot: { circuit: 'B_ADMIN_VALIDATION', photoRequired: false, closureMode: 'MANAGER', finalValidation: false, assignmentMode: 'AUTO' } }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Approuver' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approuver la demande' });
    expect(within(dialog).getByText(/affectée automatiquement/)).toBeVisible();
    expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approuver' }));
    await waitFor(() => expect(actionBody(calls)).toEqual({ action: 'APPROVE', version: 2 }));
  });

  it('refuse avec un motif obligatoire', async () => {
    const calls = renderActions(detail());
    await userEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    const dialog = await screen.findByRole('dialog', { name: 'Refuser la demande' });
    await userEvent.type(within(dialog).getByLabelText('Motif du refus'), 'Sous garantie');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmer le refus' }));
    await waitFor(() => expect(actionBody(calls)).toEqual({ action: 'REJECT', version: 2, reason: 'Sous garantie' }));
  });

  it('valide la fin de la demande (validation finale)', async () => {
    const calls = renderActions(detail({ status: 'PENDING_FINAL_VALIDATION', allowedActions: ['VALIDATE_FINAL', 'REQUEST_CORRECTION'] }));
    expect(screen.getByRole('button', { name: 'Renvoyer à corriger' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Valider et clôturer' }));
    await waitFor(() => expect(actionBody(calls)).toEqual({ action: 'VALIDATE_FINAL', version: 2 }));
  });
});

describe('Onglet « À valider »', () => {
  afterEach(() => vi.unstubAllGlobals());

  function renderList(role: string): Call[] {
    const calls = stubFetch((call) => {
      if (call.url === '/api/auth/me') {
        return json(200, { id: 'm1', displayName: 'Responsable', role, permissions: [], mustChangePassword: false });
      }
      if (call.url.startsWith('/api/requests?')) return json(200, { items: [], nextCursor: null });
      return undefined;
    });
    const router = createMemoryRouter([{ path: '/', element: <RequestListPage /> }], { initialEntries: ['/'] });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    return calls;
  }

  it('est proposé aux responsables et charge les demandes à valider de leurs catégories', async () => {
    const calls = renderList('MANAGER');
    await userEvent.click(await screen.findByRole('tab', { name: 'À valider' }));
    await waitFor(() =>
      expect(calls.some((c) => c.url === '/api/requests?scope=managed&status=PENDING_ADMIN_VALIDATION&status=PENDING_FINAL_VALIDATION')).toBe(true),
    );
    expect(await screen.findByText('Aucune demande ne vous attend.')).toBeVisible();
  });

  it('n’est pas proposé aux employés', async () => {
    renderList('EMPLOYEE');
    expect(await screen.findByRole('tab', { name: 'Reçues' })).toBeVisible();
    expect(screen.queryByRole('tab', { name: 'À valider' })).not.toBeInTheDocument();
  });
});

describe('Réaffectation (US6)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('recharge la liste à chaque ouverture : un employé créé entre-temps y figure sans recharger la page', async () => {
    let assignees = [{ id: 'e1', displayName: 'Reprographie', jobTitle: 'Reprographie' }];
    const calls = stubFetch((call) =>
      call.url === '/api/requests/r1/assignees' ? json(200, assignees) : undefined,
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RequestActions request={detail({ status: 'SENT', assignee: null, allowedActions: ['REASSIGN'] })} />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Réaffecter' }));
    let dialog = await screen.findByRole('dialog', { name: 'Réaffecter la demande' });
    await userEvent.click(await within(dialog).findByRole('combobox', { name: 'Nouvel employé' }));
    expect(within(await screen.findByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Reprographie — Reprographie']);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retour' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Le super administrateur crée un employé rattaché à la catégorie pendant que la page reste ouverte.
    assignees = [...assignees, { id: 'e3', displayName: 'Nouveau technicien', jobTitle: 'Climatisation' }];
    await userEvent.click(screen.getByRole('button', { name: 'Réaffecter' }));
    dialog = await screen.findByRole('dialog', { name: 'Réaffecter la demande' });
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/requests/r1/assignees')).toHaveLength(2));
    await userEvent.click(await within(dialog).findByRole('combobox', { name: 'Nouvel employé' }));
    expect(await screen.findByRole('option', { name: 'Nouveau technicien — Climatisation' })).toBeVisible();
  });

  it('un responsable confie la demande à un autre employé de la catégorie', async () => {
    const calls = renderActions(
      detail({
        status: 'IN_PROGRESS',
        assignee: { id: 'e1', displayName: 'Reprographie' },
        allowedActions: ['REASSIGN', 'CHANGE_PRIORITY'],
        rulesSnapshot: { circuit: 'A_DIRECT', photoRequired: false, closureMode: 'AUTO', finalValidation: false, assignmentMode: 'MANUAL' },
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Réaffecter' }));
    const dialog = await screen.findByRole('dialog', { name: 'Réaffecter la demande' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Réaffecter' }));
    expect(within(dialog).getByText('Choisissez le nouvel employé.')).toBeVisible();

    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Nouvel employé' }));
    await userEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Agent technique' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Réaffecter' }));
    await waitFor(() => expect(actionBody(calls)).toEqual({ action: 'REASSIGN', version: 2, assigneeId: 'e2' }));
  });
});
