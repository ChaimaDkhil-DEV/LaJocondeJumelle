import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminRoutes } from '../../src/features/admin/adminRoutes';

/** 011 (US3, FR-004, FR-011, contracts/ui.md) : liste des employés en lecture seule pour l'admin. */

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const ADMIN = { id: 'm1', displayName: 'Surveillante générale', role: 'ADMIN', permissions: [], mustChangePassword: false };

const EMPLOYEES = [
  {
    id: 'e1',
    displayName: 'Amel Ben Salah',
    jobTitle: 'Surveillante',
    role: 'EMPLOYEE',
    active: true,
    groups: [{ id: 'g2', name: 'Enseignants' }, { id: 'g1', name: 'Surveillants' }],
    floor: { id: 'f1', name: '1er étage' },
  },
  { id: 'e2', displayName: 'Karim Trabelsi', jobTitle: null, role: 'EMPLOYEE', active: false, groups: [], floor: null },
  { id: 'sa', displayName: 'Direction', jobTitle: 'Directrice', role: 'SUPER_ADMIN', active: true, groups: [], floor: null },
];

function setup(employees: () => Response = () => json(200, EMPLOYEES)) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url === '/api/auth/me') return json(200, ADMIN);
      if (url === '/api/admin/employees') return employees();
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  const router = createMemoryRouter(adminRoutes, { initialEntries: ['/admin/employes'] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { urls };
}

afterEach(() => vi.unstubAllGlobals());

describe('Page « Employés » (admin)', () => {
  it('liste chaque employé avec nom, fonction, rôle, groupes, étage et statut', async () => {
    const { urls } = setup();
    expect(await screen.findByRole('heading', { name: 'Employés' })).toBeVisible();
    const list = await screen.findByRole('list', { name: 'Liste des employés' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);

    const amel = within(items[0]);
    expect(amel.getByText('Amel Ben Salah')).toBeVisible();
    expect(amel.getByText('Surveillante')).toBeVisible();
    expect(amel.getByText('Employé')).toBeVisible();
    expect(amel.getByText('Groupes : Enseignants, Surveillants')).toBeVisible();
    expect(amel.getByText('Étage : 1er étage')).toBeVisible();
    expect(amel.getByText('Actif')).toBeVisible();

    const karim = within(items[1]);
    expect(karim.getByText('Groupes : —')).toBeVisible();
    expect(karim.getByText('Étage : —')).toBeVisible();
    expect(karim.getByText('Inactif')).toBeVisible();

    expect(within(items[2]).getByText('Super administrateur')).toBeVisible();

    // Aucune autre donnée demandée que la liste des employés.
    expect(urls.filter((u) => u.startsWith('/api/admin'))).toEqual(['/api/admin/employees']);
  });

  it('lecture seule : aucune action sur un compte', async () => {
    setup();
    const section = (await screen.findByRole('heading', { name: 'Employés' })).closest('section')!;
    await within(section).findByRole('list', { name: 'Liste des employés' });
    expect(within(section).queryAllByRole('button')).toEqual([]);
    expect(within(section).queryAllByRole('link')).toEqual([]);
  });

  it('aucun employé : état vide', async () => {
    setup(() => json(200, []));
    expect(await screen.findByText('Aucun employé.')).toBeVisible();
  });

  it('erreur de chargement : message et bouton pour réessayer', async () => {
    let fail = true;
    setup(() => (fail ? json(500, { error: { code: 'INTERNAL', message: 'Erreur' } }) : json(200, EMPLOYEES)));
    expect(await screen.findByText('Impossible de charger les employés.')).toBeVisible();
    fail = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('list', { name: 'Liste des employés' })).toBeVisible();
  });
});
