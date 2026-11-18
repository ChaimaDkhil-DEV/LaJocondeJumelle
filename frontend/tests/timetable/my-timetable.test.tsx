import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/Toast';
import { QrEntryPage } from '../../src/features/attendance/QrEntryPage';
import { TeacherHomePage } from '../../src/features/home/TeacherHomePage';
import { MyTimetablePage } from '../../src/features/timetable/MyTimetablePage';
import type { TimetableSession } from '../../src/features/timetable/types';

/**
 * Mon emploi du temps (020, US4, écrans) : vues journalière et hebdomadaire de ses seules séances, navigation, lien
 * depuis l'accueil ; la page du QR rappelle la séance en cours ou la prochaine.
 */

type Call = { url: string; method: string };
const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const ENS = { id: 't1', displayName: 'Amel Enseignante' };
const VIOLET = { id: 'k1', name: '1ère année Violet', room: 'Salle 12' };
const session = (over: Partial<TimetableSession> = {}): TimetableSession => ({
  id: 's1',
  seriesId: null,
  detached: false,
  teacher: ENS,
  class: VIOLET,
  level: { id: 'l1', name: '1re année' },
  date: '2026-11-18',
  weekday: 3,
  startAt: '2026-11-18T07:00:00.000Z',
  endAt: '2026-11-18T08:00:00.000Z',
  startTime: '08:00',
  endTime: '09:00',
  subject: 'Mathématiques',
  room: 'Salle 12',
  status: 'SCHEDULED',
  replaces: null,
  announcedAbsence: false,
  ...over,
});

function mount(ui: ReactNode, path: string, handler: (call: Call) => Response | undefined) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call = { url, method: init.method ?? 'GET' };
      calls.push(call);
      return handler(call) ?? json(200, {});
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="*" element={ui} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return calls;
}

const mineCalls = (calls: Call[]) => calls.filter((c) => c.url.startsWith('/api/timetable/mine'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-18T09:00:00.000Z') });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Mon emploi du temps', () => {
  it('vue de la semaine par défaut : les sept jours, ses séances avec classe, niveau, matière et salle', async () => {
    const calls = mount(<MyTimetablePage />, '/emploi-du-temps', (c) =>
      c.url.startsWith('/api/timetable/mine')
        ? json(200, {
            from: '2026-11-16',
            to: '2026-11-22',
            sessions: [
              session(),
              session({ id: 's2', date: '2026-11-19', startAt: '2026-11-19T09:00:00.000Z', startTime: '10:00', endTime: '11:00', status: 'CANCELLED' }),
              session({ id: 's3', date: '2026-11-20', startAt: '2026-11-20T13:00:00.000Z', startTime: '14:00', endTime: '15:00', replaces: { displayName: 'Bilel Professeur' } }),
            ],
          })
        : undefined,
    );
    expect(await screen.findByRole('heading', { name: 'Mon emploi du temps' })).toBeInTheDocument();
    await waitFor(() => expect(mineCalls(calls)[0]?.url).toBe('/api/timetable/mine?from=2026-11-16&to=2026-11-22'));
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(7);
    const first = await screen.findByRole('listitem', { name: 'Séance de 08:00 à 09:00, 1ère année Violet' });
    expect(within(first).getByText(/1ère année Violet \(1re année\)/)).toBeInTheDocument();
    expect(within(first).getByText(/Mathématiques · Salle : Salle 12/)).toBeInTheDocument();
    expect(screen.getByText('Séance annulée')).toBeInTheDocument();
    expect(screen.getByText('Remplacement de Bilel Professeur')).toBeInTheDocument();
    expect(screen.queryByText(/Motif/)).toBeNull();
  });

  it('vue du jour, et passage au jour suivant', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = mount(<MyTimetablePage />, '/emploi-du-temps?vue=jour', (c) =>
      c.url.startsWith('/api/timetable/mine') ? json(200, { from: '', to: '', sessions: c.url.includes('2026-11-18') ? [session()] : [] }) : undefined,
    );
    await waitFor(() => expect(mineCalls(calls)[0]?.url).toBe('/api/timetable/mine?from=2026-11-18&to=2026-11-18'));
    expect(await screen.findByRole('listitem', { name: /Séance de 08:00/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Jour suivant' }));
    await waitFor(() => expect(mineCalls(calls).at(-1)!.url).toBe('/api/timetable/mine?from=2026-11-19&to=2026-11-19'));
    expect(await screen.findByText('Aucune séance ce jour-là.')).toBeInTheDocument();
  });

  it('passage de la semaine au jour', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = mount(<MyTimetablePage />, '/emploi-du-temps', (c) => (c.url.startsWith('/api/timetable/mine') ? json(200, { from: '', to: '', sessions: [] }) : undefined));
    await screen.findByRole('heading', { name: 'Mon emploi du temps' });
    await user.click(screen.getByRole('button', { name: 'Jour' }));
    await waitFor(() => expect(mineCalls(calls).at(-1)!.url).toBe('/api/timetable/mine?from=2026-11-18&to=2026-11-18'));
  });

  it('compte hors du groupe Enseignants : message d’erreur, rien d’autre', async () => {
    mount(<MyTimetablePage />, '/emploi-du-temps', (c) =>
      c.url.startsWith('/api/timetable/mine') ? json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } }) : undefined,
    );
    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('l’accueil de l’enseignant mène à son emploi du temps', async () => {
    mount(<TeacherHomePage />, '/', (c) => (c.url === '/api/requests/tracking' ? json(200, { pending: 0, done: 0, archived: 0 }) : undefined));
    expect(await screen.findByRole('link', { name: /Mon emploi du temps/ })).toHaveAttribute('href', '/emploi-du-temps');
  });

  it('page du QR : la séance en cours et la prochaine sont rappelées', async () => {
    const TOKEN = 'c1.0a1b2c3d-1111-4222-8333-444455556666.1.c2lnbmF0dXJl';
    mount(<QrEntryPage />, `/gardes/presence?c=${TOKEN}`, (c) => {
      if (c.url === '/api/coverage/availability') return json(200, { availability: 'AVAILABLE', activeGuards: [], isTeacher: true, isSupervisor: false, canManage: false });
      if (c.url === '/api/attendance/resolve') {
        return json(200, {
          class: VIOLET,
          attendance: null,
          preview: { kind: 'NONE' },
          presence: { state: 'NOT_ARRIVED', firstArrivalAt: null, departedAt: null },
          session: { current: session(), next: session({ id: 's9', startTime: '10:00', endTime: '11:00', subject: null }) },
        });
      }
      return undefined;
    });
    expect(await screen.findByText('Séance en cours : 08:00 – 09:00, 1ère année Violet, Mathématiques')).toBeInTheDocument();
    expect(screen.getByText('Prochaine séance : 10:00 – 11:00, 1ère année Violet')).toBeInTheDocument();
  });
});
