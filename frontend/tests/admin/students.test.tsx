import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminRoutes } from '../../src/features/admin/adminRoutes';

/**
 * Élèves (super administrateur) : liste filtrable, et service de restauration unique — boutons
 * radio Cantine / Panier, obligatoire, jamais deux cases à cocher.
 */

type Call = { url: string; method: string; body: unknown };

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const SUPER_ADMIN = { id: 'sa', displayName: 'Direction', role: 'SUPER_ADMIN', permissions: [], mustChangePassword: false };

const LEVELS = [
  {
    id: 'l1',
    name: 'Préparatoire 1',
    cycle: 'PREPARATORY',
    position: 1,
    classes: [
      { id: 'c1', name: 'Préparatoire 1 - Rose', room: 'Salle 001', floor: { id: 'f0', name: 'Rez-de-chaussée' }, studentCount: 2 },
      { id: 'c2', name: 'Préparatoire 1 - Tulipe', room: 'Salle 002', floor: { id: 'f0', name: 'Rez-de-chaussée' }, studentCount: 1 },
    ],
  },
  {
    id: 'l3',
    name: '1re primaire',
    cycle: 'PRIMARY',
    position: 3,
    classes: [{ id: 'c9', name: '1re primaire - Marguerite', room: 'Salle 101', floor: { id: 'f1', name: '1er étage' }, studentCount: 0 }],
  },
];

const level = (classId: string) => {
  const l = LEVELS.find((x) => x.classes.some((c) => c.id === classId))!;
  return { id: l.id, name: l.name, position: l.position };
};
const student = (id: string, firstName: string, lastName: string, classId: string, mealService: 'CANTINE' | 'PANIER') => ({
  id,
  firstName,
  lastName,
  parentPhone: '06 39 98 00 0' + id.slice(1),
  mealService,
  active: true,
  class: { id: classId, name: LEVELS.flatMap((l) => l.classes).find((c) => c.id === classId)!.name, level: level(classId) },
});

const STUDENTS = [
  student('s1', 'Aya', 'Ben Ali', 'c1', 'CANTINE'),
  student('s2', 'Adam', 'Zribi', 'c1', 'PANIER'),
  student('s3', 'Lina', 'Hammami', 'c2', 'CANTINE'),
];

function setup(handler: (url: string, method: string, body: unknown) => Response | undefined = () => undefined) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body });
      const custom = handler(url, method, body);
      if (custom) return custom;
      if (url === '/api/auth/me') return json(200, SUPER_ADMIN);
      if (url === '/api/admin/levels') return json(200, LEVELS);
      if (url === '/api/admin/students' && method === 'GET') return json(200, STUDENTS);
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  const router = createMemoryRouter(adminRoutes, { initialEntries: ['/admin/eleves'] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { calls };
}

afterEach(() => vi.unstubAllGlobals());

describe('Élèves (super administrateur)', () => {
  it('liste les élèves avec leur classe et leur service ; filtre par service et par classe', async () => {
    const user = userEvent.setup();
    setup();
    const list = await screen.findByRole('list', { name: 'Élèves' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('3 élèves · 2 à la cantine · 1 au panier')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Élèves' })).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('combobox', { name: 'Restauration' }));
    await user.click(screen.getByRole('option', { name: 'Panier' }));
    expect(within(screen.getByRole('list', { name: 'Élèves' })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('ZRIBI Adam')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Restauration' }));
    await user.click(screen.getByRole('option', { name: 'Tous' }));
    await user.click(screen.getByRole('combobox', { name: 'Classe' }));
    await user.click(screen.getByRole('option', { name: 'Préparatoire 1 - Tulipe' }));
    expect(within(screen.getByRole('list', { name: 'Élèves' })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('HAMMAMI Lina')).toBeInTheDocument();
  });

  it('nouvel élève : service obligatoire, un seul choix possible (radio), puis envoi', async () => {
    const user = userEvent.setup();
    const { calls } = setup((url, method, body) =>
      url === '/api/admin/students' && method === 'POST' ? json(201, { id: 's9', ...(body as object), active: true, class: { id: 'c9', name: '1re primaire - Marguerite', level: level('c9') } }) : undefined,
    );
    await user.click(await screen.findByRole('button', { name: 'Nouvel élève' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvel élève' });

    // Deux boutons radio d'un même groupe, aucun présélectionné ; aucune case à cocher.
    const group = within(dialog).getByRole('radiogroup', { name: /Service de restauration/ });
    const [cantine, panier] = within(group).getAllByRole('radio');
    expect(cantine).not.toBeChecked();
    expect(panier).not.toBeChecked();
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer l’élève' }));
    expect(within(dialog).getByText('Choisissez le service de restauration : cantine ou panier.')).toBeInTheDocument();
    expect(within(dialog).getByText('Le prénom est obligatoire.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/Prénom/), 'Malak');
    await user.type(within(dialog).getByLabelText(/^Nom/), 'Feki');
    await user.click(within(dialog).getByRole('combobox', { name: /Classe/ }));
    await user.click(screen.getByRole('option', { name: '1re primaire - Marguerite' }));
    await user.type(within(dialog).getByLabelText(/Téléphone d’un parent/), '06 39 98 12 34');
    await user.click(within(group).getByRole('radio', { name: 'Cantine' }));
    await user.click(within(group).getByRole('radio', { name: 'Panier' }));
    // Choisir « Panier » désélectionne « Cantine » : jamais les deux.
    expect(within(group).getByRole('radio', { name: 'Cantine' })).not.toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Panier' })).toBeChecked();

    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer l’élève' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')).toMatchObject({
        url: '/api/admin/students',
        body: { firstName: 'Malak', lastName: 'Feki', classId: 'c9', parentPhone: '06 39 98 12 34', mealService: 'PANIER' },
      }),
    );
  });

  it('modification : le service actuel est présélectionné et modifiable', async () => {
    const user = userEvent.setup();
    const { calls } = setup((url, method, body) => (url === '/api/admin/students/s2' && method === 'PATCH' ? json(200, { ...STUDENTS[1], ...(body as object) }) : undefined));
    await user.click(await screen.findByRole('button', { name: 'Modifier l’élève Adam Zribi' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modifier : Adam Zribi' });
    expect(within(dialog).getByRole('radio', { name: 'Panier' })).toBeChecked();
    await user.click(within(dialog).getByRole('radio', { name: 'Cantine' }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer l’élève' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ url: '/api/admin/students/s2', body: { mealService: 'CANTINE', classId: 'c1' } }));
  });
});
