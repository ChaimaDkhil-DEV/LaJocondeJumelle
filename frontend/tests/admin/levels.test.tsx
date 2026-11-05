import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/Toast';
import { adminRoutes } from '../../src/features/admin/adminRoutes';

/**
 * Niveaux scolaires : sans eux, aucune classe ne peut accueillir d'élèves. Le super administrateur les crée
 * (« Niveaux »), rattache chaque classe à son niveau (formulaire de la classe) puis inscrit les élèves.
 */

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const SUPER_ADMIN = { id: 'sa', displayName: 'Direction', role: 'SUPER_ADMIN', permissions: [], mustChangePassword: false };
const FLOORS = [{ id: 'f1', name: '1er étage', position: 1, active: true, supervisorCount: 1, classCount: 2, warning: null }];

const rose = { id: 'c1', name: 'Préparatoire 1 - Rose', room: 'Salle 1', floor: { id: 'f1', name: '1er étage' }, studentCount: 2 };
const tulipe = { id: 'c2', name: 'Préparatoire 1 - Tulipe', room: null, floor: { id: 'f1', name: '1er étage' }, studentCount: 1 };

const LEVELS = [
  { id: 'l1', name: 'Préparatoire 1', cycle: 'PREPARATORY', position: 1, classes: [rose, tulipe] },
  { id: 'l2', name: '1re année primaire', cycle: 'PRIMARY', position: 2, classes: [] },
];
/** Niveaux créés mais aucune classe n'y est encore rattachée (situation d'une installation neuve). */
const LEVELS_WITHOUT_CLASSES = [{ ...LEVELS[0], classes: [] }, LEVELS[1]];

const CLASS_ROWS = [
  { id: 'c1', name: 'Préparatoire 1 - Rose', room: 'Salle 1', active: true, qrVersion: 1, updatedAt: '2026-11-05T08:00:00.000Z', floor: { id: 'f1', name: '1er étage' }, level: { id: 'l1', name: 'Préparatoire 1' } },
  { id: 'k9', name: 'Salle des arts', room: null, active: true, qrVersion: 1, updatedAt: '2026-11-05T08:00:00.000Z', floor: { id: 'f1', name: '1er étage' }, level: null },
];

function setup(path: string, options: { levels?: unknown; handler?: (call: Call) => Response | undefined } = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call: Call = { url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined };
      calls.push(call);
      const custom = options.handler?.(call);
      if (custom) return custom;
      if (url === '/api/auth/me') return json(200, SUPER_ADMIN);
      if (url === '/api/admin/levels' && call.method === 'GET') return json(200, options.levels ?? LEVELS);
      if (url === '/api/admin/floors') return json(200, FLOORS);
      if (url === '/api/admin/coverage/classes' && call.method === 'GET') return json(200, CLASS_ROWS);
      if (url === '/api/admin/students') return json(200, []);
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  const router = createMemoryRouter(adminRoutes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return calls;
}

const writes = (calls: Call[]) => calls.filter((c) => c.method !== 'GET');

afterEach(() => vi.unstubAllGlobals());

describe('Page « Niveaux »', () => {
  it('liste les niveaux avec leur cycle, leurs classes et leurs élèves', async () => {
    setup('/admin/niveaux');
    const list = await screen.findByRole('list', { name: 'Niveaux' });
    const first = within(list).getAllByRole('listitem')[0];
    expect(within(first).getByText('Préparatoire 1')).toBeInTheDocument();
    expect(within(first).getByText('Préparatoire')).toBeInTheDocument();
    expect(first).toHaveTextContent('2 classes · 3 élèves');
    expect(within(list).getAllByRole('listitem')[1]).toHaveTextContent('1re année primaire');
    expect(within(list).getAllByRole('listitem')[1]).toHaveTextContent('Primaire');
  });

  it('aucun niveau : état vide qui explique quoi faire, et le bouton pour en créer un', async () => {
    setup('/admin/niveaux', { levels: [] });
    expect(await screen.findByText('Aucun niveau')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nouveau niveau' })).toBeEnabled();
  });

  it('niveaux sans classe rattachée : indique d’ouvrir une classe pour choisir son niveau', async () => {
    setup('/admin/niveaux', { levels: LEVELS_WITHOUT_CLASSES });
    expect(await screen.findByText(/Aucune classe n’est encore rattachée à un niveau/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gérer les classes' })).toHaveAttribute('href', '/admin/classes');
  });

  it('création : nom et position vérifiés avant tout envoi', async () => {
    const user = userEvent.setup();
    const calls = setup('/admin/niveaux');
    await user.click(await screen.findByRole('button', { name: 'Nouveau niveau' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouveau niveau' });
    await user.type(within(dialog).getByLabelText(/Ordre d’affichage/), 'abc');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le niveau' }));
    expect(await within(dialog).findByText('Le nom est obligatoire.')).toBeInTheDocument();
    expect(within(dialog).getByText('Nombre entier attendu (ex. 1).')).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it('création : cycle primaire et position suivante par défaut, puis envoi et confirmation', async () => {
    const user = userEvent.setup();
    const calls = setup('/admin/niveaux', {
      handler: (call) => (call.method === 'POST' && call.url === '/api/admin/levels' ? json(201, [...LEVELS, { id: 'l3', name: '2e année primaire', cycle: 'PRIMARY', position: 3, classes: [] }]) : undefined),
    });
    await user.click(await screen.findByRole('button', { name: 'Nouveau niveau' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouveau niveau' });
    expect(within(dialog).getByLabelText(/Ordre d’affichage/)).toHaveValue('3');
    await user.type(within(dialog).getByLabelText(/Nom du niveau/), '  2e année primaire ');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le niveau' }));

    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ url: '/api/admin/levels', method: 'POST', body: { name: '2e année primaire', cycle: 'PRIMARY', position: 3 } });
    expect(await screen.findByText('Niveau créé.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Nouveau niveau' })).not.toBeInTheDocument();
  });

  it('création : le cycle préparatoire est choisissable', async () => {
    const user = userEvent.setup();
    const calls = setup('/admin/niveaux');
    await user.click(await screen.findByRole('button', { name: 'Nouveau niveau' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouveau niveau' });
    await user.type(within(dialog).getByLabelText(/Nom du niveau/), 'Préparatoire 2');
    await user.click(within(dialog).getByRole('combobox', { name: /Cycle/ }));
    await user.click(await screen.findByRole('option', { name: 'Préparatoire' }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le niveau' }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toMatchObject({ cycle: 'PREPARATORY' });
  });

  it('modification : champs préremplis, envoi sur le niveau concerné', async () => {
    const user = userEvent.setup();
    const calls = setup('/admin/niveaux', { handler: (call) => (call.method === 'PATCH' ? json(200, LEVELS) : undefined) });
    await user.click(await screen.findByRole('button', { name: 'Modifier le niveau Préparatoire 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modifier : Préparatoire 1' });
    expect(within(dialog).getByLabelText(/Nom du niveau/)).toHaveValue('Préparatoire 1');
    expect(within(dialog).getByLabelText(/Ordre d’affichage/)).toHaveValue('1');
    await user.clear(within(dialog).getByLabelText(/Nom du niveau/));
    await user.type(within(dialog).getByLabelText(/Nom du niveau/), 'Préparatoire A');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le niveau' }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ url: '/api/admin/levels/l1', method: 'PATCH', body: { name: 'Préparatoire A', cycle: 'PREPARATORY', position: 1 } });
    expect(await screen.findByText('Niveau enregistré.')).toBeInTheDocument();
  });

  it('un nom ou une position déjà pris : le message du serveur s’affiche et le dialogue reste ouvert', async () => {
    const user = userEvent.setup();
    setup('/admin/niveaux', {
      handler: (call) =>
        call.method === 'POST' ? json(409, { error: { code: 'CONFLICT', message: 'Cette position est déjà utilisée par un autre niveau.' } }) : undefined,
    });
    await user.click(await screen.findByRole('button', { name: 'Nouveau niveau' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouveau niveau' });
    await user.type(within(dialog).getByLabelText(/Nom du niveau/), 'Doublon');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le niveau' }));
    expect(await within(dialog).findByText('Cette position est déjà utilisée par un autre niveau.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Nouveau niveau' })).toBeInTheDocument();
  });
});

describe('Formulaire d’une classe : niveau scolaire', () => {
  it('le niveau de chaque classe apparaît dans la liste ; une salle sans niveau n’en affiche pas', async () => {
    setup('/admin/classes');
    const rowRose = (await screen.findByText('Préparatoire 1 - Rose')).closest('li')!;
    expect(rowRose).toHaveTextContent('Préparatoire 1');
    const rowArts = screen.getByText('Salle des arts').closest('li')!;
    expect(rowArts).not.toHaveTextContent('Préparatoire');
  });

  it('nouvelle classe : le niveau est facultatif et part à null s’il n’est pas choisi', async () => {
    const user = userEvent.setup();
    const calls = setup('/admin/classes', { handler: (c) => (c.method === 'POST' ? json(201, CLASS_ROWS) : undefined) });
    await user.click(await screen.findByRole('button', { name: 'Nouvelle classe' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle classe' });
    await user.type(within(dialog).getByLabelText(/Nom de la classe/), 'Salle de sport');
    await user.click(within(dialog).getByRole('combobox', { name: /Étage/ }));
    await user.click(await screen.findByRole('option', { name: '1er étage' }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer la classe' }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toMatchObject({ name: 'Salle de sport', floorId: 'f1', levelId: null });
  });

  it('nouvelle classe : choisir un niveau l’envoie avec la classe', async () => {
    const user = userEvent.setup();
    const calls = setup('/admin/classes', { handler: (c) => (c.method === 'POST' ? json(201, CLASS_ROWS) : undefined) });
    await user.click(await screen.findByRole('button', { name: 'Nouvelle classe' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle classe' });
    await user.type(within(dialog).getByLabelText(/Nom de la classe/), 'Préparatoire 1 - Lilas');
    await user.click(within(dialog).getByRole('combobox', { name: /Étage/ }));
    await user.click(await screen.findByRole('option', { name: '1er étage' }));
    await user.click(within(dialog).getByRole('combobox', { name: /Niveau scolaire/ }));
    expect(await screen.findByRole('option', { name: 'Aucun niveau' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: '1re année primaire' }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer la classe' }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toMatchObject({ name: 'Préparatoire 1 - Lilas', floorId: 'f1', levelId: 'l2' });
  });

  it('modification : le niveau actuel est présélectionné et conservé à l’envoi ; « Aucun niveau » le retire', async () => {
    const user = userEvent.setup();
    const calls = setup('/admin/classes', { handler: (c) => (c.method === 'PATCH' ? json(200, CLASS_ROWS) : undefined) });
    await user.click(await screen.findByRole('button', { name: 'Modifier la classe Préparatoire 1 - Rose' }));
    let dialog = await screen.findByRole('dialog', { name: 'Modifier : Préparatoire 1 - Rose' });
    expect(within(dialog).getByRole('combobox', { name: /Niveau scolaire/ })).toHaveTextContent('Préparatoire 1');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer la classe' }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ url: '/api/admin/coverage/classes/c1', body: { levelId: 'l1' } });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(await screen.findByRole('button', { name: 'Modifier la classe Préparatoire 1 - Rose' }));
    dialog = await screen.findByRole('dialog', { name: 'Modifier : Préparatoire 1 - Rose' });
    await user.click(within(dialog).getByRole('combobox', { name: /Niveau scolaire/ }));
    await user.click(await screen.findByRole('option', { name: 'Aucun niveau' }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer la classe' }));
    await waitFor(() => expect(writes(calls)).toHaveLength(2));
    expect(writes(calls)[1].body).toMatchObject({ levelId: null });
  });

  it('le serveur refuse de retirer le niveau d’une classe qui a des élèves : le message s’affiche', async () => {
    const user = userEvent.setup();
    setup('/admin/classes', {
      handler: (c) =>
        c.method === 'PATCH' ? json(400, { error: { code: 'VALIDATION_ERROR', message: 'Cette classe a des élèves actifs : elle doit garder un niveau scolaire.' } }) : undefined,
    });
    await user.click(await screen.findByRole('button', { name: 'Modifier la classe Préparatoire 1 - Rose' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modifier : Préparatoire 1 - Rose' });
    await user.click(within(dialog).getByRole('combobox', { name: /Niveau scolaire/ }));
    await user.click(await screen.findByRole('option', { name: 'Aucun niveau' }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer la classe' }));
    expect(await within(dialog).findByText('Cette classe a des élèves actifs : elle doit garder un niveau scolaire.')).toBeInTheDocument();
  });
});

describe('Page « Élèves » sans niveau rattaché', () => {
  it('aucune classe rattachée à un niveau : explique quoi faire et empêche d’ajouter un élève', async () => {
    setup('/admin/eleves', { levels: LEVELS_WITHOUT_CLASSES });
    expect(await screen.findByText(/Aucune classe n’est rattachée à un niveau scolaire/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gérer les niveaux' })).toHaveAttribute('href', '/admin/niveaux');
    expect(screen.getByRole('link', { name: 'Gérer les classes' })).toHaveAttribute('href', '/admin/classes');
    expect(screen.getByRole('button', { name: 'Nouvel élève' })).toBeDisabled();
  });

  it('avec des classes rattachées : pas d’avertissement, l’ajout est possible', async () => {
    setup('/admin/eleves');
    await screen.findByRole('heading', { name: 'Élèves' });
    expect(await screen.findByRole('button', { name: 'Nouvel élève' })).toBeEnabled();
    expect(screen.queryByText(/Aucune classe n’est rattachée à un niveau scolaire/)).not.toBeInTheDocument();
  });
});
