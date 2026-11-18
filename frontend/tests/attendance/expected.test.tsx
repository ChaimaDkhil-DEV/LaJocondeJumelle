import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/Toast';
import { ExpectedTeachersTab } from '../../src/features/attendance/ExpectedTeachersTab';
import type { ExpectedDay, ExpectedLine } from '../../src/features/attendance/types';
import { SocketProvider, type SocketLike } from '../../src/features/notifications/SocketProvider';

/**
 * Enseignants attendus (020, US3 et US5, écran) : une ligne par séance et enseignant attendu, statut écrit en toutes
 * lettres, quatre indicateurs, filtres gardés dans l'adresse, mise à jour en direct et chaque minute.
 */

type Call = { url: string; method: string };

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const ENS = { id: 't1', displayName: 'Amel Enseignante' };
const AUTRE = { id: 't2', displayName: 'Bilel Professeur' };
const VIOLET = { id: 'k1', name: '1ère année Violet', room: 'Salle 12' };

const line = (over: Partial<ExpectedLine> = {}): ExpectedLine => ({
  sessionId: 's1',
  role: 'TEACHER',
  teacher: ENS,
  replaces: null,
  replacedBy: null,
  class: VIOLET,
  level: { id: 'l1', name: '1re année' },
  subject: 'Mathématiques',
  room: 'Salle 12',
  date: '2026-11-18',
  startAt: '2026-11-18T07:00:00.000Z',
  endAt: '2026-11-18T08:00:00.000Z',
  startTime: '08:00',
  endTime: '09:00',
  status: 'NOT_ARRIVED',
  arrivedAt: null,
  lateMinutes: null,
  lateReason: null,
  requestId: null,
  cancelReason: null,
  ...over,
});

const day = (lines: ExpectedLine[], counts = { expected: 3, present: 1, late: 1, notArrived: 1 }): ExpectedDay => ({
  date: '2026-11-18',
  serverNow: '2026-11-18T08:30:00.000Z',
  settings: { lateThresholdMinutes: 5, toleranceMinutes: 10 },
  counts,
  lines,
});

const LINES = [
  line(),
  line({ sessionId: 's2', teacher: AUTRE, status: 'LATE', arrivedAt: '2026-11-18T07:12:00.000Z', lateMinutes: 12, lateReason: 'ARRIVAL' }),
  line({ sessionId: 's3', status: 'LATE', lateReason: 'EMPTY_CLASS', startTime: '10:00', endTime: '11:00' }),
  line({ sessionId: 's4', status: 'CANCELLED', cancelReason: 'Sortie scolaire', startTime: '14:00', endTime: '15:00' }),
  line({ sessionId: 's5', role: 'TITULAR', status: 'EXCUSED', replacedBy: AUTRE, startTime: '15:00', endTime: '16:00' }),
  line({ sessionId: 's5', role: 'SUBSTITUTE', teacher: AUTRE, replaces: ENS, status: 'EXPECTED', startTime: '15:00', endTime: '16:00' }),
];

function Where() {
  return <output data-testid="where">{useLocation().search}</output>;
}

function mount(path: string, handler: (call: Call) => Response | undefined, socket?: SocketLike, ui: ReactNode = <ExpectedTeachersTab />) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call: Call = { url, method: init.method ?? 'GET' };
      calls.push(call);
      const custom = handler(call);
      if (custom) return custom;
      if (url === '/api/admin/teacher-classes') return json(200, [{ teacher: ENS, classIds: [] }, { teacher: AUTRE, classIds: [] }]);
      if (url === '/api/admin/coverage/classes') return json(200, [{ ...VIOLET, active: true, qrVersion: 1, updatedAt: '', floor: null, level: null }]);
      return json(200, []);
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (
    <ToastProvider>
      <Routes>
        <Route
          path="*"
          element={
            <>
              {ui}
              <Where />
            </>
          }
        />
      </Routes>
    </ToastProvider>
  );
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{socket ? <SocketProvider createSocket={() => socket}>{tree}</SocketProvider> : tree}</MemoryRouter>
    </QueryClientProvider>,
  );
  return calls;
}

const expectedCalls = (calls: Call[]) => calls.filter((c) => c.url.startsWith('/api/attendance/expected'));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Onglet « Enseignants attendus »', () => {
  it('une ligne par séance : enseignant, classe et niveau, horaires, statut en toutes lettres', async () => {
    mount('/gardes?onglet=attendus', (c) => (c.url.startsWith('/api/attendance/expected') ? json(200, day(LINES)) : undefined));
    const list = await screen.findByRole('list', { name: 'Séances du jour' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(6);
    expect(within(rows[0]).getByRole('heading', { name: 'Amel Enseignante' })).toBeInTheDocument();
    expect(within(rows[0]).getByText(/08:00 – 09:00 · 1ère année Violet \(1re année\)/)).toBeInTheDocument();
    expect(within(rows[0]).getByText('Non arrivé')).toBeInTheDocument();
    expect(within(rows[0]).getByTestId('status-icon-NOT_ARRIVED')).toBeInTheDocument();
    expect(within(rows[1]).getByText('En retard')).toBeInTheDocument();
    expect(within(rows[1]).getByText(/Arrivée à .* · 12 min de retard/)).toBeInTheDocument();
    expect(within(rows[2]).getByText('Classe déclarée vide par un surveillant')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Séance annulée')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Motif : Sortie scolaire')).toBeInTheDocument();
    expect(within(rows[4]).getByText('Absence justifiée')).toBeInTheDocument();
    expect(within(rows[4]).getByText('Remplacé(e) par Bilel Professeur')).toBeInTheDocument();
    expect(within(rows[5]).getByText('Remplace Amel Enseignante')).toBeInTheDocument();
    expect(within(rows[5]).getByText('Attendu')).toBeInTheDocument();
    expect(screen.getByText(/Tolérance : 10 min ; retard au-delà de 5 min\./)).toBeInTheDocument();
  });

  it('quatre indicateurs, chacun avec son libellé', async () => {
    mount('/gardes?onglet=attendus', (c) => (c.url.startsWith('/api/attendance/expected') ? json(200, day(LINES, { expected: 7, present: 2, late: 3, notArrived: 1 })) : undefined));
    const kpis = await screen.findByRole('list', { name: 'Indicateurs du jour' });
    const items = within(kpis).getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringMatching(/Attendus.*7/),
      expect.stringMatching(/Présents.*2/),
      expect.stringMatching(/En retard.*3/),
      expect.stringMatching(/Non arrivés.*1/),
    ]);
  });

  it('filtres : enseignant et statut repris dans l’adresse et dans la requête, puis effacés', async () => {
    const user = userEvent.setup();
    const calls = mount('/gardes?onglet=attendus', (c) => (c.url.startsWith('/api/attendance/expected') ? json(200, day(LINES)) : undefined));
    await screen.findByRole('list', { name: 'Séances du jour' });
    await user.click(screen.getByRole('combobox', { name: 'Statut' }));
    await user.click(await screen.findByRole('option', { name: 'Non arrivé' }));
    await waitFor(() => expect(expectedCalls(calls).at(-1)!.url).toContain('status=NOT_ARRIVED'));
    expect(screen.getByTestId('where').textContent).toContain('statut=NOT_ARRIVED');
    expect(screen.getByTestId('where').textContent).toContain('onglet=attendus');

    await user.click(screen.getByRole('combobox', { name: 'Enseignant' }));
    await user.click(await screen.findByRole('option', { name: 'Bilel Professeur' }));
    await waitFor(() => expect(expectedCalls(calls).at(-1)!.url).toContain('teacherId=t2'));
    expect(screen.getByTestId('where').textContent).toContain('enseignant=t2');

    await user.click(screen.getByRole('button', { name: 'Effacer les filtres' }));
    await waitFor(() => expect(expectedCalls(calls).at(-1)!.url).toBe('/api/attendance/expected'));
    expect(screen.getByTestId('where').textContent).toBe('?onglet=attendus');
  });

  it('les filtres de l’adresse s’appliquent dès l’ouverture (lien partagé)', async () => {
    const calls = mount('/gardes?onglet=attendus&date=2026-11-16&classe=k1&statut=LATE', (c) =>
      c.url.startsWith('/api/attendance/expected') ? json(200, day([])) : undefined,
    );
    await waitFor(() => expect(expectedCalls(calls).length).toBeGreaterThan(0));
    expect(expectedCalls(calls)[0].url).toBe('/api/attendance/expected?date=2026-11-16&classId=k1&status=LATE');
    expect(await screen.findByText('Aucune séance ne correspond.')).toBeInTheDocument();
  });

  it('relit la liste à chaque événement de pointage ou d’emploi du temps, et chaque minute', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const handlers: Record<string, () => void> = {};
    const socket: SocketLike = {
      on: (event: string, fn: () => void) => {
        handlers[event] = fn;
        return socket;
      },
      off: () => socket,
      disconnect: () => undefined,
    } as unknown as SocketLike;
    const calls = mount('/gardes?onglet=attendus', (c) => (c.url.startsWith('/api/attendance/expected') ? json(200, day(LINES)) : undefined), socket);
    await screen.findByRole('list', { name: 'Séances du jour' });
    const before = expectedCalls(calls).length;
    act(() => handlers['attendance:updated']?.());
    await waitFor(() => expect(expectedCalls(calls).length).toBe(before + 1));
    act(() => handlers['timetable:updated']?.());
    await waitFor(() => expect(expectedCalls(calls).length).toBe(before + 2));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await waitFor(() => expect(expectedCalls(calls).length).toBeGreaterThanOrEqual(before + 3));
  });

  it('chargement puis erreur : message et bouton « Réessayer »', async () => {
    mount('/gardes?onglet=attendus', (c) =>
      c.url.startsWith('/api/attendance/expected') ? json(500, { error: { code: 'INTERNAL', message: 'Erreur' } }) : undefined,
    );
    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
