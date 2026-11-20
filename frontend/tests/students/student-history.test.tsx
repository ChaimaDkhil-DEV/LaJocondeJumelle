import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminRoutes } from '../../src/features/admin/adminRoutes';

/**
 * Historique des classes d'un élève (021, US1) : tiroir ouvert depuis la liste des élèves, périodes de la plus
 * récente à la plus ancienne, avertissement « non garantie » écrit en toutes lettres pour une période reconstituée.
 */

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const ADMIN = { id: 'ad', displayName: 'Direction', role: 'SUPER_ADMIN', permissions: [], mustChangePassword: false };
const LEVELS = [
  { id: 'l1', name: '1re primaire', cycle: 'PRIMARY', position: 3, classes: [{ id: 'c1', name: 'CP Violet', room: 'Salle 12', floor: { id: 'f1', name: '1er étage' }, studentCount: 1 }] },
];
const STUDENTS = [
  { id: 's1', firstName: 'Aya', lastName: 'Ben Ali', parentPhone: '06 39 98 00 01', active: true, class: { id: 'c1', name: 'CP Violet', level: { id: 'l1', name: '1re primaire', position: 3 } } },
];
const klass = (name: string) => ({ id: name, name, level: '1re primaire', floor: '1er étage', room: 'Salle 12' });
const HISTORY = {
  studentId: 's1',
  items: [
    { id: 'h2', class: klass('CP Violet'), startedAt: '2026-11-12T08:30:00.000Z', endedAt: null, changedBy: { id: 'u1', displayName: 'Direction' }, reconstructed: false, availability: 'KNOWN', probableUntil: null, warning: null },
    { id: 'h1', class: klass('CP Bleu'), startedAt: '2026-09-01T07:00:00.000Z', endedAt: '2026-11-12T08:30:00.000Z', changedBy: null, reconstructed: true, availability: 'PROBABLE', probableUntil: '2026-11-20T10:00:00.000Z', warning: 'Non garantie : des changements de classe ont pu ne pas être enregistrés avant le 20 novembre 2026.' },
  ],
};

function setup(history: () => Response = () => json(200, HISTORY)) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/me') return json(200, ADMIN);
      if (url === '/api/admin/levels') return json(200, LEVELS);
      if (url === '/api/admin/students') return json(200, STUDENTS);
      if (url === '/api/admin/students/s1/class-history') return history();
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  const router = createMemoryRouter(adminRoutes, { initialEntries: ['/admin/eleves'] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Historique des classes d’un élève', () => {
  it('s’ouvre depuis la ligne de l’élève et liste les périodes, la plus récente d’abord', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Historique de la classe de l’élève Aya Ben Ali' }));
    const drawer = await screen.findByRole('dialog', { name: /Historique de classe : Aya Ben Ali/ });
    const periods = await within(drawer).findAllByRole('listitem');
    expect(periods).toHaveLength(2);
    expect(within(periods[0]).getByText('CP Violet')).toBeInTheDocument();
    expect(within(periods[0]).getByText(/Classe actuelle/)).toBeInTheDocument();
    expect(within(periods[0]).getByText(/Direction/)).toBeInTheDocument();
    expect(within(periods[1]).getByText('CP Bleu')).toBeInTheDocument();
  });

  it('une période reconstituée porte son avertissement écrit, pas seulement une couleur', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Historique de la classe de l’élève Aya Ben Ali' }));
    const drawer = await screen.findByRole('dialog', { name: /Historique de classe/ });
    const periods = await within(drawer).findAllByRole('listitem');
    expect(within(periods[1]).getByText('Probable')).toBeInTheDocument();
    expect(within(periods[1]).getByText(/Non garantie/)).toBeInTheDocument();
    expect(within(periods[0]).queryByText('Probable')).not.toBeInTheDocument();
  });

  it('une erreur de chargement propose de réessayer', async () => {
    const user = userEvent.setup();
    let calls = 0;
    setup(() => (++calls === 1 ? json(500, { error: { code: 'INTERNAL', message: 'Erreur' } }) : json(200, HISTORY)));
    await user.click(await screen.findByRole('button', { name: 'Historique de la classe de l’élève Aya Ben Ali' }));
    const drawer = await screen.findByRole('dialog', { name: /Historique de classe/ });
    await user.click(await within(drawer).findByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(within(drawer).getAllByRole('listitem')).toHaveLength(2));
  });

  it('se ferme par le bouton Fermer', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Historique de la classe de l’élève Aya Ben Ali' }));
    const drawer = await screen.findByRole('dialog', { name: /Historique de classe/ });
    await user.click(within(drawer).getByRole('button', { name: 'Fermer l’historique' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Historique de classe/ })).not.toBeInTheDocument());
  });
});
