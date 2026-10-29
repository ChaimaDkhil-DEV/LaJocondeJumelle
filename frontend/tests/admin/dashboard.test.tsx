import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { HomePage } from '../../src/features/home/HomePage';
import { formatDurationMs, periodOf, toDashboardQuery, toRequestListFilters, DEFAULT_FILTERS } from '../../src/features/admin/dashboardApi';

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
  counts: { total: 12, pendingValidation: 1, pendingTakeover: 3, inProgress: 2, done: 4, rejected: 1, cancelled: 1, overdueInPeriod: 2 },
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
  byPriority: ['URGENT', 'HIGH', 'MEDIUM', 'NORMAL'].map((priority) => ({ priority, total: 3, ...PERF_STATS })),
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
    priority: 'HIGH',
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
      if (url === '/api/admin/users') return json(200, USERS);
      if (url === '/api/admin/categories') return json(200, CATEGORIES);
      if (url.startsWith('/api/admin/dashboard/summary')) return json(200, SUMMARY);
      if (url.startsWith('/api/admin/dashboard/performance')) return json(200, PERFORMANCE);
      if (url.startsWith('/api/admin/dashboard/activity')) return json(200, ACTIVITY);
      if (url.startsWith('/api/admin/dashboard/employees')) return json(200, { items: [] });
      if (url.startsWith('/api/requests')) return json(200, { items: REQUESTS, nextCursor: null });
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

/** Chiffre clé sans cadre (« À traiter maintenant », « Échanges ») : élément dd associé au libellé. */
function figure(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: 'dt, dt *' }).closest('dt') as HTMLElement;
  return term.parentElement!.querySelector('dd') as HTMLElement;
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

  it('affiche les indicateurs, la situation actuelle et les alertes de l’API', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
    await screen.findByText('Demandes créées sur la période');
    expect(kpi('Total')).toBe('12');
    expect(kpi('En attente de prise en charge')).toBe('3');
    expect(kpi('Terminées')).toBe('4');
    expect(kpi('Hors délai')).toBe('2');
    // « À traiter maintenant » : chiffres sans cadre ; seul un chiffre problématique (> 0) est coloré.
    expect(figure('En retard')).toHaveTextContent('1');
    expect(figure('Urgentes en cours')).toHaveTextContent('2');
    expect(figure('Sans employé affecté')).toHaveTextContent('0');
    expect(figure('En retard')).toHaveStyle({ color: '#dc2626' });
    expect(figure('Urgentes en cours')).toHaveStyle({ color: '#b45309' });
    expect(figure('Sans employé affecté')).toHaveStyle({ color: '#18181b' });
    expect(screen.queryByText('À traiter')).not.toBeInTheDocument();
    expect(screen.queryByText('Rien à signaler')).not.toBeInTheDocument();
    expect(figure('Écrits')).toHaveTextContent('7');
    expect(figure('Vocaux')).toHaveTextContent('3');

    // Tableau des alertes : 4 colonnes, plus de « Statut » ; retard écrit en texte, numéro au survol.
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
    expect(screen.getByText('Aucune alerte : aucune demande en retard ni urgente en cours.')).toBeVisible();
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

  it('présente les délais et le taux de respect', async () => {
    setup('/?vue=delais');
    expect(await screen.findByRole('table', { name: 'Délais par priorité' })).toBeVisible();
    expect(kpi('Respect des délais')).toBe('75 %');
    expect(kpi('Première réponse moyenne')).toBe('2 min');
    expect(kpi('Prise en charge moyenne')).toBe('4 min');
    expect(kpi('Traitement net moyen')).toBe('1 h 30');
    expect(screen.getByRole('columnheader', { name: 'Première réponse' })).toBeVisible();
    expect(screen.getByRole('table', { name: 'Délais par priorité' })).toBeVisible();
  });

  it('Délais : respect des délais en tête, niveau écrit, n par carte, aide repliée', async () => {
    const user = userEvent.setup();
    setup('/?vue=delais');
    await screen.findByRole('table', { name: 'Délais par priorité' });
    // 75 % pour un objectif de 80 % : « proche », écrit et dans le nom de l'anneau.
    expect(within(heroCard()).getByText('Proche de l’objectif')).toBeVisible();
    expect(screen.getByRole('img', { name: /^Respect des délais : 75 %, objectif 80 %/ })).toBeInTheDocument();
    expect(screen.getByText('3 sur 4 demandes terminées sans retard')).toBeVisible();
    // n = 2 et n = 3 : échantillons faibles signalés sur les cartes.
    expect(screen.getAllByText(/échantillon faible/).length).toBeGreaterThan(0);
    // En-têtes chiffrés alignés à droite comme leurs valeurs.
    expect(screen.getByRole('columnheader', { name: 'Respect des délais' })).toHaveClass('MuiTableCell-alignRight');
    // Aide : repliée, puis définitions en liste.
    const help = screen.getByRole('button', { name: 'Comment sont calculés ces indicateurs ?' });
    expect(help).toHaveAttribute('aria-expanded', 'false');
    await user.click(help);
    expect(help).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText(/Une demande encore en cours n’entre pas dans le taux/)).toBeVisible();
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
              { priority: 'HIGH', total: 2, ...empty, compliance: { evaluated: 2, onTime: 0, rate: 0 } },
              { priority: 'MEDIUM', total: 0, ...empty },
              { priority: 'NORMAL', total: 0, ...empty },
            ],
          })
        : undefined,
    );
    const table = await screen.findByRole('table', { name: 'Délais par priorité' });
    expect(kpi('Respect des délais')).toBe('100 %');
    expect(within(heroCard()).getByText('Objectif atteint')).toBeVisible();
    expect(kpi('Première réponse moyenne')).toBe('Aucune donnée');
    expect(kpi('Prise en charge moyenne')).toBe('1 min');
    const rows = within(table).getAllByRole('row');
    // Urgente : 100 % (1/1) ; Haute : 0 % (0/2), sous l'objectif ; Moyenne : aucune demande, 0 et « Aucune donnée ».
    expect(rows[1]).toHaveTextContent('100 %(1/1)');
    expect(within(rows[1]).getByRole('img', { name: '100 % des demandes dans les délais' })).toBeInTheDocument();
    expect(rows[2]).toHaveTextContent('Sous l’objectif0 %(0/2)');
    expect(within(rows[3]).getAllByText('Aucune donnée')).toHaveLength(5);
    expect(within(rows[3]).getAllByRole('cell')[1]).toHaveTextContent(/^0$/);
    expect(within(table).queryByText('—')).not.toBeInTheDocument();
  });

  it('Délais : rien de mesurable → état vide utile ; la période choisie est écrite dans l’en-tête', async () => {
    const none = { avgMs: null, count: 0 };
    const empty = { validation: none, firstReply: none, takeover: none, resolution: none, grossResolution: none, compliance: { evaluated: 0, onTime: 0, rate: null } };
    setup('/?vue=delais', (url) =>
      url.startsWith('/api/admin/dashboard/performance')
        ? json(200, { period: SUMMARY.period, overall: empty, byPriority: ['URGENT', 'HIGH', 'MEDIUM', 'NORMAL'].map((priority) => ({ priority, total: 0, ...empty })) })
        : undefined,
    );
    expect(await screen.findByText('Aucun délai à mesurer')).toBeVisible();
    expect(screen.queryByRole('table', { name: 'Délais par priorité' })).not.toBeInTheDocument();
    // « 30 derniers jours » : « 30 sept. – 30 oct. 2026 » par exemple, selon la date du jour.
    expect(screen.getByText(/^\d{1,2} [a-zéû.]+ – \d{1,2} [a-zéû.]+ \d{4}$/)).toBeVisible();
  });

  it('décrit l’activité récente sans contenu de message', async () => {
    setup('/?vue=activite');
    expect(await screen.findByText('Statut : Envoyée → Acceptée')).toBeVisible();
    expect(screen.getByText('En retard (prise en charge)')).toBeVisible();
    expect(screen.getByText('Système', { exact: false })).toBeVisible();
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

  it('envoie des bornes de journées locales et le fuseau du navigateur', () => {
    const params = new URLSearchParams(toDashboardQuery({ ...DEFAULT_FILTERS, preset: 'custom', from: '2026-10-01', to: '2026-10-02', employeeId: 'e1' }, today));
    expect(params.get('from')).toBe(new Date(2026, 9, 1).toISOString());
    expect(params.get('to')).toBe(new Date(2026, 9, 2, 23, 59, 59, 999).toISOString());
    expect(params.get('tz')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(params.get('employeeId')).toBe('e1');
  });

  it('traduit l’employé en employé affecté pour la liste des demandes', () => {
    expect(toRequestListFilters({ ...DEFAULT_FILTERS, employeeId: 'e1' }, today)).toContain('assigneeId=e1');
  });

  it('formate les durées', () => {
    expect(formatDurationMs(null)).toBe('—');
    expect(formatDurationMs(30_000)).toBe('30 s');
    expect(formatDurationMs(5 * 60_000)).toBe('5 min');
    expect(formatDurationMs(125 * 60_000)).toBe('2 h 05');
    expect(formatDurationMs(50 * 3_600_000)).toBe('2 j 2 h');
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

  it('vue Demandes : 5 colonnes, numéro court, retard et urgence en rouge, détails au survol', async () => {
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

    // Titre sur une ligne, numéro court ; « En retard » remplace le statut ; noms fusionnés.
    expect(within(late!).getByRole('link', { name: /Réparation climatiseur/ })).toHaveAttribute('href', '/demandes/r4');
    expect(within(late!).getByText('#004')).toBeVisible();
    expect(within(late!).getByText('Haute')).toBeVisible();
    expect(within(late!).getByText('En retard')).toBeVisible();
    expect(within(late!).queryByText('Envoyée')).not.toBeInTheDocument();
    expect(late).toHaveTextContent(/Super admin\s*→\s*, affectée à Technicien/);
    expect(within(rejected!).getByText('Refusée')).toBeVisible();
    expect(rejected).toHaveTextContent(/Enseignante\s*→\s*, affectée à —/);
    // Dates sans l'année.
    const created = within(late!).getAllByRole('cell').at(-1)!;
    expect(created.textContent).toMatch(/^\d{1,2} oct\., \d{2}:\d{2}$/);

    // Sans pilule : la priorité et le statut sont du texte simple.
    expect(late!.querySelector('.MuiBadge-root, [data-testid]')).toBeNull();

    // Survol (ou focus) : numéro complet, catégorie et échéance.
    await user.hover(within(late!).getByRole('link', { name: /Réparation climatiseur/ }));
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('D-2026-000004');
    expect(tip).toHaveTextContent('Petits travaux');
    expect(tip).toHaveTextContent('Échéance');
  });

  it('s’ouvre sur « Vue générale » (page d’accueil après connexion), sans changer l’ordre des onglets', async () => {
    setup('/');
    expect(await screen.findByText('Demandes créées sur la période')).toBeVisible();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Vue générale', 'Délais', 'Employés', 'Demandes', 'Activité']);
    expect(screen.getByRole('tab', { name: 'Vue générale' })).toHaveAttribute('aria-selected', 'true');
  });
});
