import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/Toast';
import { adminRoutes } from '../../src/features/admin/adminRoutes';
import type { TimetableSession } from '../../src/features/timetable/types';

/**
 * Emplois du temps (020, US1 et US2, écrans) : l'administration choisit un enseignant et une semaine, crée une série
 * (conflits listés, erreurs par champ), modifie une séance seule ou avec les suivantes, annule avec un motif.
 */

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const ADMIN = { id: 'a1', displayName: 'Admin', role: 'ADMIN', permissions: [], mustChangePassword: false };
const ENS = { id: 't1', displayName: 'Amel Enseignante' };
const AUTRE = { id: 't2', displayName: 'Bilel Professeur' };
const VIOLET = { id: 'k1', name: '1ère année Violet', room: 'Salle 12' };
const CLASS_ROWS = [
  { ...VIOLET, active: true, qrVersion: 1, updatedAt: '2026-11-05T08:00:00.000Z', floor: { id: 'f1', name: '1er étage' }, level: { id: 'l1', name: '1re année' } },
];

/** Semaine du lundi 23 novembre 2026 ; « maintenant » : mercredi 18 novembre. */
const session = (over: Partial<TimetableSession> = {}): TimetableSession => ({
  id: 's1',
  seriesId: 'r1',
  detached: false,
  teacher: ENS,
  class: VIOLET,
  level: { id: 'l1', name: '1re année' },
  date: '2026-11-23',
  weekday: 1,
  startAt: '2026-11-23T07:00:00.000Z',
  endAt: '2026-11-23T08:00:00.000Z',
  startTime: '08:00',
  endTime: '09:00',
  subject: 'Mathématiques',
  room: 'Salle 12',
  status: 'SCHEDULED',
  cancelReason: null,
  ...over,
});

function setup(path: string, handler?: (call: Call) => Response | undefined) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call: Call = { url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined };
      calls.push(call);
      const custom = handler?.(call);
      if (custom) return custom;
      if (url === '/api/auth/me') return json(200, ADMIN);
      if (url === '/api/admin/teacher-classes') return json(200, [{ teacher: ENS, classIds: ['k1'] }, { teacher: AUTRE, classIds: [] }]);
      if (url === '/api/admin/coverage/classes') return json(200, CLASS_ROWS);
      if (url.startsWith('/api/timetable/sessions?')) return json(200, []);
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  const router = createMemoryRouter(adminRoutes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { calls, router };
}

/** Liste déroulante MUI : ouvrir, puis choisir l'option (rendue hors du dialogue). */
async function chooseClass(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.click(within(dialog).getByRole('combobox', { name: /Classe/ }));
  await user.click(await screen.findByRole('option', { name: '1ère année Violet' }));
}

const listCalls = (calls: Call[]) => calls.filter((c) => c.url.startsWith('/api/timetable/sessions?'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-18T09:00:00.000Z') });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Emplois du temps — administration', () => {
  it('sans choix : invite à choisir un enseignant ; avec : la semaine jour par jour', async () => {
    setup('/admin/emplois-du-temps');
    expect(await screen.findByRole('heading', { name: 'Emplois du temps' })).toBeInTheDocument();
    expect(screen.getByText('Choisissez un enseignant')).toBeInTheDocument();
  });

  it('liste les séances de l’enseignant choisi, groupées par jour, et change de semaine', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { calls } = setup('/admin/emplois-du-temps?id=t1&semaine=2026-11-23&affichage=liste', (call) =>
      call.url.startsWith('/api/timetable/sessions?') && call.url.includes('from=2026-11-23') ? json(200, [session()]) : undefined,
    );
    const item = await screen.findByRole('listitem', { name: 'Séance de 08:00 à 09:00, 1ère année Violet' });
    expect(within(item).getByText(/08:00 – 09:00 · 1ère année Violet \(1re année\)/)).toBeInTheDocument();
    expect(within(item).getByText(/Mathématiques · Salle : Salle 12/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /lundi 23 novembre/i })).toBeInTheDocument();
    expect(listCalls(calls).at(-1)!.url).toBe('/api/timetable/sessions?from=2026-11-23&to=2026-11-29&includeCancelled=true&teacherId=t1');

    await user.click(screen.getByRole('button', { name: 'Semaine suivante' }));
    await waitFor(() => expect(listCalls(calls).at(-1)!.url).toContain('from=2026-11-30&to=2026-12-06'));
  });

  it('nouvelle série : envoie le formulaire ; un conflit est listé et reçoit le focus', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { calls } = setup('/admin/emplois-du-temps?id=t1&semaine=2026-11-23', (call) =>
      call.url === '/api/timetable/series' && call.method === 'POST'
        ? json(409, {
            error: {
              code: 'TIMETABLE_CONFLICT',
              message: 'Conflit',
              details: {
                conflicts: [
                  {
                    kind: 'TEACHER',
                    sessionId: 's9',
                    date: '2026-11-30',
                    startAt: '2026-11-30T07:00:00.000Z',
                    endAt: '2026-11-30T08:00:00.000Z',
                    teacher: ENS,
                    class: { id: 'k2', name: '2e année Bleu' },
                    proposed: { date: '2026-11-30', startAt: '2026-11-30T07:30:00.000Z', endAt: '2026-11-30T08:30:00.000Z' },
                  },
                ],
              },
            },
          })
        : undefined,
    );
    await user.click(await screen.findByRole('button', { name: 'Nouvelle série' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle série hebdomadaire' });
    await chooseClass(user, dialog);
    await user.clear(within(dialog).getByLabelText(/Matière/));
    await user.type(within(dialog).getByLabelText(/Matière/), 'Sciences');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Conflit d’horaires : rien n’a été enregistré');
    expect(alert).toHaveTextContent(/30 novembre 2026.*Amel Enseignante a déjà une séance en 2e année Bleu/);
    expect(alert).toHaveTextContent('Choisissez un autre horaire, ou annulez d’abord la séance existante.');
    await waitFor(() => expect(alert).toHaveFocus());
    const post = calls.find((c) => c.url === '/api/timetable/series' && c.method === 'POST')!;
    expect(post.body).toMatchObject({ teacherId: 't1', weekday: 1, startDate: '2026-11-23', startTime: '08:00', endTime: '09:00', subject: 'Sciences', room: null });
  });

  it('une erreur du serveur s’affiche sous le champ concerné', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup('/admin/emplois-du-temps?id=t1&semaine=2026-11-23', (call) =>
      call.url === '/api/timetable/sessions' && call.method === 'POST'
        ? json(400, { error: { code: 'VALIDATION_ERROR', message: 'x', details: { fields: [{ field: 'endTime', messages: ['L’heure de fin doit être après l’heure de début.'] }] } } })
        : undefined,
    );
    await user.click(await screen.findByRole('button', { name: 'Nouvelle séance' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle séance' });
    await chooseClass(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText('L’heure de fin doit être après l’heure de début.')).toBeInTheDocument();
  });

  it('modifier une séance d’une série : seule, ou avec les suivantes (PATCH de la série à partir de son jour)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { calls } = setup('/admin/emplois-du-temps?id=t1&semaine=2026-11-23', (call) => {
      if (call.url.startsWith('/api/timetable/sessions?')) return json(200, [session()]);
      if (call.method === 'PATCH') return json(200, call.url.includes('/series/') ? { series: {}, updated: 1, created: 0, cancelled: 0 } : session());
      return undefined;
    });
    await user.click(await screen.findByRole('button', { name: /Modifier la séance de 08:00/ }));
    let dialog = await screen.findByRole('dialog', { name: 'Modifier la séance' });
    await user.clear(within(dialog).getByLabelText(/Salle/));
    await user.type(within(dialog).getByLabelText(/Salle/), 'Labo');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && c.url === '/api/timetable/sessions/s1')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ room: 'Labo', date: '2026-11-23' });

    await user.click(await screen.findByRole('button', { name: /Modifier la séance de 08:00/ }));
    dialog = await screen.findByRole('dialog', { name: 'Modifier la séance' });
    await user.click(within(dialog).getByRole('radio', { name: 'Cette séance et les suivantes de la série' }));
    expect(within(dialog).getByLabelText(/^Date/)).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && c.url === '/api/timetable/series/r1')).toBe(true));
    expect(calls.find((c) => c.url === '/api/timetable/series/r1')!.body).toMatchObject({ from: '2026-11-23', startTime: '08:00' });
  });

  it('annuler : le motif est obligatoire, puis la séance est annulée', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { calls } = setup('/admin/emplois-du-temps?id=t1&semaine=2026-11-23', (call) => {
      if (call.url.startsWith('/api/timetable/sessions?')) return json(200, [session()]);
      if (call.url === '/api/timetable/sessions/s1/cancel') return json(200, session({ status: 'CANCELLED', cancelReason: 'Sortie' }));
      return undefined;
    });
    await user.click(await screen.findByRole('button', { name: /Annuler la séance de 08:00/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Annuler une séance' });
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer l’annulation' }));
    expect(within(dialog).getByText('Indiquez le motif de l’annulation.')).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/cancel'))).toBe(false);
    await user.type(within(dialog).getByLabelText(/Motif de l’annulation/), 'Sortie');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer l’annulation' }));
    await waitFor(() => expect(calls.find((c) => c.url === '/api/timetable/sessions/s1/cancel')?.body).toEqual({ reason: 'Sortie' }));
  });

  it('séance annulée : « Séance annulée » et son motif, sans action ; séance commencée : pas de modification', async () => {
    setup('/admin/emplois-du-temps?id=t1&semaine=2026-11-16&affichage=liste', (call) =>
      call.url.startsWith('/api/timetable/sessions?')
        ? json(200, [
            session({ id: 'c', date: '2026-11-16', startAt: '2026-11-16T07:00:00.000Z', endAt: '2026-11-16T08:00:00.000Z', status: 'CANCELLED', cancelReason: 'Vacances' }),
            session({ id: 'p', date: '2026-11-18', startAt: '2026-11-18T07:00:00.000Z', endAt: '2026-11-18T08:00:00.000Z', startTime: '08:00' }),
          ])
        : undefined,
    );
    const items = await screen.findAllByRole('listitem', { name: /Séance de 08:00/ });
    expect(within(items[0]).getByText('Séance annulée')).toBeInTheDocument();
    expect(within(items[0]).getByText('Motif : Vacances')).toBeInTheDocument();
    expect(within(items[0]).queryByRole('button')).toBeNull();
    expect(within(items[1]).queryByRole('button', { name: /Modifier/ })).toBeNull();
    expect(within(items[1]).getByRole('button', { name: /Annuler la séance/ })).toBeInTheDocument();
  });

  it('l’entrée « Emplois du temps » figure dans le menu de l’administration', async () => {
    setup('/admin/emplois-du-temps');
    expect(await screen.findByRole('link', { name: 'Emplois du temps' })).toHaveAttribute('href', '/admin/emplois-du-temps');
  });
});

describe('Emplois du temps — grille de la semaine', () => {
  const lundi = session();
  const mardi = session({
    id: 's2',
    date: '2026-11-24',
    weekday: 2,
    startAt: '2026-11-24T09:00:00.000Z',
    endAt: '2026-11-24T10:30:00.000Z',
    startTime: '10:00',
    endTime: '11:30',
    class: { id: 'k2', name: '2e année Bleu', room: null },
    subject: 'Sciences',
    room: 'Labo',
  });
  const annulee = session({
    id: 's3',
    date: '2026-11-26',
    weekday: 4,
    startAt: '2026-11-26T13:00:00.000Z',
    endAt: '2026-11-26T14:00:00.000Z',
    startTime: '14:00',
    endTime: '15:00',
    class: { id: 'k3', name: '3e année Rouge', room: null },
    status: 'CANCELLED',
    cancelReason: 'Sortie',
  });
  const week = (call: Call) => (call.url.startsWith('/api/timetable/sessions?') ? json(200, [lundi, mardi, annulee]) : undefined);

  it('affiche les chiffres de la semaine : séances, classes, heures, annulées', async () => {
    setup('/admin/emplois-du-temps?id=t1&semaine=2026-11-23', week);
    const stats = await screen.findByRole('region', { name: 'Chiffres de la semaine' });
    expect(within(stats).getByText('Séances cette semaine').nextSibling).toHaveTextContent('2');
    expect(within(stats).getByText('Classes').nextSibling).toHaveTextContent('2');
    expect(within(stats).getByText('Heures / semaine').nextSibling).toHaveTextContent('2 h 30');
    expect(within(stats).getByText('Annulées').nextSibling).toHaveTextContent('1');
  });

  it('place chaque séance dans la grille ; la première est sélectionnée et son détail s’affiche', async () => {
    setup('/admin/emplois-du-temps?id=t1&semaine=2026-11-23', week);
    const block = await screen.findByRole('button', { name: /Séance de 08:00 à 09:00, 1ère année Violet/ });
    expect(block).toHaveAttribute('aria-pressed', 'true');
    const detail = screen.getByRole('region', { name: 'Séance sélectionnée' });
    expect(within(detail).getByText('1ère année Violet')).toBeInTheDocument();
    expect(within(detail).getByText(/Mathématiques · Salle : Salle 12/)).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: /Modifier la séance de 08:00/ })).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: /Annuler la séance de 08:00/ })).toBeInTheDocument();
  });

  it('choisir une autre séance change le détail ; une séance annulée n’a pas d’action et dit son motif', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup('/admin/emplois-du-temps?id=t1&semaine=2026-11-23', week);
    await user.click(await screen.findByRole('button', { name: /Séance de 10:00 à 11:30, 2e année Bleu/ }));
    const detail = screen.getByRole('region', { name: 'Séance sélectionnée' });
    expect(within(detail).getByText('2e année Bleu')).toBeInTheDocument();
    expect(within(detail).getByText(/Sciences · Salle : Labo/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Séance annulée de 14:00 à 15:00, 3e année Rouge/ }));
    expect(within(detail).getByText('Séance annulée')).toBeInTheDocument();
    expect(within(detail).getByText('Motif : Sortie')).toBeInTheDocument();
    expect(within(detail).queryByRole('button')).toBeNull();
  });

  describe('présence de l’enseignant (pointage, retard, absence, remplaçant)', () => {
    const BILEL = { id: 't2', displayName: 'Bilel Professeur' };
    const late = session({
      id: 'p1',
      presence: { status: 'LATE', arrivedAt: '2026-11-23T07:12:00.000Z', lateMinutes: 12, lateReason: 'ARRIVAL', requestId: null, replacedBy: null, substitute: null },
    });
    const replaced = session({
      id: 'p2',
      date: '2026-11-24',
      weekday: 2,
      startAt: '2026-11-24T07:00:00.000Z',
      endAt: '2026-11-24T08:00:00.000Z',
      presence: {
        status: 'EXCUSED',
        arrivedAt: null,
        lateMinutes: null,
        lateReason: null,
        requestId: 'rq1',
        replacedBy: BILEL,
        substitute: { teacher: BILEL, status: 'LATE', arrivedAt: '2026-11-24T07:09:00.000Z', lateMinutes: 9 },
      },
    });
    const presenceWeek = (call: Call) => (call.url.startsWith('/api/timetable/sessions?') ? json(200, [late, replaced]) : undefined);

    it('la grille montre le statut et le remplaçant sur chaque séance', async () => {
      setup('/admin/emplois-du-temps?id=t1&semaine=2026-11-23', presenceWeek);
      const block = await screen.findByRole('button', { name: /Séance de 08:00 à 09:00, 1ère année Violet, En retard, 12 min/ });
      expect(within(block).getByText('12 min')).toBeVisible();
      const other = screen.getByRole('button', { name: /Absence justifiée, remplacé\(e\) par Bilel Professeur/ });
      expect(within(other).getByText('Remplacé(e) par Bilel Professeur')).toBeVisible();
    });

    it('le détail d’une séance en retard : titulaire, statut, heure de pointage et durée du retard', async () => {
      setup('/admin/emplois-du-temps?id=t1&semaine=2026-11-23', presenceWeek);
      await screen.findByRole('button', { name: /En retard, 12 min/ });
      const detail = screen.getByRole('region', { name: 'Séance sélectionnée' });
      expect(within(detail).getByText('Enseignant : Amel Enseignante')).toBeVisible();
      expect(within(detail).getByText('En retard')).toBeVisible();
      expect(within(detail).getByText(/^Pointage à \d{2}:\d{2}$/)).toBeVisible();
      expect(within(detail).getByText('Retard : 12 min')).toBeVisible();
      expect(within(detail).queryByText(/Remplaçant/)).toBeNull();
    });

    it('le détail d’une séance remplacée : le titulaire reste affiché, et le remplaçant avec son propre statut', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      setup('/admin/emplois-du-temps?id=t1&semaine=2026-11-23', presenceWeek);
      await user.click(await screen.findByRole('button', { name: /Absence justifiée, remplacé\(e\) par Bilel Professeur/ }));
      const detail = screen.getByRole('region', { name: 'Séance sélectionnée' });
      expect(within(detail).getByText('Enseignant : Amel Enseignante')).toBeVisible();
      expect(within(detail).getByText('Absence justifiée')).toBeVisible();
      expect(within(detail).getByText('Remplacé(e) par Bilel Professeur')).toBeVisible();
      expect(within(detail).getByText(/^Remplaçant arrivé à \d{2}:\d{2} · 9 min de retard$/)).toBeVisible();
      // Un titulaire absent n'a pas de pointage à montrer.
      expect(within(detail).queryByText(/^Pointage à/)).toBeNull();
    });

    it('la liste jour par jour dit aussi le statut et le remplaçant', async () => {
      setup('/admin/emplois-du-temps?id=t1&semaine=2026-11-23&affichage=liste', presenceWeek);
      const items = await screen.findAllByRole('listitem', { name: /Séance de 08:00 à 09:00, 1ère année Violet/ });
      expect(within(items[0]!).getByText('En retard')).toBeVisible();
      expect(within(items[0]!).getByText('12 min')).toBeVisible();
      expect(within(items[1]!).getByText('Remplacé(e) par Bilel Professeur')).toBeVisible();
    });

    it('sans présence reçue (période longue), rien n’est affiché de plus et rien ne casse', async () => {
      setup('/admin/emplois-du-temps?id=t1&semaine=2026-11-23', (call) => (call.url.startsWith('/api/timetable/sessions?') ? json(200, [session({ presence: null })]) : undefined));
      const block = await screen.findByRole('button', { name: 'Séance de 08:00 à 09:00, 1ère année Violet' });
      expect(block).toBeVisible();
      const detail = screen.getByRole('region', { name: 'Séance sélectionnée' });
      expect(within(detail).queryByText(/^Pointage à/)).toBeNull();
    });
  });

  it('« Classes de la semaine » liste les séances tenues, sans les annulées, et sélectionne au clic', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup('/admin/emplois-du-temps?id=t1&semaine=2026-11-23', week);
    const list = await screen.findByRole('region', { name: 'Classes de la semaine' });
    const rows = within(list).getAllByRole('button');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent('2e année Bleu');
    expect(rows[1]).toHaveTextContent('Mardi 10:00');
    await user.click(rows[1]);
    expect(within(screen.getByRole('region', { name: 'Séance sélectionnée' })).getByText('2e année Bleu')).toBeInTheDocument();
  });

  it('une semaine sans séance le dit, sans détail à afficher', async () => {
    setup('/admin/emplois-du-temps?id=t1&semaine=2026-11-23');
    expect(await screen.findByText('Aucune séance cette semaine.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Séance sélectionnée' })).toBeNull();
  });

  it('le bouton « Liste » garde le choix dans l’adresse et affiche les séances jour par jour', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { router } = setup('/admin/emplois-du-temps?id=t1&semaine=2026-11-23', week);
    await screen.findByRole('button', { name: /Séance de 08:00 à 09:00/ });
    await user.click(screen.getByRole('button', { name: 'Liste' }));
    expect(await screen.findByRole('listitem', { name: 'Séance de 08:00 à 09:00, 1ère année Violet' })).toBeInTheDocument();
    expect(router.state.location.search).toContain('affichage=liste');
    await user.click(screen.getByRole('button', { name: 'Semaine' }));
    expect(await screen.findByRole('button', { name: /Séance de 08:00 à 09:00/ })).toBeInTheDocument();
    expect(router.state.location.search).not.toContain('affichage');
  });

  it('n’affiche ni samedi ni dimanche, sauf si une séance y est planifiée', async () => {
    const { unmount } = (() => {
      setup('/admin/emplois-du-temps?id=t1&semaine=2026-11-23', week);
      return { unmount: () => undefined };
    })();
    await screen.findByRole('button', { name: /Séance de 08:00 à 09:00/ });
    const grid = screen.getByRole('group', { name: 'Séances de la semaine' });
    expect(within(grid).getByText('ven')).toBeInTheDocument();
    expect(within(grid).queryByText('sam')).toBeNull();
    expect(within(grid).queryByText('dim')).toBeNull();
    unmount();
  });

  it('une séance du samedi fait apparaître la colonne', async () => {
    setup('/admin/emplois-du-temps?id=t1&semaine=2026-11-23', (call) =>
      call.url.startsWith('/api/timetable/sessions?')
        ? json(200, [session({ id: 'w', date: '2026-11-28', weekday: 6, startAt: '2026-11-28T07:00:00.000Z', endAt: '2026-11-28T08:00:00.000Z' })])
        : undefined,
    );
    const grid = await screen.findByRole('group', { name: 'Séances de la semaine' });
    expect(within(grid).getByText('sam')).toBeInTheDocument();
    expect(within(grid).queryByText('dim')).toBeNull();
  });
});
