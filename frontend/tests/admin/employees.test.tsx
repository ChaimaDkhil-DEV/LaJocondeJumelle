import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAvatarStore } from '../../src/api/avatars';
import { HomePage } from '../../src/features/home/HomePage';

/** Onglet « Employés » du tableau de bord : liste épurée, recherche, pagination, détail, actions. */

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const SUPER_ADMIN = { id: 'sa', displayName: 'Super administrateur', role: 'SUPER_ADMIN', permissions: [], mustChangePassword: false };
const stats = (avgMs: number | null, count: number) => ({ avgMs, count });

/** 12 employés : le 3e a 2 demandes en retard, le 5e est désactivé. */
const EMPLOYEES = Array.from({ length: 12 }, (_, i) => ({
  user: {
    id: `e${i + 1}`,
    displayName: i === 0 ? 'Reprographie' : `Employé ${String(i + 1).padStart(2, '0')}`,
    jobTitle: i === 0 ? 'Service reprographie' : i === 1 ? 'Agent d’entretien' : null,
    role: i === 1 ? 'ADMIN' : 'EMPLOYEE',
    active: i !== 4,
  },
  created: i,
  assigned: 2,
  pendingTakeover: 3,
  inProgress: 1,
  done: 5,
  overdueNow: i === 2 ? 2 : 0,
  overdueInPeriod: i === 2 ? 3 : 0,
  takeover: stats(4 * 60_000, 3),
  resolution: stats(90 * 60_000, 2),
  lastActionAt: '2026-10-16T09:00:00.000Z',
}));
const ACCOUNTS = EMPLOYEES.map((e) => ({
  ...e.user,
  username: e.user.id,
  mustChangePassword: false,
  createdAt: '2026-09-01T08:00:00.000Z',
  recipientCategories: [],
}));

type Call = { url: string; method: string; body: unknown };

/** Largeur d'écran simulée pour useMediaQuery : grand écran (tableau) ou mobile (cartes). */
function screenWidth(desktop: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: desktop ? query.includes('min-width') : query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })),
  );
}

function setup(desktop = true): Call[] {
  screenWidth(desktop);
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method, body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body });
      if (url === '/api/auth/me') return json(200, SUPER_ADMIN);
      if (url === '/api/admin/users') return json(200, ACCOUNTS);
      if (url.startsWith('/api/admin/users/') && method === 'PATCH') return json(200, ACCOUNTS[0]);
      if (url === '/api/admin/categories') return json(200, []);
      if (url.startsWith('/api/admin/dashboard/employees')) return json(200, { items: EMPLOYEES });
      if (url === '/api/users/avatars') return json(200, []);
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  const router = createMemoryRouter([{ path: '/', element: <HomePage /> }], { initialEntries: ['/?vue=employes'] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return calls;
}

/** Premier rendu de l'onglet plus lent (chargement des modules) : attente élargie. */
const table = () => screen.findByRole('table', { name: 'Employés' }, { timeout: 4000 });

describe('Onglet « Employés »', () => {
  beforeAll(() => {
    // MUI Popover/Menu : positionnement dans jsdom.
    Element.prototype.scrollTo ??= () => undefined;
  });
  beforeEach(() => resetAvatarStore());
  afterEach(() => vi.unstubAllGlobals());

  it('tableau épuré : 5 colonnes, charge compacte, retard seulement s’il y en a, statut', async () => {
    setup();
    const t = await table();
    const headers = within(t).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['', 'Employé', 'Fonction / Rôle', 'Charge de travail', 'Alertes', 'Statut', 'Actions']);
    expect(screen.getByRole('heading', { name: 'Employés' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nouvel employé' })).toBeVisible();

    const rows = within(t).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toHaveTextContent('Service reprographie');
    expect(rows[0]).toHaveTextContent('3 à prendre·1 en cours·5 terminées');
    expect(within(rows[0]).queryByText(/en retard/)).not.toBeInTheDocument();
    expect(within(rows[2]).getByText('2 en retard')).toBeVisible();
    expect(within(rows[4]).getByText('Désactivé')).toBeVisible();
    expect(within(rows[1]).getByText('Admin')).toBeVisible();
    // Les indicateurs secondaires ne sont plus dans le tableau.
    expect(within(t).queryByText('Dernière action')).not.toBeInTheDocument();
  });

  it('pagination en français : 1–10 sur 12, page suivante', async () => {
    const user = userEvent.setup();
    setup();
    await table();
    expect(screen.getByText('1–10 sur 12')).toBeVisible();
    expect(screen.getByText('Lignes par page :')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Page suivante' }));
    expect(screen.getByText('11–12 sur 12')).toBeVisible();
    expect(within(await table()).getAllByRole('row').slice(1)).toHaveLength(2);
  });

  it('recherche sans accents ni casse ; aucun résultat : « Aucun employé trouvé » et retour', async () => {
    const user = userEvent.setup();
    setup();
    await table();
    await user.type(screen.getByRole('textbox', { name: 'Rechercher un employé' }), 'AGENT D’ENTRETIEN');
    expect(within(await table()).getAllByRole('row').slice(1)).toHaveLength(1);
    await user.clear(screen.getByRole('textbox', { name: 'Rechercher un employé' }));
    await user.type(screen.getByRole('textbox', { name: 'Rechercher un employé' }), 'personne de ce nom');
    expect(await screen.findByText('Aucun employé trouvé')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Effacer la recherche et les filtres' }));
    expect(await screen.findByText('1–10 sur 12')).toBeVisible();
  });

  it('filtre de statut : « Désactivé » ne garde que le compte désactivé', async () => {
    const user = userEvent.setup();
    setup();
    await table();
    await user.click(screen.getByRole('button', { name: 'Filtres des employés' }));
    const dialog = screen.getByRole('dialog', { name: 'Filtres des employés' });
    await user.click(within(dialog).getByRole('combobox', { name: 'Statut' }));
    await user.click(screen.getByRole('option', { name: 'Désactivé' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Employés' })).getAllByRole('row').slice(1)).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Filtres des employés (1)' })).toBeVisible();
  });

  it('clic sur une ligne (ou sur le nom) : panneau de détail avec les indicateurs secondaires', async () => {
    const user = userEvent.setup();
    setup();
    const t = await table();
    await user.click(within(t).getAllByRole('row')[3]);
    const drawer = await screen.findByRole('dialog', { name: 'Employé 03' });
    expect(within(drawer).getByText('Créées').nextSibling).toHaveTextContent('2');
    expect(within(drawer).getByText('Prise en charge').nextSibling).toHaveTextContent('4 min');
    expect(within(drawer).getByText('Traitement net').nextSibling).toHaveTextContent('1 h 30');
    expect(within(drawer).getByText('Dernière action')).toBeVisible();
    expect(within(drawer).getByText('3 sur la période')).toBeVisible();
    await user.click(within(drawer).getByRole('button', { name: 'Fermer le détail' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Employé 03' })).not.toBeInTheDocument());
    // Au clavier : le nom est un bouton.
    // Le reste de la page redevient accessible à la fin de l'animation de fermeture.
    await user.click(await screen.findByRole('button', { name: 'Reprographie, voir le détail' }));
    expect(await screen.findByRole('dialog', { name: 'Reprographie' })).toBeVisible();
  });

  it('menu « ⋮ » : voir le détail, modifier, changer la photo, désactiver', async () => {
    const user = userEvent.setup();
    setup();
    await table();
    await user.click(screen.getByRole('button', { name: 'Actions pour Employé 04' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Voir le détail', 'Modifier', 'Changer la photo', 'Désactiver']);
    await user.click(within(menu).getByRole('menuitem', { name: 'Changer la photo' }));
    expect(await screen.findByRole('dialog', { name: 'Changer la photo' })).toBeVisible();
  });

  it('sélection : actions groupées ; désactivation confirmée, une requête par compte actif', async () => {
    const user = userEvent.setup();
    const calls = setup();
    await table();
    expect(screen.queryByRole('region', { name: 'Actions sur la sélection' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner Employé 04' }));
    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner Employé 05' }));
    const bar = screen.getByRole('region', { name: 'Actions sur la sélection' });
    expect(bar).toHaveTextContent('2 sélectionnés');
    expect(within(bar).getByRole('button', { name: 'Exporter' })).toBeVisible();
    await user.click(within(bar).getByRole('button', { name: 'Désactiver' }));
    // Employé 05 est déjà désactivé : seul Employé 04 est concerné.
    const confirm = await screen.findByRole('dialog', { name: 'Désactiver ce compte ?' });
    await user.click(within(confirm).getByRole('button', { name: 'Désactiver le compte' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toEqual([{ url: '/api/admin/users/e4', method: 'PATCH', body: { active: false } }]));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Actions sur la sélection' })).not.toBeInTheDocument());
  });

  it('mobile : une carte par employé (avatar, nom, statut, retard), pas de tableau', async () => {
    const user = userEvent.setup();
    setup(false);
    const list = await screen.findByRole('list', { name: 'Employés' });
    expect(screen.queryByRole('table', { name: 'Employés' })).not.toBeInTheDocument();
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(10);
    expect(within(cards[2]).getByText('2 en retard')).toBeVisible();
    expect(within(cards[4]).getByText('Désactivé')).toBeVisible();
    expect(within(cards[0]).getByText('Actif')).toBeVisible();
    await user.click(within(cards[0]).getByRole('button', { name: 'Reprographie, voir le détail' }));
    expect(await screen.findByRole('dialog', { name: 'Reprographie' })).toBeVisible();
  });
});
