import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminRoutes } from '../../src/features/admin/adminRoutes';

/** T019 (spec 009, US3) — onglet « Consignes » de l'espace Administrateur. */

type Call = { url: string; method: string; body: unknown };
type Handler = (url: string, method: string, body: unknown) => Response | undefined;

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const SUPER_ADMIN = { id: 'sa', displayName: 'Super administrateur', role: 'SUPER_ADMIN', permissions: [], mustChangePassword: false };

const CATEGORIES = [
  { id: 'c1', name: 'Photocopies', active: true, kind: 'WORK' },
  { id: 'c2', name: 'Garde', active: true, kind: 'COVERAGE' },
  { id: 'c3', name: 'Ancienne', active: false, kind: 'WORK' },
];

const GUIDELINES = [
  {
    id: 'g1',
    title: 'Panne de photocopieuse',
    body: 'Une photocopieuse en panne : Priorité : Haute.',
    categoryId: 'c1',
    categoryName: 'Photocopies',
    active: true,
    updatedAt: '2026-10-20T08:00:00.000Z',
    updatedBy: { id: 'sa', displayName: 'Super administrateur' },
  },
  {
    id: 'g2',
    title: 'Règle générale',
    body: 'Préciser la salle.',
    categoryId: null,
    categoryName: null,
    active: false,
    updatedAt: '2026-10-21T08:00:00.000Z',
    updatedBy: { id: 'sa', displayName: 'Super administrateur' },
  },
];

function setup(path: string, handler: Handler = () => undefined, me: unknown = SUPER_ADMIN) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body });
      const custom = handler(url, method, body);
      if (custom) return custom;
      if (url === '/api/auth/me') return json(200, me);
      if (url === '/api/admin/guidelines' && method === 'GET') return json(200, GUIDELINES);
      if (url === '/api/admin/categories' && method === 'GET') return json(200, CATEGORIES);
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  const router = createMemoryRouter(adminRoutes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { calls, router };
}

describe('Consignes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('affiche l’onglet « Consignes » dans la navigation de l’espace', async () => {
    setup('/admin/consignes');
    const nav = await screen.findByRole('navigation', { name: 'Sections de l’espace Administrateur' });
    expect(within(nav).getByRole('link', { name: 'Consignes' })).toHaveAttribute('href', '/admin/consignes');
    expect(await screen.findByRole('heading', { name: 'Consignes' })).toBeVisible();
  });

  it('liste les consignes avec leur portée et leur état', async () => {
    setup('/admin/consignes');
    const list = await screen.findByRole('list', { name: 'Consignes' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('Panne de photocopieuse')).toBeVisible();
    expect(within(items[0]!).getByText('Photocopies')).toBeVisible();
    expect(within(items[0]!).getByText('Active')).toBeVisible();
    expect(within(items[1]!).getByText('Générale')).toBeVisible();
    expect(within(items[1]!).getByText('Inactive')).toBeVisible();
  });

  it('affiche « Aucune consigne. » quand la liste est vide', async () => {
    setup('/admin/consignes', (url, method) => (url === '/api/admin/guidelines' && method === 'GET' ? json(200, []) : undefined));
    expect(await screen.findByText('Aucune consigne.')).toBeVisible();
  });

  it('affiche une erreur avec « Réessayer », qui recharge la liste', async () => {
    let fail = true;
    setup('/admin/consignes', (url, method) =>
      url === '/api/admin/guidelines' && method === 'GET' && fail ? json(500, { error: { code: 'INTERNAL', message: 'Erreur.' } }) : undefined,
    );
    expect(await screen.findByText('Impossible de charger les consignes.')).toBeVisible();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Panne de photocopieuse')).toBeVisible();
  });

  it('valide le formulaire puis crée une consigne générale', async () => {
    const { calls } = setup('/admin/consignes', (url, method, body) =>
      url === '/api/admin/guidelines' && method === 'POST' ? json(201, { ...GUIDELINES[1], ...(body as object), id: 'g3' }) : undefined,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Nouvelle consigne' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle consigne' });
    expect(within(dialog).getByText(/Priorité : Haute/)).toBeVisible();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la consigne' }));
    expect(await within(dialog).findByText('Le titre est obligatoire.')).toBeVisible();
    expect(within(dialog).getByText('Le texte est obligatoire.')).toBeVisible();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    await userEvent.type(within(dialog).getByLabelText(/Titre/), '  Salle informatique  ');
    await userEvent.type(within(dialog).getByLabelText(/Texte/), 'Indiquer le numéro du poste.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la consigne' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')).toMatchObject({
        url: '/api/admin/guidelines',
        body: { title: 'Salle informatique', body: 'Indiquer le numéro du poste.', categoryId: null, active: true },
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('ne propose comme portée que « Générale » et les catégories de demande de travail actives', async () => {
    const { calls } = setup('/admin/consignes', (url, method, body) =>
      url === '/api/admin/guidelines' && method === 'POST' ? json(201, { ...GUIDELINES[0], ...(body as object), id: 'g3' }) : undefined,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Nouvelle consigne' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle consigne' });
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Portée/ }));
    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Générale', 'Photocopies']);
    await userEvent.click(within(listbox).getByRole('option', { name: 'Photocopies' }));

    await userEvent.type(within(dialog).getByLabelText(/Titre/), 'Toner');
    await userEvent.type(within(dialog).getByLabelText(/Texte/), 'Toner vide : Priorité : Moyenne.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la consigne' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')).toMatchObject({ body: { categoryId: 'c1' } }));
  });

  it('affiche l’erreur du serveur sous le champ concerné', async () => {
    setup('/admin/consignes', (url, method) =>
      url === '/api/admin/guidelines' && method === 'POST'
        ? json(400, {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Certains champs sont invalides.',
              details: { fields: [{ field: 'categoryId', messages: ['Choisissez une catégorie de demande de travail.'] }] },
            },
          })
        : undefined,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Nouvelle consigne' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle consigne' });
    await userEvent.type(within(dialog).getByLabelText(/Titre/), 'Toner');
    await userEvent.type(within(dialog).getByLabelText(/Texte/), 'Toner vide.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la consigne' }));
    expect(await within(dialog).findByText('Choisissez une catégorie de demande de travail.')).toBeVisible();
  });

  it('modifie une consigne existante', async () => {
    const { calls } = setup('/admin/consignes', (url, method, body) =>
      url === '/api/admin/guidelines/g1' && method === 'PATCH' ? json(200, { ...GUIDELINES[0], ...(body as object) }) : undefined,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Modifier la consigne Panne de photocopieuse' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modifier : Panne de photocopieuse' });
    const title = within(dialog).getByLabelText(/Titre/);
    expect(title).toHaveValue('Panne de photocopieuse');
    await userEvent.clear(title);
    await userEvent.type(title, 'Photocopieuse hors service');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer la consigne' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({
        url: '/api/admin/guidelines/g1',
        body: { title: 'Photocopieuse hors service', categoryId: 'c1', active: true },
      }),
    );
  });

  it('active et désactive une consigne', async () => {
    const { calls } = setup('/admin/consignes', (url, method, body) => {
      if (url === '/api/admin/guidelines/g1' && method === 'PATCH') return json(200, { ...GUIDELINES[0], ...(body as object) });
      if (url === '/api/admin/guidelines/g2' && method === 'PATCH') return json(200, { ...GUIDELINES[1], ...(body as object) });
      return undefined;
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Désactiver la consigne Panne de photocopieuse' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ url: '/api/admin/guidelines/g1', body: { active: false } }));
    await userEvent.click(screen.getByRole('button', { name: 'Activer la consigne Règle générale' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'PATCH')[1]).toMatchObject({ url: '/api/admin/guidelines/g2', body: { active: true } }),
    );
  });

  it('demande une confirmation avant de supprimer une consigne', async () => {
    const { calls } = setup('/admin/consignes', (url, method) =>
      url === '/api/admin/guidelines/g1' && method === 'DELETE' ? new Response(null, { status: 204 }) : undefined,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer la consigne Panne de photocopieuse' }));
    let dialog = await screen.findByRole('dialog', { name: 'Supprimer cette consigne ?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer la consigne Panne de photocopieuse' }));
    dialog = await screen.findByRole('dialog', { name: 'Supprimer cette consigne ?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer la consigne' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'DELETE')).toMatchObject({ url: '/api/admin/guidelines/g1' }));
  });

  it('refuse l’onglet à un admin, sans appeler les routes /admin', async () => {
    const { calls } = setup('/admin/consignes', undefined, { ...SUPER_ADMIN, id: 'm1', role: 'ADMIN' });
    expect(await screen.findByText('Accès réservé au super administrateur.')).toBeVisible();
    expect(calls.some((c) => c.url.startsWith('/api/admin'))).toBe(false);
  });

  it('libelle GUIDELINE_CHANGED dans le journal d’audit', async () => {
    setup('/admin/journal', (url) =>
      url.startsWith('/api/admin/audit')
        ? json(200, {
            items: [
              {
                id: 'a1',
                action: 'GUIDELINE_CHANGED',
                actor: { id: 'sa', displayName: 'Super administrateur' },
                targetType: 'Guideline',
                targetId: 'g1',
                details: { action: 'CREATED', guidelineId: 'g1', title: 'Panne de photocopieuse' },
                ip: null,
                createdAt: '2026-10-20T08:00:00.000Z',
              },
            ],
            nextCursor: null,
          })
        : url === '/api/admin/users'
          ? json(200, [])
          : undefined,
    );
    expect(await screen.findByText('Consigne créée : Panne de photocopieuse')).toBeVisible();
  });
});
