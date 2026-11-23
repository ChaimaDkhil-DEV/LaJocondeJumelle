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
  /** Séances de la semaine du 16 au 22 novembre 2026 : une tenue (mercredi), une annulée (jeudi), un remplacement (vendredi). */
  const WEEK = [
    session(),
    session({ id: 's2', date: '2026-11-19', weekday: 4, startAt: '2026-11-19T09:00:00.000Z', endAt: '2026-11-19T10:00:00.000Z', startTime: '10:00', endTime: '11:00', status: 'CANCELLED' }),
    session({ id: 's3', date: '2026-11-20', weekday: 5, startAt: '2026-11-20T13:00:00.000Z', endAt: '2026-11-20T14:00:00.000Z', startTime: '14:00', endTime: '15:00', replaces: { displayName: 'Bilel Professeur' } }),
  ];
  const withWeek =
    (sessions: TimetableSession[] = WEEK) =>
    (c: Call) =>
      c.url.startsWith('/api/timetable/mine') ? json(200, { from: '2026-11-16', to: '2026-11-22', sessions }) : undefined;
  const tile = (label: string) => (screen.getByText(label, { selector: 'div' }).closest('.MuiPaper-root') as HTMLElement);

  it('vue de la semaine par défaut : quatre tuiles, la grille des séances détaillées, les panneaux latéraux', async () => {
    const calls = mount(<MyTimetablePage />, '/emploi-du-temps', withWeek());
    expect(await screen.findByRole('heading', { name: 'Mon emploi du temps' })).toBeInTheDocument();
    await waitFor(() => expect(mineCalls(calls)[0]?.url).toBe('/api/timetable/mine?from=2026-11-16&to=2026-11-22'));

    // Tuiles : les séances tenues seulement (l'annulée ne compte pas), deux heures, une classe, une matière.
    const tiles = await screen.findByRole('region', { name: 'Chiffres de la semaine' });
    expect(tiles).toBeInTheDocument();
    const value = (label: string) => within(tile(label)).getByRole('paragraph').textContent;
    expect(value('Séances cette semaine')).toBe('2');
    expect(value('Classes')).toBe('1');
    expect(value('Heures / semaine')).toBe('2 h');
    expect(value('Matières')).toBe('1');

    // Grille : séance nommée avec sa matière ; l'annulée reste visible, dite « Annulée ».
    const grid = screen.getByRole('group', { name: 'Séances de la semaine' });
    const held = within(grid).getByRole('group', { name: 'Séance de 08:00 à 09:00, Mathématiques, 1ère année Violet' });
    expect(within(held).getByText('Salle 12')).toBeInTheDocument();
    expect(within(grid).getByRole('group', { name: 'Séance annulée de 10:00 à 11:00, Mathématiques, 1ère année Violet' })).toHaveTextContent('Annulée');
    // La colonne d'aujourd'hui (mercredi 18) est repérée.
    expect(grid.querySelector('[data-today="2026-11-18"]')).not.toBeNull();

    // Panneaux : la prochaine séance (celle du vendredi : la tenue de mercredi est passée, l'annulée ne compte pas).
    const next = screen.getByRole('region', { name: 'Prochaine séance' });
    expect(next).toHaveTextContent('Vendredi 20 novembre');
    expect(next).toHaveTextContent('14:00 – 15:00');
    expect(next).toHaveTextContent('Mathématiques');
    expect(next).toHaveTextContent('1ère année Violet');
    expect(next).toHaveTextContent('Salle 12');
    expect(within(next).queryByText('En cours')).toBeNull();
    // … et les matières de la semaine avec leurs heures.
    const subjects = screen.getByRole('region', { name: 'Matières de la semaine' });
    expect(subjects).toHaveTextContent('Mathématiques');
    expect(subjects).toHaveTextContent('2 h');
  });

  it('week-end sans séance : colonnes masquées et dites en une phrase ; avec une séance, les sept jours', async () => {
    mount(<MyTimetablePage />, '/emploi-du-temps', withWeek());
    const grid = await screen.findByRole('group', { name: 'Séances de la semaine' });
    expect(screen.getByText('Samedi 21 et dimanche 22 novembre : aucune séance.')).toBeVisible();
    expect(within(grid).queryByText('sam')).toBeNull();
    expect(within(grid).queryByText('dim')).toBeNull();
    expect(within(grid).getByText('ven')).toBeInTheDocument();
  });

  it('une séance le samedi garde le week-end affiché, sans phrase', async () => {
    mount(
      <MyTimetablePage />,
      '/emploi-du-temps',
      withWeek([session({ id: 'sa', date: '2026-11-21', weekday: 6, startAt: '2026-11-21T07:00:00.000Z', endAt: '2026-11-21T08:00:00.000Z' })]),
    );
    const grid = await screen.findByRole('group', { name: 'Séances de la semaine' });
    expect(within(grid).getByText('sam')).toBeInTheDocument();
    expect(within(grid).getByText('dim')).toBeInTheDocument();
    expect(screen.queryByText(/aucune séance\.$/)).toBeNull();
  });

  it('la séance en cours est la prochaine séance, dite « En cours »', async () => {
    vi.setSystemTime(new Date('2026-11-18T07:30:00.000Z'));
    mount(<MyTimetablePage />, '/emploi-du-temps', withWeek());
    const next = await screen.findByRole('region', { name: 'Prochaine séance' });
    expect(next).toHaveTextContent('Mercredi 18 novembre');
    expect(within(next).getByText('En cours')).toBeVisible();
  });

  it('semaine vide : un message à la place de la grille, des zéros, et rien à venir', async () => {
    mount(<MyTimetablePage />, '/emploi-du-temps', withWeek([]));
    expect(await screen.findByText('Aucune séance cette semaine.')).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Séances de la semaine' })).toBeNull();
    expect(within(tile('Séances cette semaine')).getByRole('paragraph')).toHaveTextContent('0');
    expect(screen.getByRole('region', { name: 'Prochaine séance' })).toHaveTextContent('Aucune séance à venir cette semaine.');
    expect(screen.queryByRole('region', { name: 'Matières de la semaine' })).toBeNull();
  });

  it('trois affichages : Jour, Semaine, Liste ; la liste montre classe, niveau, matière, salle et remplacement', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mount(<MyTimetablePage />, '/emploi-du-temps', withWeek());
    await screen.findByRole('group', { name: 'Séances de la semaine' });
    const views = screen.getByRole('group', { name: 'Affichage' });
    expect(within(views).getAllByRole('button').map((b) => b.textContent)).toEqual(['Jour', 'Semaine', 'Liste']);
    expect(within(views).getByRole('button', { name: 'Semaine' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(views).getByRole('button', { name: 'Liste' }));
    // Liste : seuls les jours avec séance, comme avant la refonte.
    expect(await screen.findAllByRole('heading', { level: 3 })).toHaveLength(3);
    const first = await screen.findByRole('listitem', { name: 'Séance de 08:00 à 09:00, 1ère année Violet' });
    expect(within(first).getByText(/1ère année Violet \(1re année\)/)).toBeInTheDocument();
    expect(within(first).getByText(/Mathématiques · Salle : Salle 12/)).toBeInTheDocument();
    expect(screen.getByText('Séance annulée')).toBeInTheDocument();
    expect(screen.getByText('Remplacement de Bilel Professeur')).toBeInTheDocument();
    expect(screen.queryByText(/Motif/)).toBeNull();
    expect(screen.queryByRole('group', { name: 'Séances de la semaine' })).toBeNull();
    // Les tuiles de la semaine restent au-dessus de la liste.
    expect(screen.getByRole('region', { name: 'Chiffres de la semaine' })).toBeInTheDocument();
  });

  it('semaine précédente et suivante : flèches nommées, la semaine est écrite et demandée au serveur', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = mount(<MyTimetablePage />, '/emploi-du-temps', withWeek());
    expect(await screen.findByText('Semaine du 16 novembre 2026')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aujourd’hui' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Semaine suivante' }));
    await waitFor(() => expect(mineCalls(calls).at(-1)!.url).toBe('/api/timetable/mine?from=2026-11-23&to=2026-11-29'));
    expect(await screen.findByText('Semaine du 23 novembre 2026')).toBeVisible();
    // Hors de la semaine en cours : retour d'un clic, et plus de colonne du jour.
    await user.click(await screen.findByRole('button', { name: 'Aujourd’hui' }));
    await waitFor(() => expect(mineCalls(calls).at(-1)!.url).toBe('/api/timetable/mine?from=2026-11-16&to=2026-11-22'));
    await user.click(screen.getByRole('button', { name: 'Semaine précédente' }));
    await waitFor(() => expect(mineCalls(calls).at(-1)!.url).toBe('/api/timetable/mine?from=2026-11-09&to=2026-11-15'));
  });

  it('la vue du jour n’affiche ni tuiles ni panneaux de la semaine', async () => {
    mount(<MyTimetablePage />, '/emploi-du-temps?vue=jour', (c) => (c.url.startsWith('/api/timetable/mine') ? json(200, { from: '', to: '', sessions: [session()] }) : undefined));
    expect(await screen.findByRole('listitem', { name: /Séance de 08:00/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Chiffres de la semaine' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Matières de la semaine' })).toBeNull();
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

  it('l’accueil de l’enseignant n’a plus de lien vers l’emploi du temps : il est dans le menu', async () => {
    mount(<TeacherHomePage />, '/', (c) => (c.url === '/api/requests/tracking' ? json(200, { pending: 0, done: 0, archived: 0 }) : undefined));
    expect(await screen.findByRole('heading', { name: 'Suivi de mes demandes' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Mon emploi du temps/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mon emploi du temps/ })).toBeNull();
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
