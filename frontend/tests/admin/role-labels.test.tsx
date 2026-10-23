import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminRoutes } from '../../src/features/admin/adminRoutes';
import {
  ASSIGNMENT_LABELS,
  AUDIT_ACTION_LABELS,
  CLOSURE_LABELS,
  ROLE_LABELS,
} from '../../src/features/admin/labels';
import { NOTIFICATION_LABELS } from '../../src/features/notifications/api';

/** T043 — US4 : « Admin » remplace « Responsable » ; l'espace du super administrateur s'appelle « Administrateur » (FR-004 à FR-004c). */

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
const USERS = [
  {
    id: 'm1',
    username: 'admin',
    displayName: 'Admin — surveillante générale',
    jobTitle: 'Direction',
    role: 'ADMIN',
    active: true,
    mustChangePassword: false,
    createdAt: '2026-09-01T08:00:00.000Z',
    recipientCategories: [],
  },
];

function setup(path: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/me') return json(200, SUPER_ADMIN);
      if (url === '/api/admin/users') return json(200, USERS);
      if (url === '/api/admin/categories') return json(200, []);
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={createMemoryRouter(adminRoutes, { initialEntries: [path] })} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Libellés du rôle Admin', () => {
  it('rôles, modes de clôture et d’affectation, journal, notifications', () => {
    expect(ROLE_LABELS).toEqual({
      EMPLOYEE: 'Employé',
      ADMIN: 'Admin',
      SUPER_ADMIN: 'Super administrateur',
    });
    expect(CLOSURE_LABELS.MANAGER).toBe('Par un admin');
    expect(ASSIGNMENT_LABELS.MANUAL).toBe('Choisie par un admin');
    expect(AUDIT_ACTION_LABELS.COVERAGE_MANAGED).toBe('Affectation gérée par un admin');
    expect(AUDIT_ACTION_LABELS.COVERAGE_STATS_EXPORTED).toBe(
      'Export des statistiques des affectations',
    );
    expect(NOTIFICATION_LABELS.UNASSIGNED).toBe('Demande sans employé affecté');
    const all = [
      CLOSURE_LABELS,
      ASSIGNMENT_LABELS,
      AUDIT_ACTION_LABELS,
      NOTIFICATION_LABELS,
    ].flatMap((l) => Object.values(l));
    for (const label of all) expect(label).not.toMatch(/responsable/i);
  });

  it('l’espace du super administrateur s’appelle « Administrateur »', async () => {
    setup('/admin/comptes');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Administrateur' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Sections de l’espace Administrateur' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Admin — surveillante générale')).toBeInTheDocument();
    expect(screen.queryByText(/responsable/i)).not.toBeInTheDocument();
  });

  it('formulaire de catégorie : « Admins de la catégorie », « Validation finale par un admin », clôture « Par un admin »', async () => {
    const user = userEvent.setup();
    setup('/admin/categories');
    await user.click(await screen.findByRole('button', { name: 'Nouvelle catégorie' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle catégorie' });
    await user.click(within(dialog).getByRole('radio', { name: /Via l’administration/ }));
    expect(
      within(dialog).getByRole('checkbox', { name: 'Validation finale par un admin' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('combobox', { name: 'Admins de la catégorie' }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/responsable/i)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('combobox', { name: 'Clôture' }));
    expect(await screen.findByRole('option', { name: 'Par un admin' })).toBeInTheDocument();
  });
});
