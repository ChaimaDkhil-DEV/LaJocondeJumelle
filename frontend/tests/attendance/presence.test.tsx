import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/Toast';
import { PresentTeachersTab } from '../../src/features/attendance/PresentTeachersTab';
import { QrEntryPage } from '../../src/features/attendance/QrEntryPage';
import type { AttendanceItem, OwnPresence, PresentList } from '../../src/features/attendance/types';
import { CoveragePage } from '../../src/features/coverage/CoveragePage';
import { SocketProvider, type SocketLike } from '../../src/features/notifications/SocketProvider';

/**
 * Enseignants présents dans l'établissement (019, écrans) : le départ et le retour passent par un second
 * scan du QR ; l'administration voit une ligne par enseignant, mise à jour en direct, et peut saisir un
 * départ ou un retour.
 */

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const TOKEN = 'c1.0a1b2c3d-1111-4222-8333-444455556666.1.c2lnbmF0dXJl';
const VIOLET = { id: 'k1', name: '1ère année Violet', room: 'Salle 12' };
const BLEU = { id: 'k2', name: '2e année Bleu', room: null };
const ENS = { id: 't1', displayName: 'Amel Enseignante' };
const AUTRE = { id: 't2', displayName: 'Bilel Professeur' };
const TEACHER_PROFILE = { availability: 'AVAILABLE', activeGuards: [], isTeacher: true, isSupervisor: false, canManage: false };
const ADMIN_PROFILE = { availability: 'AVAILABLE', activeGuards: [], isTeacher: false, isSupervisor: false, canManage: true };

const attendance = (): AttendanceItem => ({
  id: 'p1',
  date: '2026-11-17',
  method: 'QR',
  status: 'ARRIVED',
  arrivedAt: '2026-11-17T08:12:00.000Z',
  recordedAt: '2026-11-17T08:12:00.000Z',
  comment: null,
  class: VIOLET,
  teacher: ENS,
  recordedBy: ENS,
  requestId: null,
  announcedType: null,
  announcedLateMinutes: null,
  substituteFor: null,
  anomaly: false,
});

const PRESENT: OwnPresence = { state: 'PRESENT', firstArrivalAt: '2026-11-17T08:12:00.000Z', departedAt: null };
const DEPARTED: OwnPresence = { state: 'DEPARTED', firstArrivalAt: '2026-11-17T08:12:00.000Z', departedAt: '2026-11-17T12:10:00.000Z' };

function mount(ui: ReactNode, path: string, handler: (call: Call) => Response | undefined, socket?: SocketLike) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call: Call = { url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined };
      calls.push(call);
      return handler(call) ?? json(200, []);
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = <ToastProvider>{ui}</ToastProvider>;
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{socket ? <SocketProvider createSocket={() => socket}>{tree}</SocketProvider> : tree}</MemoryRouter>
    </QueryClientProvider>,
  );
  return calls;
}

const posts = (calls: Call[], url: string) => calls.filter((c) => c.url === url && c.method === 'POST');

afterEach(() => vi.unstubAllGlobals());

describe('Page du QR : départ et retour de l’enseignant', () => {
  const routes = (
    <Routes>
      <Route path="/gardes/presence" element={<QrEntryPage />} />
    </Routes>
  );

  function server(options: { existing?: boolean; presence: OwnPresence; depart?: Response }) {
    return (call: Call) => {
      if (call.url === '/api/coverage/availability') return json(200, TEACHER_PROFILE);
      if (call.url === '/api/attendance/resolve') {
        return json(200, { class: VIOLET, attendance: options.existing ? attendance() : null, preview: { kind: 'NONE' }, presence: options.presence });
      }
      if (call.url === '/api/attendance/depart') return options.depart ?? json(201, { created: true, presence: DEPARTED });
      if (call.url === '/api/attendance/return') return json(200, { created: true, presence: PRESENT });
      return undefined;
    };
  }

  it('déjà arrivé dans cette classe : le second scan propose le départ et n’envoie que le jeton', async () => {
    const user = userEvent.setup();
    const calls = mount(routes, `/gardes/presence?c=${TOKEN}`, server({ existing: true, presence: PRESENT }));
    const button = await screen.findByRole('button', { name: 'Enregistrer mon départ' });
    expect(screen.getByRole('heading', { level: 1, name: 'Ma présence dans l’établissement' })).toBeInTheDocument();
    expect(screen.getByText('Votre arrivée était déjà enregistrée pour aujourd’hui.')).toBeInTheDocument();
    expect(posts(calls, '/api/attendance/depart')).toHaveLength(0);

    await user.click(button);
    expect(await screen.findByText('Votre départ est enregistré.')).toBeInTheDocument();
    expect(posts(calls, '/api/attendance/depart')[0].body).toEqual({ token: TOKEN });
    expect(screen.queryByRole('button', { name: 'Enregistrer mon départ' })).not.toBeInTheDocument();
  });

  it('présent, QR d’une autre classe : arrivée dans cette classe ou départ, au choix', async () => {
    mount(routes, `/gardes/presence?c=${TOKEN}`, server({ presence: PRESENT }));
    expect(await screen.findByRole('button', { name: 'Enregistrer mon arrivée' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer mon départ' })).toBeInTheDocument();
  });

  it('pas encore arrivé : aucun départ proposé', async () => {
    mount(routes, `/gardes/presence?c=${TOKEN}`, server({ presence: { state: 'NOT_ARRIVED', firstArrivalAt: null, departedAt: null } }));
    expect(await screen.findByRole('button', { name: 'Enregistrer mon arrivée' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer mon départ' })).not.toBeInTheDocument();
  });

  it('parti, même classe : le scan propose le retour', async () => {
    const user = userEvent.setup();
    const calls = mount(routes, `/gardes/presence?c=${TOKEN}`, server({ existing: true, presence: DEPARTED }));
    expect(await screen.findByText(/Votre départ est enregistré depuis/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer mon départ' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enregistrer mon retour' }));
    expect(await screen.findByText('Votre retour est enregistré.')).toBeInTheDocument();
    expect(posts(calls, '/api/attendance/return')[0].body).toEqual({ token: TOKEN });
  });

  it('parti, autre classe : l’arrivée dans cette classe vaut retour', async () => {
    mount(routes, `/gardes/presence?c=${TOKEN}`, server({ presence: DEPARTED }));
    expect(await screen.findByRole('button', { name: 'Enregistrer mon arrivée' })).toBeInTheDocument();
    expect(screen.getByText(/vaudra retour/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer mon retour' })).not.toBeInTheDocument();
  });

  it('départ refusé par le serveur : erreur annoncée, nouvelle tentative possible', async () => {
    const user = userEvent.setup();
    const refused = json(409, { error: { code: 'ATTENDANCE_NOT_PRESENT', message: 'Aucune arrivée n’est enregistrée aujourd’hui pour cet enseignant.' } });
    mount(routes, `/gardes/presence?c=${TOKEN}`, server({ existing: true, presence: PRESENT, depart: refused }));
    await user.click(await screen.findByRole('button', { name: 'Enregistrer mon départ' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Aucune arrivée n’est enregistrée');
    expect(screen.getByRole('button', { name: 'Enregistrer mon départ' })).toBeEnabled();
  });
});

describe('Onglet « Enseignants présents » (administration)', () => {
  const list = (overrides: Partial<PresentList> = {}): PresentList => ({
    date: '2026-11-17',
    present: [
      { teacher: ENS, firstArrivalAt: '2026-11-17T08:12:00.000Z', lastClass: BLEU, lastSeenAt: '2026-11-17T10:05:00.000Z' },
      { teacher: AUTRE, firstArrivalAt: null, lastClass: VIOLET, lastSeenAt: '2026-11-17T09:00:00.000Z' },
    ],
    departed: [],
    ...overrides,
  });
  const departedRow = {
    teacher: AUTRE,
    firstArrivalAt: '2026-11-17T08:00:00.000Z',
    lastClass: VIOLET,
    lastSeenAt: '2026-11-17T08:00:00.000Z',
    departure: { id: 'd1', departedAt: '2026-11-17T12:10:00.000Z', method: 'QR' as const, class: VIOLET, recordedBy: AUTRE, comment: null },
  };

  function server(data: () => PresentList, extra: (call: Call) => Response | undefined = () => undefined) {
    return (call: Call) => extra(call) ?? (call.url === '/api/attendance/present' ? json(200, data()) : undefined);
  }

  it('une ligne par enseignant présent, avec le nombre, l’heure d’arrivée et la dernière classe', async () => {
    mount(<PresentTeachersTab />, '/', server(() => list()));
    const present = await screen.findByRole('list', { name: 'Enseignants présents' });
    const items = within(present).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText(ENS.displayName)).toBeInTheDocument();
    expect(within(items[0]).getByText(/Arrivée à \d{2}:\d{2}/)).toBeInTheDocument();
    expect(within(items[0]).getByText(new RegExp(BLEU.name))).toBeInTheDocument();
    // Saisie de l'administration sans heure : l'heure n'est pas inventée.
    expect(within(items[1]).getByText(/Heure d’arrivée non précisée/)).toBeInTheDocument();
    expect(screen.getByText('2 présents')).toBeInTheDocument();
    expect(screen.getByText(/reste affiché présent jusqu’à la fin de la journée/)).toBeInTheDocument();
  });

  it('personne n’a scanné : état vide, qui ne parle pas d’absence', async () => {
    mount(<PresentTeachersTab />, '/', server(() => list({ present: [] })));
    expect(await screen.findByText('Aucun enseignant présent pour le moment')).toBeInTheDocument();
    expect(screen.getByText('0 présent')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Repartis aujourd’hui' })).not.toBeInTheDocument();
  });

  it('les enseignants repartis sont listés à part, avec l’heure et le mode du départ', async () => {
    mount(<PresentTeachersTab />, '/', server(() => list({ present: [list().present[0]], departed: [departedRow] })));
    const departed = await screen.findByRole('list', { name: 'Repartis aujourd’hui' });
    expect(within(departed).getByText(AUTRE.displayName)).toBeInTheDocument();
    expect(within(departed).getByText(/Parti à \d{2}:\d{2}/)).toBeInTheDocument();
    expect(within(departed).getByText(/Scan du QR code/)).toBeInTheDocument();
    expect(screen.getByText('1 reparti')).toBeInTheDocument();
  });

  it('saisit le départ d’un enseignant parti sans scanner : heure et commentaire facultatifs', async () => {
    const user = userEvent.setup();
    const calls = mount(
      <PresentTeachersTab />,
      '/',
      server(() => list(), (call) => (call.url === '/api/attendance/departures' ? json(201, departedRow.departure) : undefined)),
    );
    const present = await screen.findByRole('list', { name: 'Enseignants présents' });
    await user.click(within(within(present).getAllByRole('listitem')[0]).getByRole('button', { name: 'Enregistrer un départ' }));
    const dialog = await screen.findByRole('dialog', { name: 'Enregistrer un départ' });
    expect(within(dialog).getByText(new RegExp(ENS.displayName))).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^Commentaire/), 'Parti sans scanner');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(posts(calls, '/api/attendance/departures')).toHaveLength(1));
    expect(posts(calls, '/api/attendance/departures')[0].body).toEqual({ teacherId: ENS.id, comment: 'Parti sans scanner' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('départ refusé par le serveur : le message s’affiche dans le dialogue, qui reste ouvert', async () => {
    const user = userEvent.setup();
    const refused = json(409, { error: { code: 'DEPARTURE_EXISTS', message: 'Le départ de cet enseignant est déjà enregistré.' } });
    mount(<PresentTeachersTab />, '/', server(() => list(), (call) => (call.url === '/api/attendance/departures' ? refused : undefined)));
    const present = await screen.findByRole('list', { name: 'Enseignants présents' });
    await user.click(within(present).getAllByRole('button', { name: 'Enregistrer un départ' })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('déjà enregistré');
  });

  it('marque de retour un enseignant noté parti', async () => {
    const user = userEvent.setup();
    const calls = mount(
      <PresentTeachersTab />,
      '/',
      server(() => list({ departed: [departedRow] }), (call) =>
        call.url === '/api/attendance/departures/d1/return' ? json(200, { id: 'd1', returnedAt: '2026-11-17T13:00:00.000Z' }) : undefined,
      ),
    );
    const departed = await screen.findByRole('list', { name: 'Repartis aujourd’hui' });
    await user.click(within(departed).getByRole('button', { name: 'Marquer de retour' }));
    await waitFor(() => expect(posts(calls, '/api/attendance/departures/d1/return')).toHaveLength(1));
  });

  it('chargement impossible : erreur avec « Réessayer »', async () => {
    const user = userEvent.setup();
    let fail = true;
    const calls = mount(<PresentTeachersTab />, '/', (call) =>
      call.url === '/api/attendance/present' ? (fail ? json(500, { error: { code: 'INTERNAL', message: 'Erreur.' } }) : json(200, list())) : undefined,
    );
    expect(await screen.findByText('Impossible de charger les enseignants présents.')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('list', { name: 'Enseignants présents' })).toBeInTheDocument();
    expect(calls.filter((c) => c.url === '/api/attendance/present').length).toBeGreaterThanOrEqual(2);
  });

  it('se met à jour en direct : un scan signalé par le serveur relit la liste', async () => {
    class FakeSocket implements SocketLike {
      private handlers = new Map<string, Array<(...args: never[]) => void>>();
      on(event: string, handler: (...args: never[]) => void): this {
        this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
        return this;
      }
      disconnect(): this {
        return this;
      }
      emit(event: string, payload?: unknown): void {
        for (const handler of this.handlers.get(event) ?? []) (handler as (p?: unknown) => void)(payload);
      }
    }
    const socket = new FakeSocket();
    let current = list({ present: [list().present[0]] });
    mount(<PresentTeachersTab />, '/', server(() => current), socket);
    expect(await screen.findByText('1 présent')).toBeInTheDocument();

    current = list();
    act(() => socket.emit('attendance:updated', { teacherId: AUTRE.id, date: '2026-11-17' }));
    expect(await screen.findByText('2 présents')).toBeInTheDocument();
    expect(screen.getByText(AUTRE.displayName)).toBeInTheDocument();
  });
});

describe('Surveillance : onglet de l’administration', () => {
  it('l’administration a l’onglet « Enseignants présents »', async () => {
    const user = userEvent.setup();
    const handler = (call: Call) => {
      if (call.url === '/api/coverage/availability') return json(200, ADMIN_PROFILE);
      if (call.url === '/api/attendance/present') return json(200, { date: '2026-11-17', present: [], departed: [] });
      if (call.url.startsWith('/api/attendance/day')) return json(200, { date: '2026-11-17', attendances: [], announced: [], emptyClasses: [], classStates: [] });
      return undefined;
    };
    mount(<Routes><Route path="/gardes" element={<CoveragePage />} /></Routes>, '/gardes', handler);
    await user.click(await screen.findByRole('tab', { name: 'Enseignants présents' }));
    expect(await screen.findByText('Aucun enseignant présent pour le moment')).toBeInTheDocument();
  });

  it('un enseignant n’a pas cet onglet', async () => {
    mount(<Routes><Route path="/gardes" element={<CoveragePage />} /></Routes>, '/gardes', (call) =>
      call.url === '/api/coverage/availability' ? json(200, TEACHER_PROFILE) : undefined,
    );
    expect(await screen.findByRole('tab', { name: 'Mes présences' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Enseignants présents' })).not.toBeInTheDocument();
  });
});
