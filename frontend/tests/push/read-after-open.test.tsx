import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/Toast';
import { LoginPage } from '../../src/features/auth/LoginPage';
import { RequireAuth } from '../../src/features/auth/RequireAuth';
import { CoverageDetailPage } from '../../src/features/coverage/CoverageDetailPage';
import { RequestDetailPage } from '../../src/features/requests/RequestDetailPage';
import { installFakeMedia } from '../mocks/media-recorder';

/**
 * 014, T024 (FR-008, US1-2, US1-3) : ouverte depuis un push (`?notification=<id>`), la page marque la
 * notification lue seulement après le chargement réussi de la ressource (droits vérifiés par le serveur),
 * puis retire le paramètre de l'adresse. Une session expirée passe par la connexion d'abord.
 */

vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  values: async () => [],
}));

const NOTIFICATION = '3f1c0000-0000-4000-8000-0000000000aa';
const ME = { id: 'u1', displayName: 'Surveillant', role: 'EMPLOYEE', permissions: [], mustChangePassword: false };
const START = '2026-10-20T07:00:00.000Z';

const COVERAGE = {
  id: 'g1',
  reference: 'G-2026-000001',
  status: 'ACCEPTED',
  mainStatus: 'ASSIGNED',
  subState: null,
  source: 'ADMIN_DIRECT',
  type: 'ABSENCE',
  priority: 'URGENT',
  version: 2,
  category: { id: 'c1', name: 'Garde de classe' },
  class: { id: 'k1', name: '1ère année Violet', room: 'Salle 12' },
  floor: { id: 'f1', name: '1er étage' },
  teacher: null,
  absentTeacher: null,
  startAt: START,
  estimatedMinutes: 60,
  plannedEndAt: '2026-10-20T08:00:00.000Z',
  requester: { id: 'a1', displayName: 'Admin' },
  assignee: { id: 'u1', displayName: 'Surveillant' },
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
  timestamps: { createdAt: START, acceptedAt: START, departedAt: null, presenceAt: null, relievedAt: null, closedAt: null, cancelledAt: null },
  view: 'ASSIGNEE',
  reason: null,
  note: null,
  voice: null,
  proofMode: 'QR',
  finalValidation: false,
  cancelReason: null,
  allowedActions: [],
  modifiableFields: [],
  isManager: false,
  presences: [],
  history: [],
};

const REQUEST = {
  id: 'r1',
  reference: 'D-2026-000006',
  title: 'Photocopies du contrôle',
  category: { id: 'c1', name: 'Photocopies' },
  priority: 'URGENT',
  status: 'SENT',
  requester: { id: 'u2', displayName: 'Enseignante' },
  assignee: { id: 'u1', displayName: 'Reprographie' },
  createdAt: '2026-10-12T10:00:00.000Z',
  currentStage: null,
  currentDueAt: null,
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
  allowedActions: [],
  canWriteInThread: false,
};

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

interface Options {
  coverage?: Response;
  request?: Response;
  /** Session expirée au départ : /api/auth/me répond 401 jusqu'à la connexion. */
  expired?: boolean;
}

function setup(path: string, options: Options = {}) {
  const reads: unknown[] = [];
  let loggedIn = !options.expired;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (url === '/api/auth/me') return loggedIn ? json(200, ME) : json(401, { error: { code: 'UNAUTHENTICATED', message: 'Session expirée' } });
      if (url === '/api/auth/login' && method === 'POST') {
        loggedIn = true;
        return json(200, { user: ME });
      }
      if (url === '/api/notifications/read' && method === 'POST') {
        reads.push(JSON.parse(String(init.body)));
        return json(204);
      }
      if (url === '/api/coverage/g1') return options.coverage ?? json(200, COVERAGE);
      if (url === '/api/requests/r1') return options.request ?? json(200, REQUEST);
      if (url.startsWith('/api/requests/r1/messages')) return json(200, { items: [], nextCursor: null });
      if (url === '/api/coverage/availability') {
        return json(200, {
          availability: 'AVAILABLE',
          activeGuards: [],
          isTeacher: false,
          isSupervisor: true,
          inGroup: true,
          canManage: false,
          schoolDates: { timezone: 'Europe/Paris', today: '2026-10-20', tomorrow: '2026-10-21' },
        });
      }
      return json(200, []);
    }),
  );
  installFakeMedia();
  const router = createMemoryRouter(
    [
      { path: '/connexion', element: <LoginPage /> },
      {
        path: '/',
        element: (
          <RequireAuth>
            <Outlet />
          </RequireAuth>
        ),
        children: [
          { path: 'gardes/:id', element: <CoverageDetailPage /> },
          { path: 'demandes/:id', element: <RequestDetailPage /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { reads, router };
}

afterEach(() => vi.unstubAllGlobals());

describe('Ouverture depuis un push (FR-008)', () => {
  it('garde : marquée lue après le chargement, paramètre retiré', async () => {
    const { reads, router } = setup(`/gardes/g1?notification=${NOTIFICATION}`);
    expect((await screen.findAllByText(/1ère année Violet/))[0]).toBeVisible();
    await waitFor(() => expect(reads).toEqual([{ ids: [NOTIFICATION] }]));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(router.state.location.pathname).toBe('/gardes/g1');
  });

  it('demande de travail : marquée lue après le chargement, paramètre retiré', async () => {
    const { reads, router } = setup(`/demandes/r1?notification=${NOTIFICATION}`);
    expect(await screen.findByRole('heading', { name: 'Photocopies du contrôle' })).toBeVisible();
    await waitFor(() => expect(reads).toEqual([{ ids: [NOTIFICATION] }]));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it.each([
    ['garde introuvable (404)', `/gardes/g1?notification=${NOTIFICATION}`, { coverage: json(404, { error: { code: 'NOT_FOUND', message: 'Introuvable' } }) }],
    ['demande refusée (403)', `/demandes/r1?notification=${NOTIFICATION}`, { request: json(403, { error: { code: 'FORBIDDEN', message: 'Refusé' } }) }],
  ])('%s : rien n’est marqué lu', async (_label, path, options) => {
    const { reads } = setup(path, options);
    await screen.findByRole('alert').catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(reads).toEqual([]);
  });

  it('sans paramètre : rien n’est marqué lu', async () => {
    const { reads } = setup('/gardes/g1');
    expect((await screen.findAllByText(/1ère année Violet/))[0]).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(reads).toEqual([]);
  });

  it('session expirée (US1-3) : connexion d’abord, puis lecture seulement après l’ouverture de la garde', async () => {
    const { reads, router } = setup(`/gardes/g1?notification=${NOTIFICATION}`, { expired: true });

    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/connexion');
    expect((router.state.location.state as { from?: string }).from).toBe(`/gardes/g1?notification=${NOTIFICATION}`);
    expect(reads).toEqual([]);

    await userEvent.type(screen.getByLabelText('Identifiant'), 'surveillant');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'Mot-de-passe-2026');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect((await screen.findAllByText(/1ère année Violet/))[0]).toBeVisible();
    await waitFor(() => expect(reads).toEqual([{ ids: [NOTIFICATION] }]));
  });
});
