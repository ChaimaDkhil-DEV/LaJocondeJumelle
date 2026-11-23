import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HomePage } from '../../src/features/home/HomePage';
import { filtersFromParams, formatDurationMs, indicatorLink, periodOf, priorityLink, toDashboardQuery, withFilters, DEFAULT_FILTERS } from '../../src/features/admin/dashboardApi';

/** Tableau de bord du super administrateur : données de l'API, filtres, états, onglets. */

type Handler = (url: string) => Response | undefined;

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const SUPER_ADMIN = { id: 'sa', displayName: 'Super administrateur', role: 'SUPER_ADMIN', permissions: [], mustChangePassword: false };
const USERS = [
  { id: 'e1', username: 'reprographie', displayName: 'Reprographie', jobTitle: 'Reprographie', role: 'EMPLOYEE', active: true, mustChangePassword: false, createdAt: '2026-09-01T08:00:00.000Z', recipientCategories: [] },
];
const CATEGORIES = [
  { id: 'c1', name: 'Photocopies', kind: 'WORK' },
  { id: 'c2', name: 'Gardes', kind: 'COVERAGE' },
];

const SUMMARY = {
  period: { from: '2026-09-17T00:00:00.000Z', to: '2026-10-16T23:59:59.999Z' },
  counts: { total: 12, pendingValidation: 1, pendingTakeover: 3, inProgress: 2, done: 4, rejected: 1, cancelled: 1, overdueInPeriod: 2, urgent: 5, normal: 7 },
  byStatus: [],
  current: { overdueNow: 1, urgentActive: 2, unassigned: 0 },
  byCategory: [{ category: { id: 'c1', name: 'Photocopies' }, total: 12, active: 6, done: 4, overdue: 2 }],
  messages: { text: 7, voice: 3 },
  daily: [
    { day: '2026-10-15', created: 5, completed: 2 },
    { day: '2026-10-16', created: 7, completed: 2 },
  ],
  alerts: [
    {
      id: 'r1',
      reference: 'D-2026-000001',
      title: 'Photocopies du contrôle',
      priority: 'URGENT',
      status: 'SENT',
      createdAt: '2026-10-16T08:00:00.000Z',
      currentStage: 'TAKEOVER',
      currentDueAt: '2026-10-16T08:05:00.000Z',
      overdueStage: 'TAKEOVER',
      category: { id: 'c1', name: 'Photocopies' },
      assignee: { id: 'e1', displayName: 'Reprographie' },
    },
  ],
};

const stats = (avgMs: number | null, count: number) => ({ avgMs, count });
const PERF_STATS = {
  validation: stats(null, 0),
  firstReply: stats(2 * 60_000, 2),
  takeover: stats(4 * 60_000, 3),
  resolution: stats(90 * 60_000, 2),
  grossResolution: stats(3 * 3_600_000, 2),
  compliance: { evaluated: 4, onTime: 3, rate: 0.75 },
};
const PERFORMANCE = {
  period: SUMMARY.period,
  overall: PERF_STATS,
  byPriority: ['URGENT', 'NORMAL'].map((priority) => ({ priority, total: 3, ...PERF_STATS })),
};

const ACTIVITY = {
  nextCursor: null,
  items: [
    {
      id: 'ev1',
      type: 'STATUS_CHANGED',
      createdAt: '2026-10-16T09:00:00.000Z',
      actor: { id: 'e1', displayName: 'Reprographie' },
      request: { id: 'r1', reference: 'D-2026-000001', title: 'Photocopies du contrôle' },
      details: { from: 'SENT', to: 'ACCEPTED' },
    },
    {
      id: 'ev2',
      type: 'OVERDUE',
      createdAt: '2026-10-16T08:06:00.000Z',
      actor: null,
      request: { id: 'r1', reference: 'D-2026-000001', title: 'Photocopies du contrôle' },
      details: { stage: 'TAKEOVER' },
    },
  ],
};

beforeAll(async () => {
  // Route chargée à la demande : on précharge le module (Recharts compris) pour que les délais
  // des tests ne dépendent pas du temps de transformation au premier import.
  await import('../../src/features/admin/DashboardPage');
  // jsdom n'implémente pas ResizeObserver (conteneurs adaptatifs des graphiques).
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const person = (id: string, displayName: string) => ({ id, displayName });
const REQUESTS = [
  {
    id: 'r4',
    reference: 'D-2026-000004',
    title: 'Réparation climatiseur de la salle des professeurs, au deuxième étage du bâtiment B',
    category: { id: 'c2', name: 'Petits travaux' },
    priority: 'URGENT',
    status: 'SENT',
    requester: person('sa', 'Super admin'),
    assignee: person('t1', 'Technicien'),
    createdAt: '2026-10-13T14:06:00.000Z',
    currentStage: 'TAKEOVER',
    currentDueAt: '2026-10-13T15:06:00.000Z',
    warnAt: null,
    overdueStage: 'TAKEOVER',
    hasVoice: false,
    unreadCount: 0,
  },
  {
    id: 'r1',
    reference: 'D-2026-000001',
    title: 'Photocopies du contrôle de maths',
    category: { id: 'c1', name: 'Photocopies' },
    priority: 'NORMAL',
    status: 'REJECTED',
    requester: person('e1', 'Enseignante'),
    assignee: null,
    createdAt: '2026-10-13T11:31:00.000Z',
    currentStage: null,
    currentDueAt: null,
    warnAt: null,
    overdueStage: null,
    hasVoice: false,
    unreadCount: 0,
  },
];

function setup(path = '/', handler: Handler = () => undefined, me: unknown = SUPER_ADMIN) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      const custom = handler(url);
      if (custom) return custom;
      if (url === '/api/auth/me') return json(200, me);
      if (url.startsWith('/api/admin/users?')) return json(200, { items: USERS, nextCursor: null });
      if (url === '/api/admin/categories') return json(200, CATEGORIES);
      if (url.startsWith('/api/admin/dashboard/summary')) return json(200, SUMMARY);
      if (url.startsWith('/api/admin/dashboard/performance')) return json(200, PERFORMANCE);
      if (url.startsWith('/api/admin/dashboard/activity')) return json(200, ACTIVITY);
      if (url.startsWith('/api/admin/dashboard/employees')) return json(200, { items: [] });
      if (url.startsWith('/api/requests')) return json(200, { items: REQUESTS, nextCursor: null });
      if (url.startsWith('/api/admin/dashboard/requests')) return json(200, { items: REQUESTS, nextCursor: null });
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  const router = createMemoryRouter([{ path: '/', element: <HomePage /> }], { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { urls, router };
}

/** Carte « Respect des délais » de l'onglet Délais. */
const heroCard = () => screen.getByText('Respect des délais', { selector: 'div' }).closest('.MuiPaper-root') as HTMLElement;

/** Valeur affichée dans la carte d'indicateur portant ce libellé. */
function kpi(label: string): string {
  const card = screen.getByText(label, { selector: 'div' }).closest('.MuiPaper-root') as HTMLElement;
  return within(card).getByRole('paragraph').textContent ?? '';
}

describe('Tableau de bord', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('est réservé au super administrateur : un admin voit « Mes demandes », sans appel aux routes /admin', async () => {
    const { urls } = setup('/', undefined, { ...SUPER_ADMIN, role: 'ADMIN' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Mes demandes' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Tableau de bord' })).not.toBeInTheDocument();
    expect(urls.some((u) => u.startsWith('/api/admin'))).toBe(false);
  });

  it('affiche 3 tuiles sur une ligne (total, urgentes, normales), la répartition avec son total et ses parts, et les alertes', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
    await screen.findByText('Demandes créées sur la période');
    // Une seule ligne de tuiles : le total, puis sa part urgente et sa part normale.
    expect(kpi('Total')).toBe('12');
    expect(kpi('Urgentes')).toBe('5');
    expect(kpi('Normales')).toBe('7');
    expect(screen.queryByText('Hors délai', { selector: 'div' })).toBeNull();
    // Trois tuiles de même style (fond teinté, liseré de 3 px en bas), assorties : rouge, jaune, indigo.
    const tile = (label: string) => screen.getByText(label, { selector: 'div' }).closest('.MuiPaper-root') as HTMLElement;
    expect(tile('Urgentes')).toHaveStyle({ backgroundColor: '#fee2e2', borderBottomColor: '#b91c1c', borderBottomWidth: '3px' });
    expect(tile('Normales')).toHaveStyle({ backgroundColor: '#fefce8', borderBottomColor: '#a16207', borderBottomWidth: '3px' });
    expect(tile('Total')).toHaveStyle({ backgroundColor: '#e8eafd', borderBottomColor: '#4f46e5', borderBottomWidth: '3px' });
    // Aucune n'est pleine : le texte garde la couleur normale sur les trois.
    for (const label of ['Urgentes', 'Normales', 'Total']) expect(tile(label)).not.toHaveStyle({ color: '#ffffff' });
    // Aucun état n'est une tuile : chacun vit dans la légende de la répartition.
    for (const state of ['À valider', 'En attente de prise en charge', 'En cours', 'Terminées', 'Refusées', 'Annulées']) {
      expect(screen.queryByText(state, { selector: 'div' })).toBeNull();
    }
    const legend = within(screen.getByRole('list', { name: 'Légende : demandes par état' })).getAllByRole('listitem');
    expect(legend).toHaveLength(6);
    // Du plus fréquent au plus rare, avec la part de chaque état.
    expect(legend[0]).toHaveTextContent(/Terminées.*4.*33 %/);
    expect(legend[1]).toHaveTextContent(/En attente de prise en charge.*3.*25 %/);
    expect(legend[2]).toHaveTextContent(/En cours.*2.*17 %/);
    expect(within(legend[1]).getByRole('link', { name: 'En attente de prise en charge : 3 — voir ces demandes' })).toBeVisible();
    // Total au centre de l'anneau.
    expect(screen.getByText('demandes', { selector: 'span' }).parentElement).toHaveTextContent('12demandes');
    expect(document.querySelector('dl')).toBeNull();
    expect(document.querySelector('.recharts-area')).toBeNull();

    // À traiter maintenant : pastilles-filtres avec leur effectif, tableau à 4 colonnes.
    const chips = within(screen.getByRole('group', { name: 'Filtrer les demandes à traiter' }));
    expect(chips.getAllByRole('button').map((b) => b.textContent)).toEqual(['Tout1', 'En retard1', 'Urgentes2', 'Non assignées0']);
    expect(chips.getByRole('button', { name: 'Tout 1' })).toHaveAttribute('aria-pressed', 'true');
    const alerts = screen.getByRole('table', { name: 'Demandes à traiter en priorité' });
    expect(within(alerts).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Demande', 'Priorité', 'Échéance', 'Affectée à']);
    expect(within(alerts).getByRole('link', { name: 'Photocopies du contrôle' })).toHaveAttribute('href', '/demandes/r1');
    expect(within(alerts).getByText(/^\d+ j de retard$/)).toBeVisible();
    expect(within(alerts).queryByText(/prise en charge/)).not.toBeInTheDocument();
    expect(within(alerts).getByText('D-2026-000001', { exact: false })).toHaveClass('tdb-ref');
    expect(within(alerts).getByText('Urgente')).toBeVisible();

    // Par catégorie : « hors délai / total », détail complet en infobulle.
    const category = within(screen.getByRole('list', { name: 'Demandes par catégorie' })).getByRole('listitem');
    expect(category).toHaveTextContent(/Photocopies2 hors délai sur \/ 12/);
    // Au focus clavier comme au survol : détail complet, sans les valeurs nulles.
    category.focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('12 au total · 6 à traiter · 4 terminées · 2 hors délai');
    // Vue tableau des graphiques (accessibilité).
    expect(screen.getByRole('table', { name: 'Demandes créées et terminées par jour' })).toBeInTheDocument();
  });

  it('l’ordre de la page : tuiles, puis « À traiter » et la répartition, puis les catégories, puis l’évolution', async () => {
    setup();
    await screen.findByText('Demandes créées sur la période');
    const heading = (name: string) => screen.getByRole('heading', { name });
    const before = (a: HTMLElement, b: HTMLElement) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const order = ['Demandes créées sur la période', 'À traiter maintenant', 'Répartition par état', 'Par catégorie (service)', 'Évolution quotidienne'].map(heading);
    order.slice(1).forEach((h, i) => expect(before(order[i], h)).toBe(true));
    // Pas d'aperçu d'activité dans la vue générale : l'onglet Activité a sa propre page.
    expect(screen.queryByRole('heading', { name: 'Activité récente' })).toBeNull();
  });

  it('évolution quotidienne : le nombre de messages de la période tient en une phrase, sans lien', async () => {
    setup();
    const card = (await screen.findByRole('heading', { name: 'Évolution quotidienne' })).closest('section') as HTMLElement;
    expect(within(card).getByText('Messages de la période : écrits 7, vocaux 3.')).toBeVisible();
  });

  describe('À traiter maintenant : pastilles-filtres', () => {
    const base = SUMMARY.alerts[0];
    const ALERTS = [
      { ...base, id: 'a1', title: 'Retard normal', priority: 'NORMAL', overdueStage: 'TAKEOVER' },
      { ...base, id: 'a2', title: 'Urgente à l’heure', priority: 'URGENT', overdueStage: null },
      { ...base, id: 'a3', title: 'Urgente en retard', priority: 'URGENT', overdueStage: 'TAKEOVER' },
      { ...base, id: 'a4', title: 'Sans employé', priority: 'NORMAL', overdueStage: null, assignee: null },
    ];
    const withAlerts: Handler = (url) =>
      url.startsWith('/api/admin/dashboard/summary')
        ? json(200, { ...SUMMARY, current: { overdueNow: 2, urgentActive: 2, unassigned: 1 }, alerts: ALERTS })
        : undefined;
    const titles = () => within(screen.getByRole('table', { name: 'Demandes à traiter en priorité' })).getAllByRole('link').map((l) => l.textContent);

    it('« Tout » liste toutes les alertes ; les autres pastilles les filtrent sans nouvelle requête', async () => {
      const user = userEvent.setup();
      const { urls } = setup('/', withAlerts);
      await screen.findByRole('group', { name: 'Filtrer les demandes à traiter' });
      expect(titles()).toEqual(['Retard normal', 'Urgente à l’heure', 'Urgente en retard', 'Sans employé']);

      await user.click(screen.getByRole('button', { name: 'En retard 2' }));
      expect(screen.getByRole('button', { name: 'En retard 2' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Tout 4' })).toHaveAttribute('aria-pressed', 'false');
      expect(titles()).toEqual(['Retard normal', 'Urgente en retard']);

      await user.click(screen.getByRole('button', { name: 'Urgentes 2' }));
      expect(titles()).toEqual(['Urgente à l’heure', 'Urgente en retard']);

      await user.click(screen.getByRole('button', { name: 'Non assignées 1' }));
      expect(titles()).toEqual(['Sans employé']);

      await user.click(screen.getByRole('button', { name: 'Tout 4' }));
      expect(titles()).toHaveLength(4);
      expect(urls.filter((u) => u.startsWith('/api/admin/dashboard/summary'))).toHaveLength(1);
    });

    it('une demande sans employé qui attend la validation n’est pas « non assignée » (le serveur ne la compte pas)', async () => {
      const user = userEvent.setup();
      setup('/', (url) =>
        url.startsWith('/api/admin/dashboard/summary')
          ? json(200, { ...SUMMARY, current: { overdueNow: 1, urgentActive: 0, unassigned: 0 }, alerts: [{ ...base, status: 'PENDING_ADMIN_VALIDATION', priority: 'NORMAL', assignee: null }] })
          : undefined,
      );
      await user.click(await screen.findByRole('button', { name: 'Non assignées 0' }));
      expect(screen.getByText('Aucune demande non assignée.')).toBeVisible();
    });

    it('un seul lien « voir toutes » suit la pastille active', async () => {
      const user = userEvent.setup();
      setup('/', withAlerts);
      await screen.findByRole('group', { name: 'Filtrer les demandes à traiter' });
      expect(screen.getByRole('link', { name: 'En retard : 2 — voir ces demandes' })).toBeVisible();
      expect(screen.queryByRole('link', { name: /^Urgentes en cours/ })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Urgentes 2' }));
      expect(screen.getByRole('link', { name: 'Urgentes en cours : 2 — voir ces demandes' })).toBeVisible();
      expect(screen.queryByRole('link', { name: /^En retard : 2/ })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Non assignées 1' }));
      expect(screen.getByRole('link', { name: 'Sans employé affecté : 1 — voir ces demandes' })).toBeVisible();
      expect(screen.queryByRole('link', { name: /^Urgentes en cours/ })).toBeNull();
    });

    it('une pastille sans demande à afficher le dit, au lieu d’un tableau vide', async () => {
      const user = userEvent.setup();
      setup('/', (url) =>
        url.startsWith('/api/admin/dashboard/summary')
          ? json(200, { ...SUMMARY, current: { overdueNow: 0, urgentActive: 1, unassigned: 0 }, alerts: [{ ...base, overdueStage: null }] })
          : undefined,
      );
      await user.click(await screen.findByRole('button', { name: 'En retard 0' }));
      expect(screen.getByText('Aucune demande en retard.')).toBeVisible();
      expect(screen.queryByRole('table', { name: 'Demandes à traiter en priorité' })).toBeNull();
    });
  });

  it('ne propose que les catégories de demandes de travail et relance la requête au changement de filtre', async () => {
    const user = userEvent.setup();
    const { urls } = setup();
    await screen.findByText('Demandes créées sur la période');
    await user.click(screen.getByRole('button', { name: /^Filtres/ }));
    await user.click(screen.getByRole('combobox', { name: 'Catégorie (service)' }));
    expect(screen.queryByRole('option', { name: 'Gardes' })).toBeNull();
    await user.click(screen.getByRole('option', { name: 'Photocopies' }));
    await user.click(screen.getByRole('combobox', { name: 'Priorité' }));
    await user.click(screen.getByRole('option', { name: 'Urgente' }));
    await waitFor(() => {
      const last = urls.filter((u) => u.startsWith('/api/admin/dashboard/summary')).at(-1)!;
      expect(last).toContain('categoryId=c1');
      expect(last).toContain('priority=URGENT');
      expect(last).toContain('tz=');
    });
  });

  it('demande les deux dates d’une période personnalisée avant de charger', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText('Demandes créées sur la période');
    await user.click(screen.getByRole('combobox', { name: 'Période' }));
    await user.click(screen.getByRole('option', { name: 'Personnalisée' }));
    expect(await screen.findByText('Période incomplète')).toBeVisible();
    // Les dates de la période personnalisée s'affichent d'elles-mêmes.
    expect(screen.getByLabelText('Du')).toBeVisible();
    expect(screen.getByLabelText('Au')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Exporter en CSV' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('propose l’export CSV avec les filtres en cours', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText('Demandes créées sur la période');
    await user.click(screen.getByRole('button', { name: /^Filtres/ }));
    await user.click(screen.getByRole('combobox', { name: 'Priorité' }));
    await user.click(screen.getByRole('option', { name: 'Urgente' }));
    expect(screen.getByRole('button', { name: /^Filtres/ })).toHaveTextContent('Filtres (1)');
    const link = screen.getByRole('link', { name: 'Exporter en CSV' });
    const href = new URL(link.getAttribute('href')!, 'http://localhost');
    expect(href.pathname).toBe('/api/admin/dashboard/export.csv');
    expect(href.searchParams.getAll('priority')).toEqual(['URGENT']);
    expect(href.searchParams.get('from')).not.toBeNull();
    expect(link).toHaveAttribute('download');
  });

  it('affiche un état d’erreur avec la référence et permet de réessayer', async () => {
    const user = userEvent.setup();
    let fail = true;
    setup('/', (url) =>
      url.startsWith('/api/admin/dashboard/summary') && fail
        ? json(500, { error: { code: 'INTERNAL_ERROR', message: 'Erreur', details: { reference: 'ERR-42' } } })
        : undefined,
    );
    expect(await screen.findByText(/ERR-42/)).toBeVisible();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Demandes créées sur la période')).toBeVisible();
  });

  it('affiche un état vide sans demande', async () => {
    setup('/', (url) =>
      url.startsWith('/api/admin/dashboard/summary')
        ? json(200, {
            ...SUMMARY,
            counts: { ...SUMMARY.counts, total: 0 },
            alerts: [],
            byCategory: [],
            daily: SUMMARY.daily.map((d) => ({ ...d, created: 0, completed: 0 })),
          })
        : undefined,
    );
    expect(await screen.findByText('Aucune demande ne correspond à cette période et à ces filtres.')).toBeVisible();
    expect(screen.getByText('Aucune alerte : aucune demande en retard, urgente ou sans employé affecté.')).toBeVisible();
  });

  it('montre l’évolution quand des demandes créées avant la période y sont terminées', async () => {
    setup('/', (url) =>
      url.startsWith('/api/admin/dashboard/summary')
        ? json(200, {
            ...SUMMARY,
            counts: { ...SUMMARY.counts, total: 0 },
            byCategory: [],
            daily: SUMMARY.daily.map((d) => ({ ...d, created: 0 })),
          })
        : undefined,
    );
    expect(await screen.findByText('Évolution quotidienne')).toBeVisible();
    expect(screen.queryByText('Aucune demande ne correspond à cette période et à ces filtres.')).toBeNull();
  });

  /** Les quatre étapes du cycle de vie, dans l'ordre (liste ordonnée nommée par son titre). */
  const steps = () => within(screen.getByRole('list', { name: 'Cycle de vie d’une demande' })).getAllByRole('listitem');
  /** Carte « Par priorité · respect des délais » : une barre par priorité. */
  const priorityCard = () => screen.getByText('Par priorité · respect des délais', { selector: 'div' }).closest('.MuiPaper-root') as HTMLElement;

  it('présente les délais et le taux de respect', async () => {
    setup('/?vue=delais');
    expect(await screen.findByRole('table', { name: 'Délais par priorité' })).toBeVisible();
    expect(kpi('Respect des délais')).toBe('75 %');
    const [firstReply, takeover, net, gross] = steps();
    expect(within(firstReply!).getByRole('paragraph')).toHaveTextContent('2 min');
    expect(within(takeover!).getByRole('paragraph')).toHaveTextContent('4 min');
    expect(within(net!).getByRole('paragraph')).toHaveTextContent('1 h 30');
    expect(within(gross!).getByRole('paragraph')).toHaveTextContent('3 h');
    expect(screen.getByRole('columnheader', { name: 'Première réponse' })).toBeVisible();
  });

  it('Délais : le respect des délais (anneau et par priorité) en tête, puis le cycle de vie, puis le détail', async () => {
    setup('/?vue=delais');
    await screen.findByRole('table', { name: 'Délais par priorité' });
    const before = (a: HTMLElement, b: HTMLElement) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const lifecycle = screen.getByRole('heading', { name: 'Cycle de vie d’une demande' });
    const detail = screen.getByRole('heading', { name: 'Détail par priorité' });
    expect(before(heroCard(), priorityCard())).toBe(true);
    expect(before(priorityCard(), lifecycle)).toBe(true);
    expect(before(lifecycle, detail)).toBe(true);
    expect(screen.getByText('Durée moyenne à chaque étape, avec le nombre de demandes mesurées.')).toBeVisible();
  });

  it('Délais : anneau, niveau écrit avec la cible, et la part par priorité', async () => {
    setup('/?vue=delais');
    await screen.findByRole('table', { name: 'Délais par priorité' });
    // 75 % pour un objectif de 80 % : « proche », écrit avec la cible et dans le nom de l'anneau.
    expect(within(heroCard()).getByText('Proche de l’objectif · cible 80 %')).toBeVisible();
    expect(screen.getByRole('img', { name: /^Respect des délais : 75 %, objectif 80 %/ })).toBeInTheDocument();
    expect(screen.getByText('3 sur 4 demandes terminées sans retard')).toBeVisible();
    // Une ligne par priorité : taux et fraction, barre nommée ; le seuil de l'objectif est rappelé.
    const card = within(priorityCard());
    const [urgent, normal] = card.getAllByRole('listitem');
    expect(urgent).toHaveTextContent('Urgente75 % · 3/4');
    expect(normal).toHaveTextContent('Normale75 % · 3/4');
    expect(within(urgent!).getByRole('img', { name: '75 % des demandes dans les délais' })).toBeInTheDocument();
    expect(card.getByText('Seuil de l’objectif : 80 %')).toBeVisible();
  });

  it('Délais : quatre étapes numérotées, la durée moyenne, le nombre de demandes mesurées, et l’échantillon faible', async () => {
    const user = userEvent.setup();
    setup('/?vue=delais');
    await screen.findByRole('table', { name: 'Délais par priorité' });
    const items = steps();
    expect(items).toHaveLength(4);
    const labels = ['1 · Première réponse', '2 · Prise en charge', '3 · Traitement net', '4 · Traitement brut'];
    const hints = ['Soumission → premier message', 'Envoi → acceptation', 'Hors suspensions', 'Suspensions comprises'];
    items.forEach((item, i) => {
      expect(within(item).getByText(labels[i]!)).toBeVisible();
      expect(within(item).getByText(hints[i]!)).toBeVisible();
    });
    expect(items[0]).toHaveTextContent('Moyenne sur 2 demandes');
    expect(items[1]).toHaveTextContent('Moyenne sur 3 demandes');
    // n = 2 et n = 3 : échantillons faibles signalés, écrits.
    expect(within(items[0]!).getByText('Échantillon faible')).toBeVisible();
    // Chaque étape garde sa définition à portée.
    expect(within(items[0]!).getByRole('button', { name: 'Définition : Première réponse' })).toBeVisible();
    // Aide : repliée, puis définitions en liste.
    const help = screen.getByRole('button', { name: 'Comment sont calculés ces indicateurs ?' });
    expect(help).toHaveAttribute('aria-expanded', 'false');
    await user.click(help);
    expect(help).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText(/Une demande encore en cours n’entre pas dans le taux/)).toBeVisible();
  });

  it('Délais : détail par priorité, sans colonne de respect, chaque durée avec « sur n demandes »', async () => {
    setup('/?vue=delais');
    const table = await screen.findByRole('table', { name: 'Délais par priorité' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Priorité', 'Demandes', 'Validation', 'Première réponse', 'Prise en charge', 'Traitement net']);
    const [, urgent] = within(table).getAllByRole('row');
    expect(within(urgent!).getByText('Urgente')).toBeVisible();
    const cells = within(urgent!).getAllByRole('cell');
    expect(cells[1]).toHaveTextContent(/^3$/);
    // Première réponse : durée, puis le nombre de demandes mesurées en petit.
    expect(cells[3]).toHaveTextContent('2 minsur 2 demandes');
    expect(cells[4]).toHaveTextContent('4 minsur 3 demandes');
    // Pas de mesure : « Aucune donnée », distinct de zéro.
    expect(cells[2]).toHaveTextContent('Aucune donnée');
    // Valeurs alignées à gauche, comme leurs en-têtes.
    expect(screen.getByRole('columnheader', { name: 'Prise en charge' })).not.toHaveClass('MuiTableCell-alignRight');
  });

  it('Délais : valeurs nulles et n = 0 → « Aucune donnée », distinct de zéro ; 100 % et 0 %', async () => {
    const none = { avgMs: null, count: 0 };
    const empty = { validation: none, firstReply: none, takeover: none, resolution: none, grossResolution: none, compliance: { evaluated: 0, onTime: 0, rate: null } };
    setup('/?vue=delais', (url) =>
      url.startsWith('/api/admin/dashboard/performance')
        ? json(200, {
            period: SUMMARY.period,
            overall: { ...empty, takeover: { avgMs: 60_000, count: 1 }, compliance: { evaluated: 1, onTime: 1, rate: 1 } },
            byPriority: [
              { priority: 'URGENT', total: 1, ...empty, takeover: { avgMs: 60_000, count: 1 }, compliance: { evaluated: 1, onTime: 1, rate: 1 } },
              { priority: 'NORMAL', total: 2, ...empty, compliance: { evaluated: 2, onTime: 0, rate: 0 } },
            ],
          })
        : undefined,
    );
    const table = await screen.findByRole('table', { name: 'Délais par priorité' });
    expect(kpi('Respect des délais')).toBe('100 %');
    expect(within(heroCard()).getByText('Objectif atteint · cible 80 %')).toBeVisible();
    // Étapes : « Aucune donnée » sans mesure, la durée avec son singulier sinon.
    const items = steps();
    expect(within(items[0]!).getByRole('paragraph')).toHaveTextContent('Aucune donnée');
    expect(items[0]).toHaveTextContent('Aucune demande mesurée');
    expect(within(items[1]!).getByRole('paragraph')).toHaveTextContent('1 min');
    expect(items[1]).toHaveTextContent('Moyenne sur 1 demande');
    expect(items[1]).not.toHaveTextContent('Moyenne sur 1 demandes');
    // 016 : deux priorités. Urgente : 100 % (1/1) ; Normale : 0 % (0/2), sous l'objectif.
    const [urgent, normal] = within(priorityCard()).getAllByRole('listitem');
    expect(urgent).toHaveTextContent('Urgente100 % · 1/1');
    expect(within(urgent!).getByRole('img', { name: '100 % des demandes dans les délais' })).toBeInTheDocument();
    expect(normal).toHaveTextContent('Normale0 % · 0/2');
    expect(within(normal!).getByRole('img', { name: '0 % des demandes dans les délais' })).toBeInTheDocument();
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('1 minsur 1 demande');
    expect(within(rows[2]!).getAllByText('Aucune donnée').length).toBeGreaterThan(0);
    expect(within(rows[2]!).getAllByRole('cell')[1]).toHaveTextContent(/^2$/);
    expect(within(table).queryByText('—')).not.toBeInTheDocument();
  });

  it('Délais : une priorité sans demande terminée avec délai le dit, sans barre trompeuse', async () => {
    const none = { avgMs: null, count: 0 };
    const empty = { validation: none, firstReply: none, takeover: none, resolution: none, grossResolution: none, compliance: { evaluated: 0, onTime: 0, rate: null } };
    setup('/?vue=delais', (url) =>
      url.startsWith('/api/admin/dashboard/performance')
        ? json(200, {
            period: SUMMARY.period,
            overall: { ...empty, takeover: { avgMs: 60_000, count: 1 }, compliance: { evaluated: 1, onTime: 1, rate: 1 } },
            byPriority: [
              { priority: 'URGENT', total: 1, ...empty, takeover: { avgMs: 60_000, count: 1 }, compliance: { evaluated: 1, onTime: 1, rate: 1 } },
              { priority: 'NORMAL', total: 0, ...empty },
            ],
          })
        : undefined,
    );
    await screen.findByRole('table', { name: 'Délais par priorité' });
    const [, normal] = within(priorityCard()).getAllByRole('listitem');
    expect(normal).toHaveTextContent('Normale');
    expect(within(normal!).getByText('Aucune donnée')).toBeVisible();
    expect(within(normal!).queryByRole('img')).toBeNull();
  });

  it('Délais : rien de mesurable → état vide utile ; la période choisie est écrite dans l’en-tête', async () => {
    const none = { avgMs: null, count: 0 };
    const empty = { validation: none, firstReply: none, takeover: none, resolution: none, grossResolution: none, compliance: { evaluated: 0, onTime: 0, rate: null } };
    setup('/?vue=delais', (url) =>
      url.startsWith('/api/admin/dashboard/performance')
        ? json(200, { period: SUMMARY.period, overall: empty, byPriority: ['URGENT', 'NORMAL'].map((priority) => ({ priority, total: 0, ...empty })) })
        : undefined,
    );
    expect(await screen.findByText('Aucun délai à mesurer')).toBeVisible();
    expect(screen.queryByRole('table', { name: 'Délais par priorité' })).not.toBeInTheDocument();
    // « 30 derniers jours » : « 30 sept. – 30 oct. 2026 » par exemple, selon la date du jour.
    expect(screen.getByText(/^\d{1,2} [a-zéû.]+ – \d{1,2} [a-zéû.]+ \d{4}$/)).toBeVisible();
  });

  it('décrit l’activité récente sans contenu de message : une phrase, la demande, l’heure et une pastille', async () => {
    setup('/?vue=activite');
    const list = await screen.findByRole('region', { name: 'Dernières actions' });
    const [accepted, overdue] = within(list).getAllByRole('listitem');
    // Acteur en gras, ce qu'il a fait, puis la demande en gris ; le nouveau statut en pastille.
    expect(within(accepted!).getByText('Reprographie', { selector: 'strong' })).toBeVisible();
    expect(accepted).toHaveTextContent(/Reprographie\s*a accepté la demande/);
    expect(within(accepted!).getByText('Acceptée')).toBeVisible();
    expect(within(accepted!).getByRole('link', { name: 'D-2026-000001 · Photocopies du contrôle' })).toHaveAttribute('href', '/demandes/r1');
    // Un retard n'a pas d'auteur : le système.
    expect(overdue).toHaveTextContent(/Le système\s*a signalé un retard \(prise en charge\)/);
    expect(within(overdue!).getByText('En retard')).toBeVisible();
    // Heure locale à gauche, lisible par machine.
    const time = within(accepted!).getByText(/^\d{2}:\d{2}$/);
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', '2026-10-16T09:00:00.000Z');
    // Jamais de contenu de message.
    expect(screen.queryByText(/Description confidentielle/)).toBeNull();
  });

  describe('activité : une phrase et une pastille par type d’événement', () => {
    const request = (n: number, title: string) => ({ id: `r${n}`, reference: `D-2026-000${n}`, title });
    const event = (id: string, type: string, actor: string | null, details: Record<string, unknown>, n = 149, at = '2026-10-16T21:24:00.000Z') => ({
      id,
      type,
      createdAt: at,
      actor: actor ? { id: `u-${actor}`, displayName: actor } : null,
      request: request(n, `Essai ${n}`),
      details,
    });
    const EVENTS = [
      event('e1', 'STATUS_CHANGED', 'Mme_Souha', { from: 'SENT', to: 'REJECTED' }, 146),
      event('e2', 'STATUS_CHANGED', 'Test 018', { from: 'DRAFT', to: 'PENDING_ADMIN_VALIDATION' }),
      event('e3', 'CREATED', 'Test 018', {}),
      event('e4', 'ASSIGNED', 'Admin Un', { assignee: { id: 'u2', displayName: 'Test 018' } }, 147),
      event('e5', 'STATUS_CHANGED', 'Admin Un', { from: 'PENDING_ADMIN_VALIDATION', to: 'SENT' }, 147),
      event('e6', 'PRIORITY_CHANGED', 'Admin Un', { from: 'NORMAL', to: 'URGENT' }),
      event('e7', 'MESSAGE_ADDED', 'Test 018', { kind: 'VOICE' }),
      event('e8', 'MESSAGE_ADDED', 'Test 018', { kind: 'TEXT' }),
      event('e9', 'REASSIGNED', 'Admin Un', { assignee: { id: 'u3', displayName: 'Mr_Nizar' } }),
      event('e10', 'STATUS_CHANGED', 'Mr_Nizar', { from: 'ACCEPTED', to: 'IN_PROGRESS' }),
      event('e11', 'FILE_ADDED', 'Test 018', { kind: 'IMAGE' }),
      event('e12', 'REMINDER_SENT', null, {}),
    ];
    const withEvents: Handler = (url) => (url.startsWith('/api/admin/dashboard/activity') ? json(200, { items: EVENTS, nextCursor: null }) : undefined);
    const rows = () => within(screen.getByRole('region', { name: 'Dernières actions' })).getAllByRole('listitem');

    it.each([
      [0, /Mme_Souha\s*a refusé la demande/, 'Refusée'],
      [1, /Test 018\s*a envoyé en validation/, 'En attente de validation'],
      [2, /Test 018\s*a créé la demande/, 'Nouvelle'],
      [3, /Admin Un\s*a affecté à Test 018/, 'Affectée'],
      [4, /Admin Un\s*a marqué comme envoyée/, 'Envoyée'],
      [5, /Admin Un\s*a changé la priorité/, 'Urgente'],
      [6, /Test 018\s*a envoyé un message vocal/, 'Message'],
      [7, /Test 018\s*a écrit un message/, 'Message'],
      [8, /Admin Un\s*a réaffecté à Mr_Nizar/, 'Réaffectée'],
      [9, /Mr_Nizar\s*a commencé le traitement/, 'En cours'],
      [10, /Test 018\s*a joint un fichier/, 'Fichier'],
      [11, /Le système\s*a modifié la demande/, 'Mise à jour'],
    ])('ligne %i : %s, pastille « %s »', async (index, sentence, pill) => {
      setup('/?vue=activite', withEvents);
      await screen.findByRole('region', { name: 'Dernières actions' });
      const row = rows()[index as number]!;
      expect(row).toHaveTextContent(sentence as RegExp);
      expect(within(row).getByText(pill as string)).toBeVisible();
    });

    it('la demande est une seule ligne grise cliquable : référence et titre', async () => {
      setup('/?vue=activite', withEvents);
      await screen.findByRole('region', { name: 'Dernières actions' });
      const link = within(rows()[0]!).getByRole('link', { name: 'D-2026-000146 · Essai 146' });
      expect(link).toHaveAttribute('href', '/demandes/r146');
    });

    it('les actions sont regroupées par jour : « Aujourd’hui », « Hier », puis la date', async () => {
      const day = 24 * 3_600_000;
      const now = Date.now();
      setup('/?vue=activite', (url) =>
        url.startsWith('/api/admin/dashboard/activity')
          ? json(200, {
              items: [
                event('t1', 'CREATED', 'Test 018', {}, 1, new Date(now - 60_000).toISOString()),
                event('t2', 'CREATED', 'Test 018', {}, 2, new Date(now - 120_000).toISOString()),
                event('y1', 'CREATED', 'Test 018', {}, 3, new Date(now - day).toISOString()),
                event('o1', 'CREATED', 'Test 018', {}, 4, '2026-10-15T10:00:00.000Z'),
              ],
              nextCursor: null,
            })
          : undefined,
      );
      await screen.findByRole('region', { name: 'Dernières actions' });
      const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
      expect(headings).toHaveLength(3);
      expect(headings.slice(0, 2)).toEqual(['Aujourd’hui', 'Hier']);
      expect(headings[2]).toMatch(/15 octobre/);
      // Chaque jour ne l'écrit qu'une fois, devant ses actions.
      expect(rows()).toHaveLength(4);
    });

    it('ne montre jamais le contenu d’un message', async () => {
      setup('/?vue=activite', withEvents);
      await screen.findByRole('region', { name: 'Dernières actions' });
      expect(rows()[6]).not.toHaveTextContent(/confidentielle|contenu/i);
    });
  });

  it('affiche un état vide pour les employés sans activité', async () => {
    setup('/?vue=employes');
    expect(await screen.findByText('Aucun compte actif et aucune demande sur cette période.')).toBeVisible();
  });
});

describe('Paramètres du tableau de bord', () => {
  const today = new Date(2026, 9, 16, 15, 0);

  it('calcule la période des préréglages, aujourd’hui compris', () => {
    expect(periodOf({ ...DEFAULT_FILTERS, preset: '7' }, today)).toEqual({ from: '2026-10-10', to: '2026-10-16' });
  });

  it('« Aujourd’hui » : la période est le jour même, lue et écrite dans l’adresse', () => {
    expect(periodOf({ ...DEFAULT_FILTERS, preset: '1' }, today)).toEqual({ from: '2026-10-16', to: '2026-10-16' });
    expect(filtersFromParams(new URLSearchParams('periode=1')).preset).toBe('1');
    expect(withFilters(new URLSearchParams(), { ...DEFAULT_FILTERS, preset: '1' }).toString()).toBe('periode=1');
    const params = new URLSearchParams(toDashboardQuery({ ...DEFAULT_FILTERS, preset: '1' }, today));
    expect(params.get('from')).toBe(new Date(2026, 9, 16).toISOString());
    expect(params.get('to')).toBe(new Date(2026, 9, 16, 23, 59, 59, 999).toISOString());
  });

  it('lien d’une priorité : les demandes de la période (total) filtrées par cette priorité, autres filtres gardés', () => {
    const link = new URLSearchParams(priorityLink(new URLSearchParams('periode=7&categorie=c1&priorite=NORMAL'), 'URGENT').split('?')[1]);
    expect(Object.fromEntries(link)).toEqual({ periode: '7', categorie: 'c1', priorite: 'URGENT', vue: 'demandes', indicateur: 'total' });
  });

  it('envoie des bornes de journées locales et le fuseau du navigateur', () => {
    const params = new URLSearchParams(toDashboardQuery({ ...DEFAULT_FILTERS, preset: 'custom', from: '2026-10-01', to: '2026-10-02', employeeId: 'e1' }, today));
    expect(params.get('from')).toBe(new Date(2026, 9, 1).toISOString());
    expect(params.get('to')).toBe(new Date(2026, 9, 2, 23, 59, 59, 999).toISOString());
    expect(params.get('tz')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(params.get('employeeId')).toBe('e1');
  });

  it('lit les filtres dans l’adresse et ignore les valeurs inconnues', () => {
    expect(filtersFromParams(new URLSearchParams('periode=perso&du=2026-10-01&au=2026-10-15&categorie=c1&priorite=URGENT&employe=e1'))).toEqual({
      preset: 'custom',
      from: '2026-10-01',
      to: '2026-10-15',
      categoryId: 'c1',
      priority: 'URGENT',
      employeeId: 'e1',
    });
    expect(filtersFromParams(new URLSearchParams('periode=12&du=hier&priorite=TRES_HAUTE'))).toEqual(DEFAULT_FILTERS);
  });

  it('écrit les filtres dans l’adresse sans les valeurs par défaut, en gardant la vue', () => {
    const next = withFilters(new URLSearchParams('vue=delais&periode=7'), { ...DEFAULT_FILTERS, priority: 'NORMAL' });
    expect(next.toString()).toBe('vue=delais&priorite=NORMAL');
  });

  it('lien d’un chiffre : onglet Demandes, indicateur et filtres en cours', () => {
    const link = new URLSearchParams(indicatorLink(new URLSearchParams('periode=7&priorite=URGENT'), 'urgentActive').split('?')[1]);
    expect(Object.fromEntries(link)).toEqual({ periode: '7', priorite: 'URGENT', vue: 'demandes', indicateur: 'urgentActive' });
  });

  it('formate les durées', () => {
    expect(formatDurationMs(null)).toBe('—');
    expect(formatDurationMs(30_000)).toBe('30 s');
    expect(formatDurationMs(5 * 60_000)).toBe('5 min');
    expect(formatDurationMs(125 * 60_000)).toBe('2 h 05');
    expect(formatDurationMs(50 * 3_600_000)).toBe('2 j 2 h');
  });

  it('la période propose « Aujourd’hui » en premier, et la choisir demande le seul jour courant', async () => {
    const user = userEvent.setup();
    const { urls, router } = setup('/');
    await screen.findByText('Demandes créées sur la période');
    await user.click(screen.getByRole('combobox', { name: 'Période' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Aujourd’hui', '7 derniers jours', '30 derniers jours', '90 derniers jours', 'Personnalisée']);
    await user.click(screen.getByRole('option', { name: 'Aujourd’hui' }));
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get('periode')).toBe('1'));
    await waitFor(() => {
      const last = new URLSearchParams(urls.filter((u) => u.startsWith('/api/admin/dashboard/summary')).at(-1)!.split('?')[1]);
      expect(new Date(last.get('to')!).getTime() - new Date(last.get('from')!).getTime()).toBe(24 * 3_600_000 - 1);
    });
  });

  it('en-tête allégé : titre, période visible, autres filtres derrière « Filtres », sans fil d’Ariane ni phrase', async () => {
    const user = userEvent.setup();
    setup();
    expect(await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'Fil d’Ariane' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Supervision des demandes/)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Période' })).toHaveTextContent('30 derniers jours');

    const toggle = screen.getByRole('button', { name: /^Filtres/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('combobox', { name: 'Catégorie (service)' })).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    for (const name of ['Catégorie (service)', 'Priorité', 'Employé']) {
      expect(screen.getByRole('combobox', { name })).toBeVisible();
    }
    // Les onglets ne changent pas.
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Vue générale', 'Délais', 'Employés', 'Demandes', 'Activité']);
  });

  it('vue Demandes : 5 colonnes, priorité à point, statut en pastille, avatars demandeur → affecté, détails au survol', async () => {
    const user = userEvent.setup();
    setup('/?vue=demandes');
    const table = await screen.findByRole('table', { name: 'Demandes de la période' });
    // La flèche est masquée aux lecteurs d'écran, qui lisent « Demandeur et Affecté ».
    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(5);
    for (const name of ['Demande', 'Priorité', 'Statut', 'Demandeur et Affecté', 'Créée']) {
      expect(within(table).getByRole('columnheader', { name })).toBeInTheDocument();
    }
    expect(headers[3]).toHaveTextContent('Demandeur →');
    const [, late, rejected] = within(table).getAllByRole('row');

    // Titre sur une ligne, numéro court ; « En retard » remplace le statut, en pastille.
    expect(within(late!).getByRole('link', { name: /Réparation climatiseur/ })).toHaveAttribute('href', '/demandes/r4');
    expect(within(late!).getByText('#004')).toBeVisible();
    expect(within(late!).getByText('Urgente')).toBeVisible();
    expect(within(late!).getByText('En retard')).toBeVisible();
    expect(within(late!).queryByText('Envoyée')).not.toBeInTheDocument();
    expect(within(rejected!).getByText('Refusée')).toBeVisible();

    // Priorité : un point devant le libellé écrit (rouge pour l'urgence, gris sinon), jamais seul.
    const dot = (row: HTMLElement) => row.querySelector('[data-priority-dot]') as HTMLElement;
    expect(dot(late!)).toHaveAttribute('aria-hidden', 'true');
    expect(dot(late!)).toHaveAttribute('data-priority-dot', 'URGENT');
    expect(dot(rejected!)).toHaveAttribute('data-priority-dot', 'NORMAL');

    // Statut : pastille avec icône et libellé (la couleur n'est qu'un complément).
    for (const [row, label] of [[late!, 'En retard'], [rejected!, 'Refusée']] as const) {
      expect(within(row).getByText(label).parentElement!.querySelector('svg')).not.toBeNull();
    }

    // Demandeur → affecté : deux avatars, le nom de l'affecté écrit ; les deux noms sont lus aux lecteurs d'écran.
    expect(late).toHaveTextContent('SA');
    expect(late).toHaveTextContent('TE');
    expect(within(late!).getByText('Technicien')).toBeVisible();
    expect(within(late!).getByText('Demandeur : Super admin, affectée à : Technicien')).toBeInTheDocument();
    // Sans employé affecté : un cercle vide à la place de l'avatar, et « — » pour les lecteurs d'écran.
    expect(within(rejected!).getByText('Demandeur : Enseignante, affectée à : —')).toBeInTheDocument();
    expect(rejected!.querySelector('[data-unassigned]')).not.toBeNull();

    // Dates sans l'année.
    const created = within(late!).getAllByRole('cell').at(-1)!;
    expect(created.textContent).toMatch(/^\d{1,2} oct\., \d{2}:\d{2}$/);

    // Survol (ou focus) : numéro complet, catégorie et échéance.
    await user.hover(within(late!).getByRole('link', { name: /Réparation climatiseur/ }));
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('D-2026-000004');
    expect(tip).toHaveTextContent('Petits travaux');
    expect(tip).toHaveTextContent('Échéance');
  });

  it('vue Demandes : « En attente de validation » tient dans la pastille, le libellé complet est à l’infobulle', async () => {
    const user = userEvent.setup();
    setup('/?vue=demandes', (url) =>
      url.startsWith('/api/admin/dashboard/requests')
        ? json(200, { items: [{ ...REQUESTS[1], id: 'r9', status: 'PENDING_ADMIN_VALIDATION', title: 'Cartouches d’encre' }], nextCursor: null })
        : undefined,
    );
    const row = (await screen.findByRole('link', { name: 'Cartouches d’encre' })).closest('tr') as HTMLElement;
    expect(within(row).getByText('En attente de validation')).toBeVisible();
    expect(within(row).queryByText('En attente de validation administrative')).toBeNull();
    await user.hover(within(row).getByRole('link', { name: 'Cartouches d’encre' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Statut : En attente de validation administrative');
  });

  it('vue Demandes : le pied du tableau tient sur une ligne, l’aide à gauche et « Afficher plus » à droite', async () => {
    setup('/?vue=demandes', (url) =>
      url.startsWith('/api/admin/dashboard/requests') ? json(200, { items: REQUESTS, nextCursor: 'suite' }) : undefined,
    );
    const more = await screen.findByRole('button', { name: 'Afficher plus de demandes' });
    const help = screen.getByText('Survol d’une ligne : numéro complet, catégorie et échéance. Historique complet : ouvrir la demande.');
    expect(more.parentElement).toBe(help.parentElement);
    const footer = help.parentElement!;
    expect(footer).toHaveStyle({ display: 'flex' });
    expect(footer.firstElementChild).toBe(help);
    expect(footer.lastElementChild).toBe(more);
  });

  it('s’ouvre sur « Vue générale » (page d’accueil après connexion), sans changer l’ordre des onglets', async () => {
    setup('/');
    expect(await screen.findByText('Demandes créées sur la période')).toBeVisible();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Vue générale', 'Délais', 'Employés', 'Demandes', 'Activité']);
    expect(screen.getByRole('tab', { name: 'Vue générale' })).toHaveAttribute('aria-selected', 'true');
  });
});

/**
 * Chiffres cliquables : chaque chiffre des cartes de la période et de « À traiter maintenant » ouvre
 * l'onglet Demandes sur exactement les demandes comptées (même route, mêmes filtres que la synthèse).
 */
describe('Chiffres cliquables du tableau de bord', () => {
  afterEach(() => vi.unstubAllGlobals());

  const ROWS = [
    {
      id: 'r4',
      reference: 'D-2026-000004',
      title: 'Réparation climatiseur de la salle des professeurs, au deuxième étage du bâtiment B',
      priority: 'URGENT',
      status: 'SENT',
      overdueStage: null,
      currentDueAt: '2026-10-13T15:06:00.000Z',
      createdAt: '2026-10-13T14:06:00.000Z',
      category: { id: 'c2', name: 'Petits travaux' },
      requester: person('sa', 'Super admin'),
      assignee: person('t1', 'Technicien'),
    },
  ];
  const indicatorRows: Handler = (url) =>
    url.startsWith('/api/admin/dashboard/requests') ? json(200, { items: ROWS, nextCursor: null }) : undefined;
  const linkParams = (name: string) =>
    Object.fromEntries(new URLSearchParams(screen.getByRole('link', { name }).getAttribute('href')!.split('?')[1]));

  it('chaque chiffre de la période et de la situation actuelle ouvre la liste de ses demandes, filtres compris', async () => {
    const user = userEvent.setup();
    setup('/?categorie=c1', (url) =>
      url.startsWith('/api/admin/dashboard/summary') ? json(200, { ...SUMMARY, current: { overdueNow: 1, urgentActive: 2, unassigned: 5 } }) : undefined,
    );
    await screen.findByText('Demandes créées sur la période');
    // Tuiles : le total, puis ses urgentes et ses normales (le même total, filtré par priorité).
    expect(linkParams('Total : 12 — voir ces demandes')).toEqual({ categorie: 'c1', vue: 'demandes', indicateur: 'total' });
    expect(linkParams('Urgentes : 5 — voir ces demandes')).toEqual({ categorie: 'c1', priorite: 'URGENT', vue: 'demandes', indicateur: 'total' });
    expect(linkParams('Normales : 7 — voir ces demandes')).toEqual({ categorie: 'c1', priorite: 'NORMAL', vue: 'demandes', indicateur: 'total' });
    // Légende de la répartition : un lien par état.
    expect(linkParams('À valider : 1 — voir ces demandes')).toMatchObject({ indicateur: 'pendingValidation' });
    expect(linkParams('En attente de prise en charge : 3 — voir ces demandes')).toMatchObject({ indicateur: 'pendingTakeover' });
    expect(linkParams('En cours : 2 — voir ces demandes')).toMatchObject({ indicateur: 'inProgress' });
    expect(linkParams('Terminées : 4 — voir ces demandes')).toMatchObject({ indicateur: 'done' });
    expect(linkParams('Refusées : 1 — voir ces demandes')).toMatchObject({ indicateur: 'rejected' });
    expect(linkParams('Annulées : 1 — voir ces demandes')).toMatchObject({ indicateur: 'cancelled' });
    // Situation actuelle : le lien suit la pastille choisie.
    expect(linkParams('En retard : 1 — voir ces demandes')).toMatchObject({ indicateur: 'overdueNow' });
    await user.click(screen.getByRole('button', { name: 'Urgentes 2' }));
    expect(linkParams('Urgentes en cours : 2 — voir ces demandes')).toEqual({ categorie: 'c1', vue: 'demandes', indicateur: 'urgentActive' });
    await user.click(screen.getByRole('button', { name: 'Non assignées 5' }));
    expect(linkParams('Sans employé affecté : 5 — voir ces demandes')).toMatchObject({ indicateur: 'unassigned' });
    // Les messages ne sont pas des demandes : pas de lien.
    expect(screen.queryByRole('link', { name: /écrits|vocaux/i })).toBeNull();
    expect(kpi('Total')).toBe('12');
  });

  it('un clic ouvre l’onglet Demandes sur les demandes du chiffre, avec sa pastille choisie ; « Toutes » revient à la liste habituelle', async () => {
    const user = userEvent.setup();
    const { urls, router } = setup('/', indicatorRows);
    await screen.findByText('Demandes créées sur la période');
    await user.click(screen.getByRole('button', { name: 'Urgentes 2' }));
    await user.click(screen.getByRole('link', { name: 'Urgentes en cours : 2 — voir ces demandes' }));

    expect(screen.getByRole('tab', { name: 'Demandes' })).toHaveAttribute('aria-selected', 'true');
    const table = await screen.findByRole('table', { name: 'Demandes : Urgentes en cours' });
    expect(within(table).getByRole('link', { name: /Réparation climatiseur/ })).toHaveAttribute('href', '/demandes/r4');
    // Le chiffre est une pastille du filtre ; sa portée (toutes périodes) reste écrite.
    expect(screen.getByRole('button', { name: 'Urgentes' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Toutes' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Situation actuelle, toutes périodes confondues.')).toBeVisible();
    const call = urls.find((u) => u.startsWith('/api/admin/dashboard/requests?'))!;
    expect(new URLSearchParams(call.split('?')[1]).get('indicator')).toBe('urgentActive');

    await user.click(screen.getByRole('button', { name: 'Toutes' }));
    expect(await screen.findByRole('table', { name: 'Demandes de la période' })).toBeVisible();
    expect(new URLSearchParams(router.state.location.search).get('indicateur')).toBeNull();
    expect(screen.queryByText('Situation actuelle, toutes périodes confondues.')).toBeNull();
    const indicators = urls.filter((u) => u.startsWith('/api/admin/dashboard/requests?')).map((u) => new URLSearchParams(u.split('?')[1]).get('indicator'));
    expect(indicators).toEqual(['urgentActive', 'total']);
    expect(urls.some((u) => u.startsWith('/api/requests'))).toBe(false);
  });

  describe('onglet Demandes : pastilles de filtre', () => {
    const chips = () => within(screen.getByRole('group', { name: 'Filtrer les demandes' }));

    it('six pastilles, « Toutes » choisie par défaut, sans effectif', async () => {
      setup('/?vue=demandes', indicatorRows);
      await screen.findByRole('table', { name: 'Demandes de la période' });
      expect(chips().getAllByRole('button').map((b) => b.textContent)).toEqual(['Toutes', 'En retard', 'Urgentes', 'En attente', 'À corriger', 'Terminées']);
      expect(chips().getByRole('button', { name: 'Toutes' })).toHaveAttribute('aria-pressed', 'true');
      expect(chips().getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    });

    it('chaque pastille demande ses demandes au serveur et s’écrit dans l’adresse', async () => {
      const user = userEvent.setup();
      const { urls, router } = setup('/?vue=demandes&priorite=URGENT', indicatorRows);
      await screen.findByRole('table', { name: 'Demandes de la période' });
      const indicator = () => new URLSearchParams(urls.filter((u) => u.startsWith('/api/admin/dashboard/requests?')).at(-1)!.split('?')[1]).get('indicator');
      const expected: Array<[string, string]> = [
        ['En retard', 'overdueNow'],
        ['Urgentes', 'urgentActive'],
        ['En attente', 'waiting'],
        ['À corriger', 'toCorrect'],
        ['Terminées', 'done'],
      ];
      for (const [label, value] of expected) {
        await user.click(chips().getByRole('button', { name: label }));
        await waitFor(() => expect(indicator()).toBe(value));
        expect(new URLSearchParams(router.state.location.search).get('indicateur')).toBe(value);
        expect(chips().getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
        // Les filtres de la page (ici la priorité) sont gardés.
        expect(new URLSearchParams(router.state.location.search).get('priorite')).toBe('URGENT');
      }
    });

    it('la portée « toutes périodes » n’est écrite que pour la situation actuelle', async () => {
      const user = userEvent.setup();
      setup('/?vue=demandes', indicatorRows);
      await screen.findByRole('table', { name: 'Demandes de la période' });
      expect(screen.queryByText('Situation actuelle, toutes périodes confondues.')).toBeNull();
      await user.click(chips().getByRole('button', { name: 'En retard' }));
      expect(await screen.findByText('Situation actuelle, toutes périodes confondues.')).toBeVisible();
      await user.click(chips().getByRole('button', { name: 'À corriger' }));
      await waitFor(() => expect(screen.queryByText('Situation actuelle, toutes périodes confondues.')).toBeNull());
    });

    it('un chiffre qui n’est pas une pastille garde son bandeau : aucune pastille n’est choisie', async () => {
      setup('/?vue=demandes&indicateur=rejected', indicatorRows);
      expect(await screen.findByText('« Refusées » : demandes créées sur la période.')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Voir toutes les demandes' })).toBeVisible();
      expect(chips().getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(0);
    });

    it('le chiffre « Total » est la liste habituelle : « Toutes » est choisie, sans bandeau', async () => {
      setup('/?vue=demandes&indicateur=total', indicatorRows);
      await screen.findByRole('table', { name: 'Demandes : Total' });
      expect(chips().getByRole('button', { name: 'Toutes' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByRole('button', { name: 'Voir toutes les demandes' })).toBeNull();
    });

    it('une pastille sans demande le dit', async () => {
      const user = userEvent.setup();
      setup('/?vue=demandes', (url) => (url.includes('indicator=toCorrect') ? json(200, { items: [], nextCursor: null }) : indicatorRows(url)));
      await screen.findByRole('table', { name: 'Demandes de la période' });
      await user.click(chips().getByRole('button', { name: 'À corriger' }));
      expect(await screen.findByText('Aucune demande ne correspond à ce filtre.')).toBeVisible();
    });
  });

  it('onglet Demandes sans chiffre : les demandes de la carte Total (employé demandeur ou affecté, sans brouillon)', async () => {
    const { urls } = setup('/?vue=demandes&employe=e1', indicatorRows);
    const table = await screen.findByRole('table', { name: 'Demandes de la période' });
    expect(within(table).getByRole('link', { name: /Réparation climatiseur/ })).toHaveAttribute('href', '/demandes/r4');
    // Liste habituelle : pas de bandeau de chiffre.
    expect(screen.queryByRole('button', { name: 'Voir toutes les demandes' })).toBeNull();
    const call = new URLSearchParams(urls.find((u) => u.startsWith('/api/admin/dashboard/requests?'))!.split('?')[1]);
    expect(call.get('indicator')).toBe('total');
    expect(call.get('employeeId')).toBe('e1');
    expect(urls.some((u) => u.startsWith('/api/requests'))).toBe(false);
  });

  it('chiffre de la période : le bandeau le dit ; un chiffre sans demande affiche un état vide', async () => {
    setup('/?vue=demandes&indicateur=overdueInPeriod', (url) =>
      url.startsWith('/api/admin/dashboard/requests') ? json(200, { items: [], nextCursor: null }) : undefined,
    );
    expect(await screen.findByText('« Hors délai » : demandes créées sur la période.')).toBeVisible();
    expect(await screen.findByText('Aucune demande ne correspond à ce chiffre.')).toBeVisible();
  });

  it('changer d’onglet retire l’indicateur', async () => {
    const user = userEvent.setup();
    const { router } = setup('/?vue=demandes&indicateur=total', indicatorRows);
    await screen.findByRole('table', { name: 'Demandes : Total' });
    await user.click(screen.getByRole('tab', { name: 'Délais' }));
    await user.click(screen.getByRole('tab', { name: 'Demandes' }));
    expect(await screen.findByRole('table', { name: 'Demandes de la période' })).toBeVisible();
    expect(new URLSearchParams(router.state.location.search).get('indicateur')).toBeNull();
  });

  it('les filtres sont dans l’adresse : relus à l’ouverture, écrits au changement', async () => {
    const user = userEvent.setup();
    const { urls, router } = setup('/?periode=7&categorie=c1&priorite=URGENT');
    await screen.findByText('Demandes créées sur la période');
    const first = new URLSearchParams(urls.find((u) => u.startsWith('/api/admin/dashboard/summary'))!.split('?')[1]);
    expect(first.get('categoryId')).toBe('c1');
    expect(first.get('priority')).toBe('URGENT');
    expect(screen.getByRole('combobox', { name: 'Période' })).toHaveTextContent('7 derniers jours');

    await user.click(screen.getByRole('button', { name: /^Filtres/ }));
    await user.click(screen.getByRole('combobox', { name: 'Priorité' }));
    // 016 : deux priorités au choix, plus « Toutes ».
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Toutes', 'Urgente', 'Normale']);
    await user.click(screen.getByRole('option', { name: 'Normale' }));
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get('priorite')).toBe('NORMAL'));
    expect(new URLSearchParams(router.state.location.search).get('periode')).toBe('7');
  });
});
