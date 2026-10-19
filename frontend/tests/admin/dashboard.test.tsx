import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminRoutes } from '../../src/features/admin/adminRoutes';
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

function setup(path = '/admin/tableau-de-bord', handler: Handler = () => undefined, me: unknown = SUPER_ADMIN) {
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
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  const router = createMemoryRouter(adminRoutes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { urls, router };
}

/** Valeur affichée dans la carte d'indicateur portant ce libellé. */
function kpi(label: string): string {
  const card = screen.getByText(label, { selector: 'div' }).closest('.MuiPaper-root') as HTMLElement;
  return within(card).getByRole('paragraph').textContent ?? '';
}

describe('Tableau de bord', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('est réservé au super administrateur, sans appel aux routes /admin', async () => {
    const { urls } = setup('/admin/tableau-de-bord', undefined, { ...SUPER_ADMIN, role: 'MANAGER' });
    expect(await screen.findByText('Accès réservé au super administrateur.')).toBeVisible();
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
    expect(kpi('En retard')).toBe('1');
    expect(kpi('Urgentes en cours')).toBe('2');
    expect(kpi('Vocaux')).toBe('3');
    const alerts = screen.getByRole('table', { name: 'Demandes à traiter en priorité' });
    expect(within(alerts).getByRole('link', { name: 'Photocopies du contrôle' })).toHaveAttribute('href', '/demandes/r1');
    expect(within(alerts).getByText('En retard (prise en charge)', { exact: false })).toBeVisible();
    // Vue tableau des graphiques (accessibilité).
    expect(screen.getByRole('table', { name: 'Demandes créées et terminées par jour' })).toBeInTheDocument();
  });

  it('ne propose que les catégories de demandes de travail et relance la requête au changement de filtre', async () => {
    const user = userEvent.setup();
    const { urls } = setup();
    await screen.findByText('Demandes créées sur la période');
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
    expect(screen.getByRole('link', { name: 'Exporter en CSV' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('propose l’export CSV avec les filtres en cours', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText('Demandes créées sur la période');
    await user.click(screen.getByRole('combobox', { name: 'Priorité' }));
    await user.click(screen.getByRole('option', { name: 'Urgente' }));
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
    setup('/admin/tableau-de-bord', (url) =>
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
    setup('/admin/tableau-de-bord', (url) =>
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
    expect(screen.getByText('Aucune alerte')).toBeVisible();
  });

  it('montre l’évolution quand des demandes créées avant la période y sont terminées', async () => {
    setup('/admin/tableau-de-bord', (url) =>
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
    setup('/admin/tableau-de-bord?vue=delais');
    expect(await screen.findByRole('table', { name: 'Délais par priorité' })).toBeVisible();
    expect(kpi('Respect des délais')).toBe('75 %');
    expect(kpi('Première réponse moyenne')).toBe('2 min');
    expect(kpi('Prise en charge moyenne')).toBe('4 min');
    expect(kpi('Traitement net moyen')).toBe('1 h 30');
    expect(screen.getByRole('columnheader', { name: 'Première réponse' })).toBeVisible();
    expect(screen.getByRole('table', { name: 'Délais par priorité' })).toBeVisible();
  });

  it('décrit l’activité récente sans contenu de message', async () => {
    setup('/admin/tableau-de-bord?vue=activite');
    expect(await screen.findByText('Statut : Envoyée → Acceptée')).toBeVisible();
    expect(screen.getByText('En retard (prise en charge)')).toBeVisible();
    expect(screen.getByText('Système', { exact: false })).toBeVisible();
  });

  it('affiche un état vide pour les employés sans activité', async () => {
    setup('/admin/tableau-de-bord?vue=employes');
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
});
