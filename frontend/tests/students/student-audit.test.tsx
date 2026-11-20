import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminRoutes } from '../../src/features/admin/adminRoutes';
import { AUDIT_ACTION_LABELS } from '../../src/features/admin/labels';

/**
 * Journal d'un élève (021, US4) : modifications de sa fiche et consultations de sa situation, ouvert depuis le tiroir ;
 * libellé de l'action « situation consultée » dans le journal d'audit.
 */

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const ADMIN = { id: 'ad', displayName: 'Direction', role: 'SUPER_ADMIN', permissions: [], mustChangePassword: false };
const LEVELS = [{ id: 'l1', name: '1re primaire', cycle: 'PRIMARY', position: 3, classes: [{ id: 'c1', name: 'CP Violet', room: 'Salle 12', floor: { id: 'f1', name: '1er étage' }, studentCount: 1 }] }];
const STUDENTS = [{ id: 's1', firstName: 'Aya', lastName: 'Ben Ali', parentPhone: '06 39 98 00 01', active: true, class: { id: 'c1', name: 'CP Violet', level: { id: 'l1', name: '1re primaire', position: 3 } } }];
const entry = (id: string, action: string, details: unknown, at: string) => ({ id, action, actor: { id: 'ad', displayName: 'Direction' }, targetType: 'Student', targetId: 's1', details, ip: '127.0.0.1', createdAt: at });
const PAGE_1 = { items: [entry('a2', 'STUDENT_SITUATION_VIEWED', { studentId: 's1', at: '2026-11-12T10:42' }, '2026-11-20T10:00:00.000Z')], nextCursor: 'curseur' };
const PAGE_2 = { items: [entry('a1', 'STUDENT_CHANGED', { action: 'update', fields: ['classId'], before: { classId: 'A' }, after: { classId: 'B' } }, '2026-11-12T08:30:00.000Z')], nextCursor: null };

function setup() {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url === '/api/auth/me') return json(200, ADMIN);
      if (url === '/api/admin/levels') return json(200, LEVELS);
      if (url === '/api/admin/students') return json(200, STUDENTS);
      if (url === '/api/admin/students/s1/class-history') return json(200, { studentId: 's1', items: [] });
      if (url === '/api/admin/students/s1/audit') return json(200, PAGE_1);
      if (url === '/api/admin/students/s1/audit?cursor=curseur') return json(200, PAGE_2);
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

describe('Journal de l’élève', () => {
  it('ne charge le journal qu’à la demande, puis liste consultations et modifications avec leur auteur', async () => {
    const user = userEvent.setup();
    const { urls } = setup();
    await user.click(await screen.findByRole('button', { name: 'Historique de la classe de l’élève Aya Ben Ali' }));
    const drawer = await screen.findByRole('dialog', { name: /Historique de classe/ });
    expect(urls).not.toContain('/api/admin/students/s1/audit');
    await user.click(within(drawer).getByRole('button', { name: 'Journal de l’élève' }));
    const list = await within(drawer).findByRole('list', { name: 'Journal de l’élève' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(within(items[0]).getByText(/Situation d’un élève consultée/)).toBeInTheDocument();
    expect(within(items[0]).getByText(/Direction/)).toBeInTheDocument();
  });

  it('charge la suite avec « Afficher plus » et affiche l’avant et l’après d’un changement de classe', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Historique de la classe de l’élève Aya Ben Ali' }));
    const drawer = await screen.findByRole('dialog', { name: /Historique de classe/ });
    await user.click(within(drawer).getByRole('button', { name: 'Journal de l’élève' }));
    await user.click(await within(drawer).findByRole('button', { name: 'Afficher plus' }));
    await waitFor(() => expect(within(within(drawer).getByRole('list', { name: 'Journal de l’élève' })).getAllByRole('listitem')).toHaveLength(2));
    expect(within(drawer).getByText(/Élève créé \/ modifié/)).toBeInTheDocument();
    expect(within(drawer).getByText(/classId/)).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Afficher plus' })).not.toBeInTheDocument();
  });

  it('le journal d’audit général connaît l’action « situation consultée »', () => {
    expect(AUDIT_ACTION_LABELS.STUDENT_SITUATION_VIEWED).toBe('Situation d’un élève consultée');
  });
});
