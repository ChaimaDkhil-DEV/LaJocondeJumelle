import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminRoutes } from '../../src/features/admin/adminRoutes';

/**
 * T036 — Étages (004, FR-006, FR-006a) : écran du super administrateur, avertissement « étage sans
 * surveillant » non bloquant, étage obligatoire d'une classe ; accessibilité (libellés, erreurs).
 */

type Call = { url: string; method: string; body: unknown };
type Handler = (url: string, method: string, body: unknown) => Response | undefined;

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SUPER_ADMIN = {
  id: 'sa',
  displayName: 'Super administrateur',
  role: 'SUPER_ADMIN',
  permissions: [],
  mustChangePassword: false,
};

const FLOORS = [
  {
    id: 'f1',
    name: '1er étage',
    position: 1,
    active: true,
    supervisorCount: 2,
    classCount: 1,
    warning: null,
  },
  {
    id: 'f2',
    name: '2e étage',
    position: 2,
    active: true,
    supervisorCount: 0,
    classCount: 1,
    warning: 'NO_SUPERVISOR',
  },
];

const CLASSES = [
  {
    id: 'k1',
    name: '1ère année Violet',
    room: 'Salle 12',
    active: true,
    qrVersion: 1,
    updatedAt: '2026-10-20T08:00:00.000Z',
    floor: { id: 'f1', name: '1er étage' },
  },
];

function setup(path: string, handler: Handler = () => undefined) {
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
      if (url === '/api/admin/floors' && method === 'GET') return json(200, FLOORS);
      if (url === '/api/admin/coverage/classes' && method === 'GET') return json(200, CLASSES);
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  const router = createMemoryRouter(adminRoutes, { initialEntries: [path] });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { calls };
}

afterEach(() => vi.unstubAllGlobals());

describe('Étages (super administrateur)', () => {
  it('liste les étages avec leurs surveillants ; « Étage sans surveillant » signalé sans bloquer', async () => {
    setup('/admin/etages');
    expect(await screen.findByRole('heading', { name: 'Étages' })).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Étages' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('1er étage')).toBeInTheDocument();
    expect(within(items[0]).getByText(/2 surveillants · 1 classe/)).toBeInTheDocument();
    expect(within(items[1]).getByText('Étage sans surveillant')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Étages' })).toHaveAttribute('aria-current', 'page');
  });

  it('création : nom obligatoire signalé sur le champ, puis envoi du nom et de la position', async () => {
    const user = userEvent.setup();
    const { calls } = setup('/admin/etages', (url, method) =>
      url === '/api/admin/floors' && method === 'POST'
        ? json(201, [
            ...FLOORS,
            {
              id: 'f3',
              name: '3e étage',
              position: 3,
              active: true,
              supervisorCount: 0,
              classCount: 0,
              warning: 'NO_SUPERVISOR',
            },
          ])
        : undefined,
    );
    await user.click(await screen.findByRole('button', { name: 'Nouvel étage' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvel étage' });
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer l’étage' }));
    const name = within(dialog).getByLabelText(/Nom de l’étage/);
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByText('Le nom est obligatoire.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);

    await user.type(name, '3e étage');
    await user.clear(within(dialog).getByLabelText(/Ordre d’affichage/));
    await user.type(within(dialog).getByLabelText(/Ordre d’affichage/), '3');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer l’étage' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')).toMatchObject({
        url: '/api/admin/floors',
        body: { name: '3e étage', position: 3 },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Nouvel étage' })).not.toBeInTheDocument(),
    );
  });

  it('désactivation et erreur du serveur affichée dans le dialogue', async () => {
    const user = userEvent.setup();
    const { calls } = setup('/admin/etages', (url, method) =>
      url === '/api/admin/floors/f1' && method === 'PATCH'
        ? json(409, { error: { code: 'CONFLICT', message: 'Cet étage existe déjà.' } })
        : undefined,
    );
    await user.click(await screen.findByRole('button', { name: 'Modifier l’étage 1er étage' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modifier : 1er étage' });
    await user.click(within(dialog).getByRole('checkbox', { name: 'Étage actif' }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer l’étage' }));
    expect(await within(dialog).findByText('Cet étage existe déjà.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({
      name: '1er étage',
      position: 1,
      active: false,
    });
  });
});

describe('Classes : étage obligatoire', () => {
  it('création refusée sans étage, puis envoi avec l’étage choisi', async () => {
    const user = userEvent.setup();
    const { calls } = setup('/admin/classes', (url, method) =>
      url === '/api/admin/coverage/classes' && method === 'POST' ? json(201, CLASSES) : undefined,
    );
    await user.click(await screen.findByRole('button', { name: 'Nouvelle classe' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle classe' });
    await user.type(within(dialog).getByLabelText(/Nom de la classe/), 'CE1 Vert');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer la classe' }));
    expect(within(dialog).getByText('Choisissez l’étage de la classe.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);

    await user.click(within(dialog).getByRole('combobox', { name: /Étage/ }));
    await user.click(await screen.findByRole('option', { name: '2e étage' }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer la classe' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')).toMatchObject({
        body: { name: 'CE1 Vert', floorId: 'f2', active: true },
      }),
    );
  });

  it('l’étage de chaque classe est affiché', async () => {
    setup('/admin/classes');
    expect(await screen.findByText(/Salle 12 · 1er étage/)).toBeInTheDocument();
  });
});
