import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminRoutes } from '../../src/features/admin/adminRoutes';

/**
 * Situation d'un élève à un instant donné (021, US2) : saisie de la date et de l'heure, une rubrique par fait avec sa
 * disponibilité écrite en toutes lettres, avertissement « non garantie », rubriques indisponibles, impression.
 */

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const ADMIN = { id: 'ad', displayName: 'Direction', role: 'SUPER_ADMIN', permissions: [], mustChangePassword: false };
const LEVELS = [{ id: 'l1', name: '1re primaire', cycle: 'PRIMARY', position: 3, classes: [{ id: 'c1', name: 'CP Violet', room: 'Salle 12', floor: { id: 'f1', name: '1er étage' }, studentCount: 1 }] }];
const STUDENTS = [{ id: 's1', firstName: 'Aya', lastName: 'Ben Ali', parentPhone: '+216 99 000 001', active: true, class: { id: 'c1', name: 'CP Violet', level: { id: 'l1', name: '1re primaire', position: 3 } } }];
const HISTORY = { studentId: 's1', items: [] };
const teacher = { id: 't1', displayName: 'Mme Titulaire' };
const none = { availability: 'NONE' };

const SITUATION = {
  student: { id: 's1', firstName: 'Aya', lastName: 'Ben Ali' },
  moment: { requested: '2026-11-12T10:42', evaluatedAt: '2026-11-12T09:42:59.999Z', timeZone: 'Europe/Paris' },
  class: { availability: 'KNOWN', value: { id: 'c1', name: 'CP Violet', level: '1re primaire', floor: '1er étage', room: 'Salle 12', since: '2026-09-01T07:00:00.000Z', until: null, reconstructed: false } },
  session: { availability: 'KNOWN', value: { id: 'x1', teacher, subject: 'Mathématiques', room: 'Salle 12', startAt: '2026-11-12T09:00:00.000Z', endAt: '2026-11-12T10:00:00.000Z', status: 'SCHEDULED', cancellation: null } },
  teacher: { availability: 'KNOWN', value: { arrivals: [{ teacher, status: 'ON_TIME', method: 'QR', arrivedAt: '2026-11-12T09:02:00.000Z', recordedAt: '2026-11-12T09:02:00.000Z', comment: null, corrected: true }], laterArrivals: [], absences: [], departures: [], dayLevelOnly: false } },
  announcement: none,
  substitute: none,
  supervisors: none,
  changes: none,
};

function setup(answer: () => Response = () => json(200, SITUATION)) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url === '/api/auth/me') return json(200, ADMIN);
      if (url === '/api/admin/levels') return json(200, LEVELS);
      if (url === '/api/admin/students') return json(200, STUDENTS);
      if (url === '/api/admin/students/s1/class-history') return json(200, HISTORY);
      if (url.startsWith('/api/admin/students/s1/situation')) return answer();
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  const router = createMemoryRouter(adminRoutes, { initialEntries: ['/admin/eleves'] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { urls };
}

afterEach(() => vi.unstubAllGlobals());

/** Ouvre le tiroir de l'élève, saisit le moment et demande la situation. */
async function ask(user: ReturnType<typeof userEvent.setup>, moment = '2026-11-12T10:42') {
  await user.click(await screen.findByRole('button', { name: 'Historique de la classe de l’élève Aya Ben Ali' }));
  const drawer = await screen.findByRole('dialog', { name: /Historique de classe/ });
  const input = within(drawer).getByLabelText('Date et heure');
  await user.clear(input);
  await user.type(input, moment);
  await user.click(within(drawer).getByRole('button', { name: 'Voir la situation' }));
  return drawer;
}

describe('Situation d’un élève à un instant donné', () => {
  it('envoie la date et l’heure saisies et affiche une rubrique par fait, chacune avec sa disponibilité en mots', async () => {
    const user = userEvent.setup();
    const { urls } = setup();
    const drawer = await ask(user);
    await within(drawer).findByRole('region', { name: 'Séance prévue' });
    expect(urls).toContain('/api/admin/students/s1/situation?at=2026-11-12T10%3A42');
    for (const name of ['Classe', 'Séance prévue', 'Enseignant sur place', 'Annonce de retard ou d’absence', 'Remplaçant', 'Surveillants', 'Modifications']) {
      expect(within(drawer).getByRole('region', { name })).toBeInTheDocument();
    }
    const session = within(drawer).getByRole('region', { name: 'Séance prévue' });
    expect(within(session).getByText('Connue')).toBeInTheDocument();
    expect(within(session).getByText(/Mathématiques/)).toBeInTheDocument();
    expect(within(session).getByText(/Mme Titulaire/)).toBeInTheDocument();
    const substitute = within(drawer).getByRole('region', { name: 'Remplaçant' });
    expect(within(substitute).getByText('Aucune information enregistrée')).toBeInTheDocument();
  });

  it('l’arrivée de l’enseignant porte la mention « corrigée » quand elle l’a été', async () => {
    const user = userEvent.setup();
    setup();
    const drawer = await ask(user);
    const teacherRegion = await within(drawer).findByRole('region', { name: 'Enseignant sur place' });
    expect(within(teacherRegion).getByText(/Mme Titulaire/)).toBeInTheDocument();
    expect(within(teacherRegion).getByText(/corrigée/i)).toBeInTheDocument();
  });

  it('sans arrivée enregistrée : « aucune arrivée enregistrée », jamais « absent » ; l’arrivée plus tardive est signalée', async () => {
    const user = userEvent.setup();
    setup(() =>
      json(200, {
        ...SITUATION,
        teacher: { availability: 'NONE', value: { arrivals: [], laterArrivals: [{ teacher, status: 'LATE', method: 'QR', arrivedAt: '2026-11-12T09:50:00.000Z', recordedAt: '2026-11-12T09:50:00.000Z', comment: null, corrected: false }], absences: [], departures: [], dayLevelOnly: false } },
      }),
    );
    const drawer = await ask(user);
    const region = await within(drawer).findByRole('region', { name: 'Enseignant sur place' });
    expect(within(region).getByText(/Aucune arrivée enregistrée à cet instant/)).toBeInTheDocument();
    expect(within(region).getByText(/plus tard/i)).toBeInTheDocument();
    expect(within(region).queryByText(/absent/i)).not.toBeInTheDocument();
  });

  it('une classe probable affiche « Probable » et son avertissement ; une rubrique indisponible dit pourquoi', async () => {
    const user = userEvent.setup();
    const warning = 'Non garantie : des changements de classe ont pu ne pas être enregistrés avant le 20 novembre 2026.';
    setup(() =>
      json(200, {
        ...SITUATION,
        class: { ...SITUATION.class, availability: 'PROBABLE', warning },
        session: { availability: 'UNAVAILABLE', reasonUnavailable: 'Avant la création de l’élève : aucune classe n’est connue à cet instant.' },
      }),
    );
    const drawer = await ask(user);
    const classRegion = await within(drawer).findByRole('region', { name: 'Classe' });
    expect(within(classRegion).getByText('Probable')).toBeInTheDocument();
    expect(within(classRegion).getByText(warning)).toBeInTheDocument();
    const session = within(drawer).getByRole('region', { name: 'Séance prévue' });
    expect(within(session).getByText('Indisponible')).toBeInTheDocument();
    expect(within(session).getByText(/Avant la création de l’élève/)).toBeInTheDocument();
  });

  it('aucune garde : « aucune enregistrée », jamais « sans surveillance »', async () => {
    const user = userEvent.setup();
    setup();
    const drawer = await ask(user);
    const region = await within(drawer).findByRole('region', { name: 'Surveillants' });
    expect(within(region).getByText(/Aucune garde enregistrée à cet instant/)).toBeInTheDocument();
    expect(within(drawer).queryByText(/sans surveillance/i)).not.toBeInTheDocument();
  });

  it('un surveillant présent est nommé avec son état', async () => {
    const user = userEvent.setup();
    setup(() =>
      json(200, {
        ...SITUATION,
        supervisors: { availability: 'KNOWN', value: { source: 'SUPERVISOR_REPORT', type: 'EMPTY_CLASS', startAt: '2026-11-12T09:08:00.000Z', endAt: null, assignee: { user: { id: 'u9', displayName: 'Mme Surveillante' }, state: 'PRESENT', presentSince: '2026-11-12T09:08:00.000Z' }, reinforcements: [{ user: { id: 'u8', displayName: 'M. Renfort' }, joinedAt: '2026-11-12T09:12:00.000Z' }] } },
      }),
    );
    const drawer = await ask(user);
    const region = await within(drawer).findByRole('region', { name: 'Surveillants' });
    expect(within(region).getByText(/Mme Surveillante/)).toBeInTheDocument();
    expect(within(region).getByText(/Présent/)).toBeInTheDocument();
    expect(within(region).getByText(/M\. Renfort/)).toBeInTheDocument();
  });

  it('liste les modifications avec auteur, avant et après, et signale en toutes lettres celles faites après l’instant', async () => {
    const user = userEvent.setup();
    setup(() =>
      json(200, {
        ...SITUATION,
        substitute: {
          availability: 'KNOWN',
          value: {
            inForce: { id: 'u2', displayName: 'M. Remplaçant' },
            previous: [
              { teacher: { id: 'u1', displayName: 'M. Premier' }, setAt: '2026-11-12T07:30:00.000Z', setBy: { id: 'ad', displayName: 'Direction' }, madeAfterMoment: false },
              { teacher: { id: 'u3', displayName: 'M. Dernier' }, setAt: '2026-11-12T11:00:00.000Z', setBy: { id: 'ad', displayName: 'Direction' }, madeAfterMoment: true },
            ],
            arrived: null,
          },
        },
        changes: {
          availability: 'KNOWN',
          value: [
            { kind: 'TIMETABLE_CHANGED', at: '2026-11-12T08:00:00.000Z', by: { id: 'ad', displayName: 'Direction' }, before: { room: 'Salle 8' }, after: { room: 'Salle 12' }, reason: null, madeAfterMoment: false },
            { kind: 'ATTENDANCE_CORRECTED', at: '2026-11-13T08:00:00.000Z', by: { id: 'ad', displayName: 'Direction' }, before: { arrivedAt: '09:02' }, after: { arrivedAt: '09:12' }, reason: 'Erreur de saisie', madeAfterMoment: true },
          ],
        },
      }),
    );
    const drawer = await ask(user);
    const region = await within(drawer).findByRole('region', { name: 'Modifications' });
    const items = within(region).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText(/Emploi du temps modifié/)).toBeInTheDocument();
    expect(within(items[0]).getByText(/Salle 8/)).toBeInTheDocument();
    expect(within(items[0]).queryByText('Fait après l’instant demandé')).not.toBeInTheDocument();
    expect(within(items[1]).getByText(/Pointage corrigé/)).toBeInTheDocument();
    expect(within(items[1]).getByText(/Erreur de saisie/)).toBeInTheDocument();
    expect(within(items[1]).getByText('Fait après l’instant demandé')).toBeInTheDocument();
    const substitute = within(drawer).getByRole('region', { name: 'Remplaçant' });
    expect(within(substitute).getByText(/M\. Premier.*Direction$/)).toBeInTheDocument();
    expect(within(substitute).getByText(/M\. Dernier.*après l’instant demandé/)).toBeInTheDocument();
  });

  it('un instant refusé par le serveur est expliqué sous le champ, sans afficher de situation', async () => {
    const user = userEvent.setup();
    setup(() => json(400, { error: { code: 'VALIDATION_ERROR', message: 'L’instant demandé ne peut pas être dans le futur.' } }));
    const drawer = await ask(user, '2999-01-01T10:00');
    expect(await within(drawer).findByText(/ne peut pas être dans le futur/)).toBeInTheDocument();
    expect(within(drawer).queryByRole('region', { name: 'Séance prévue' })).not.toBeInTheDocument();
  });

  it('refuse de demander sans date et heure', async () => {
    const user = userEvent.setup();
    const { urls } = setup();
    await user.click(await screen.findByRole('button', { name: 'Historique de la classe de l’élève Aya Ben Ali' }));
    const drawer = await screen.findByRole('dialog', { name: /Historique de classe/ });
    await user.click(within(drawer).getByRole('button', { name: 'Voir la situation' }));
    expect(await within(drawer).findByText('Indiquez la date et l’heure.')).toBeInTheDocument();
    expect(urls.some((u) => u.includes('/situation'))).toBe(false);
  });

  it('propose d’imprimer la situation, avec son auteur et l’heure d’édition en tête', async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    setup();
    const drawer = await ask(user);
    await within(drawer).findByRole('region', { name: 'Séance prévue' });
    expect(within(drawer).getByText(/Édité par Direction/)).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'Imprimer la situation' }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    print.mockRestore();
  });
});
