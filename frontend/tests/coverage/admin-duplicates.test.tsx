import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/Toast';
import { CoverageDetailPage } from '../../src/features/coverage/CoverageDetailPage';
import { CoveragePage } from '../../src/features/coverage/CoveragePage';

/**
 * T068 — Côté admin : propositions de rattachement (confirmer, garder distinctes, « non tranché »),
 * renforts à libérer, correction de l'enseignant, alertes double affectation et doublon possible.
 */

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const NOW = new Date().toISOString();

function summary(id: string, className: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    reference: `G-2026-00000${id}`,
    status: 'ON_DUTY',
    mainStatus: 'IN_PROGRESS',
    subState: null,
    source: 'SUPERVISOR_REPORT',
    type: 'EMPTY_CLASS',
    priority: 'URGENT',
    version: 2,
    category: { id: 'c1', name: 'Garde de classe' },
    class: { id: 'k1', name: className, room: null },
    floor: { id: 'f1', name: '1er étage' },
    teacher: null,
    absentTeacher: null,
    startAt: NOW,
    estimatedMinutes: null,
    plannedEndAt: null,
    requester: { id: 's1', displayName: 'Surveillant' },
    assignee: { id: 's1', displayName: 'Surveillant' },
    supports: [],
    alerts: [],
    reliefForId: null,
    mergedIntoId: null,
    hasVoice: false,
    hasNote: false,
    currentStage: null,
    currentDueAt: null,
    overdueStage: null,
    extensionCount: 0,
    durationMinutes: null,
    timestamps: { createdAt: NOW, acceptedAt: NOW, departedAt: null, presenceAt: NOW, relievedAt: null, closedAt: null, cancelledAt: null },
    ...extra,
  };
}

function detail(extra: Record<string, unknown> = {}) {
  return {
    ...summary('1', '1ère année Violet'),
    view: 'ADMIN',
    reason: null,
    note: null,
    voice: null,
    proofMode: 'BOTH',
    finalValidation: false,
    cancelReason: null,
    allowedActions: ['REASSIGN', 'SET_TEACHER', 'RELEASE_SUPPORT', 'CANCEL'],
    isManager: true,
    presences: [],
    history: [],
    ...extra,
  };
}

function setup(path: string, routes: Record<string, unknown>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call = { url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined };
      calls.push(call);
      const key = `${call.method} ${url}`;
      if (key in routes) return json(200, routes[key]);
      if (url === '/api/coverage/availability') {
        return json(200, {
          availability: 'AVAILABLE',
          activeGuards: [],
          isTeacher: false,
          isSupervisor: false,
          inGroup: false,
          canManage: true,
          schoolDates: { timezone: 'Europe/Paris', today: '2026-10-20', tomorrow: '2026-10-21' },
        });
      }
      if (url === '/api/coverage/teachers') return json(200, [{ id: 't1', displayName: 'Enseignante' }]);
      if (call.method === 'GET') return json(200, []);
      return json(200, detail());
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/gardes" element={<CoveragePage />} />
            <Route path="/gardes/:id" element={<CoverageDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return calls;
}

const writes = (calls: Call[]) => calls.filter((c) => c.method === 'POST');

afterEach(() => vi.unstubAllGlobals());

describe('Doublons possibles', () => {
  const proposals = [
    {
      id: 'p1',
      status: 'PENDING',
      unresolved: false,
      createdAt: NOW,
      decidedAt: null,
      finalPresentedAt: null,
      source: summary('1', '1ère année Violet', { alerts: ['POSSIBLE_DUPLICATE'] }),
      target: summary('2', '1ère année Violet', { status: 'PENDING', mainStatus: 'PENDING', source: 'TEACHER_REQUEST', type: 'LATENESS', assignee: null }),
    },
    {
      id: 'p2',
      status: 'PENDING',
      unresolved: true,
      createdAt: NOW,
      decidedAt: null,
      finalPresentedAt: NOW,
      source: summary('3', 'CE2 Jaune', { status: 'CLOSED', mainStatus: 'DONE', subState: 'CLOSED' }),
      target: summary('4', 'CE2 Jaune', { status: 'CANCELLED', mainStatus: 'CANCELLED' }),
    },
  ];

  it('onglet « Doublons » : paires, mention « non tranché », confirmation et refus', async () => {
    const user = userEvent.setup();
    const calls = setup('/gardes?onglet=doublons', { 'GET /api/coverage/merge-proposals?status=PENDING': proposals });
    const list = await screen.findByRole('list', { name: 'Doublons possibles' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Déclaration du surveillant');
    expect(items[0]).toHaveTextContent('Demande de l’enseignant');
    expect(within(items[0]).queryByText('Non tranché')).not.toBeInTheDocument();
    expect(within(items[1]).getByText('Non tranché')).toBeInTheDocument();

    await user.click(within(items[0]).getByRole('button', { name: 'Confirmer le rattachement' }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ url: '/api/coverage/merge-proposals/p1/decision', body: { decision: 'CONFIRM' } });
    await user.click(within(items[1]).getByRole('button', { name: 'Garder distinctes' }));
    await waitFor(() => expect(writes(calls)).toHaveLength(2));
    expect(writes(calls)[1]).toMatchObject({ url: '/api/coverage/merge-proposals/p2/decision', body: { decision: 'REJECT' } });
  });

  it('alertes dans la file : double affectation et doublon possible', async () => {
    setup('/gardes?onglet=en-cours', {
      'GET /api/coverage?mainStatus=ASSIGNED&mainStatus=IN_PROGRESS': [
        summary('1', 'CM1 A', { alerts: ['DOUBLE_ASSIGNMENT'] }),
        summary('2', 'CM2 B', { alerts: ['POSSIBLE_DUPLICATE'] }),
      ],
    });
    expect(await screen.findByText('Surveillant sur deux affectations')).toBeInTheDocument();
    expect(screen.getByText('Doublon possible')).toBeInTheDocument();
  });
});

describe('Détail : renforts et enseignant', () => {
  it('libérer un renfort', async () => {
    const user = userEvent.setup();
    const calls = setup('/gardes/1', {
      'GET /api/coverage/1': detail({ supports: [{ id: 'sup1', user: { id: 's2', displayName: 'Remplaçante' }, joinedAt: NOW }] }),
    });
    const supports = await screen.findByRole('list', { name: 'Renforts' });
    await user.click(within(supports).getByRole('button', { name: 'Libérer Remplaçante' }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ url: '/api/coverage/1/actions', body: { action: 'RELEASE_SUPPORT', supportId: 'sup1', version: 2 } });
  });

  it('corriger l’enseignant : choix dans le groupe Enseignants ou « non précisé »', async () => {
    const user = userEvent.setup();
    const calls = setup('/gardes/1', { 'GET /api/coverage/1': detail() });
    expect(await screen.findByText('Enseignant non précisé')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Corriger l’enseignant' }));
    const dialog = await screen.findByRole('dialog', { name: 'Corriger l’enseignant' });
    await user.click(within(dialog).getByRole('combobox', { name: /Enseignant/ }));
    await user.click(await screen.findByRole('option', { name: 'Enseignante' }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ body: { action: 'SET_TEACHER', teacherId: 't1', version: 2 } });
  });

  it('alerte double affectation sur le détail', async () => {
    setup('/gardes/1', { 'GET /api/coverage/1': detail({ alerts: ['DOUBLE_ASSIGNMENT'] }) });
    expect(await screen.findByText(/Ce surveillant a une autre affectation en cours/)).toBeInTheDocument();
  });
});
