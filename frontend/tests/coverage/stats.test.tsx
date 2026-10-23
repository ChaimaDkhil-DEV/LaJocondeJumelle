import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/Toast';
import { CoverageDetailPage } from '../../src/features/coverage/CoverageDetailPage';
import { CoverageStatsPage } from '../../src/features/coverage/CoverageStatsPage';

/**
 * T080 — Statistiques (US5, FR-022) : filtres de période et de regroupement, tableau accessible,
 * « Enseignant non précisé », annulées et doublons « non tranchés » à part ; export CSV (spec 008) ;
 * historique détaillé (sources, statuts, auteurs, réassignations, renforts, doublons).
 */

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PROFILE = {
  availability: 'AVAILABLE',
  activeGuards: [],
  isTeacher: false,
  isSupervisor: false,
  inGroup: false,
  canManage: true,
  schoolDates: { timezone: 'Europe/Paris', today: '2026-10-20', tomorrow: '2026-10-21' },
};

const STATS = {
  from: '2026-10-01',
  to: '2026-10-20',
  groupBy: 'teacher',
  period: 'week',
  timezone: 'Europe/Paris',
  totals: {
    events: 4,
    lateness: 2,
    absence: 1,
    emptyClass: 1,
    cancelled: 2,
    unfilled: 1,
    unfilledRate: 0.25,
    averageDurationMinutes: 30,
    undecidedDuplicates: 1,
  },
  rows: [
    {
      key: 't1',
      label: 'Enseignante',
      events: 3,
      lateness: 2,
      absence: 1,
      emptyClass: 0,
      cancelled: 2,
      unfilled: 1,
      unfilledRate: 0.333,
      averageDurationMinutes: 25,
    },
    {
      key: 'none',
      label: 'Enseignant non précisé',
      events: 1,
      lateness: 0,
      absence: 0,
      emptyClass: 1,
      cancelled: 0,
      unfilled: 0,
      unfilledRate: 0,
      averageDurationMinutes: null,
    },
  ],
};

function setup(
  path: string,
  handler: (url: string) => Response | undefined = () => undefined,
): string[] {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      const custom = handler(url);
      if (custom) return custom;
      if (url === '/api/coverage/availability') return json(200, PROFILE);
      if (url.startsWith('/api/coverage/stats?')) return json(200, STATS);
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/gardes/statistiques" element={<CoverageStatsPage />} />
            <Route path="/gardes/:id" element={<CoverageDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return urls;
}

const statsCalls = (urls: string[]) =>
  urls
    .filter((u) => u.startsWith('/api/coverage/stats?'))
    .map((u) => new URL(u, 'http://test').searchParams);

afterEach(() => vi.unstubAllGlobals());

describe('Statistiques des affectations', () => {
  it('période par défaut (mois en cours de l’école), regroupement par enseignant ; tableau accessible', async () => {
    const urls = setup('/gardes/statistiques');
    expect(
      await screen.findByRole('heading', { name: 'Statistiques des affectations' }),
    ).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: /Par enseignant/ });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      'Enseignant',
      'Événements',
      'Retards',
      'Absences',
      'Classes vides',
      'Non pourvues',
      'Annulées',
      'Durée moyenne',
    ]);
    // Tableau plus large que l'écran à 320 px : zone de défilement atteignable au clavier (axe, constat T086).
    const region = screen.getByRole('region', { name: 'Par enseignant' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toContainElement(table);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent('Enseignant non précisé');
    expect(rows[1]).toHaveTextContent('—'); // durée inconnue
    const [first] = statsCalls(urls);
    expect(Object.fromEntries(first)).toEqual({
      from: '2026-10-01',
      to: '2026-10-20',
      groupBy: 'teacher',
    });
  });

  it('totaux : taux de non pourvue, durée moyenne ; annulées et doublons non tranchés à part', async () => {
    setup('/gardes/statistiques');
    const totals = await screen.findByRole('region', { name: 'Totaux de la période' });
    expect(within(totals).getByText('Retards et absences').nextSibling).toHaveTextContent('4');
    expect(within(totals).getByText('Taux de non pourvue').nextSibling).toHaveTextContent('25 %');
    expect(within(totals).getByText('Durée moyenne').nextSibling).toHaveTextContent('30 min');
    const apart = screen.getByRole('region', { name: 'Comptés à part' });
    expect(within(apart).getByText(/Annulées/).nextSibling).toHaveTextContent('2');
    expect(within(apart).getByText(/Doublons non tranchés/).nextSibling).toHaveTextContent('1');
  });

  it('changer le regroupement et la période relance le calcul', async () => {
    const u = userEvent.setup();
    const urls = setup('/gardes/statistiques');
    await screen.findByRole('table');
    await u.click(screen.getByRole('combobox', { name: 'Regrouper par' }));
    await u.click(await screen.findByRole('option', { name: 'Période' }));
    await u.click(await screen.findByRole('combobox', { name: 'Période' }));
    await u.click(await screen.findByRole('option', { name: 'Mois' }));
    await waitFor(() =>
      expect(Object.fromEntries(statsCalls(urls).at(-1)!)).toMatchObject({
        groupBy: 'period',
        period: 'month',
      }),
    );
    const from = screen.getByLabelText('Du');
    await u.clear(from);
    await u.type(from, '2026-09-01');
    await waitFor(() => expect(statsCalls(urls).at(-1)!.get('from')).toBe('2026-09-01'));
  });

  it('période incohérente : message clair', async () => {
    setup('/gardes/statistiques', (url) =>
      url.startsWith('/api/coverage/stats?')
        ? json(400, {
            error: {
              code: 'INVALID_RANGE',
              message: 'Le créneau est invalide : la fin doit suivre le début.',
            },
          })
        : undefined,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('la fin doit suivre le début');
  });
});

describe('Export des statistiques (008)', () => {
  const exportLink = () => screen.findByRole('link', { name: 'Exporter en CSV' });
  const exportParams = (link: HTMLElement) => {
    const url = new URL(link.getAttribute('href')!, 'http://test');
    expect(url.pathname).toBe('/api/coverage/stats/export.csv');
    return Object.fromEntries(url.searchParams);
  };

  it('après le calcul : lien de téléchargement avec les paramètres de la requête affichée', async () => {
    const urls = setup('/gardes/statistiques');
    const link = await exportLink();
    expect(link).toHaveAttribute('download');
    expect(exportParams(link)).toEqual(Object.fromEntries(statsCalls(urls).at(-1)!));
    expect(exportParams(link)).toEqual({ from: '2026-10-01', to: '2026-10-20', groupBy: 'teacher' });
  });

  it('l’adresse suit le regroupement (« Période › Mois »)', async () => {
    const u = userEvent.setup();
    setup('/gardes/statistiques');
    await exportLink();
    await u.click(screen.getByRole('combobox', { name: 'Regrouper par' }));
    await u.click(await screen.findByRole('option', { name: 'Période' }));
    await u.click(await screen.findByRole('combobox', { name: 'Période' }));
    await u.click(await screen.findByRole('option', { name: 'Mois' }));
    await waitFor(async () =>
      expect(exportParams(await exportLink())).toEqual({
        from: '2026-10-01',
        to: '2026-10-20',
        groupBy: 'period',
        period: 'month',
      }),
    );
  });

  it('date incomplète : lien absent ; date complète et calcul fini : lien de nouveau présent', async () => {
    const u = userEvent.setup();
    setup('/gardes/statistiques');
    await exportLink();
    const to = screen.getByLabelText('Au');
    await u.clear(to);
    expect(screen.queryByRole('link', { name: 'Exporter en CSV' })).not.toBeInTheDocument();
    await u.type(to, '2026-10-15');
    await waitFor(async () => expect(exportParams(await exportLink()).to).toBe('2026-10-15'));
  });

  it('recalcul en cours après un changement de filtre : lien absent, anciennes valeurs affichées', async () => {
    const u = userEvent.setup();
    let release!: () => void;
    const pending = new Promise<void>((r) => (release = r));
    setup('/gardes/statistiques');
    await exportLink();
    // Le calcul des nouveaux filtres reste en attente jusqu'à `release()`.
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/coverage/stats?')) {
        await pending;
        return json(200, { ...STATS, groupBy: 'class' });
      }
      return json(200, PROFILE);
    });
    await u.click(screen.getByRole('combobox', { name: 'Regrouper par' }));
    await u.click(await screen.findByRole('option', { name: 'Classe' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Exporter en CSV' })).not.toBeInTheDocument();
    release();
    await waitFor(async () => expect(exportParams(await exportLink()).groupBy).toBe('class'));
  });

  it('erreur de calcul : lien absent', async () => {
    setup('/gardes/statistiques', (url) =>
      url.startsWith('/api/coverage/stats?')
        ? json(400, { error: { code: 'INVALID_RANGE', message: 'Période invalide.' } })
        : undefined,
    );
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Exporter en CSV' })).not.toBeInTheDocument();
  });

  it('période vide : lien présent', async () => {
    setup('/gardes/statistiques', (url) =>
      url.startsWith('/api/coverage/stats?')
        ? json(200, { ...STATS, rows: [] })
        : undefined,
    );
    expect(await screen.findByText('Aucune affectation sur la période')).toBeInTheDocument();
    expect(await exportLink()).toBeInTheDocument();
  });
});

describe('Historique détaillé', () => {
  const at = '2026-10-20T08:00:00.000Z';
  const admin = { id: 'a1', displayName: 'Admin' };
  const history = [
    {
      id: 'e1',
      type: 'CREATED',
      actor: admin,
      fromValue: null,
      toValue: { source: 'ADMIN_DIRECT', type: 'ABSENCE' },
      comment: null,
      createdAt: at,
    },
    {
      id: 'e2',
      type: 'STATUS_CHANGED',
      actor: admin,
      fromValue: null,
      toValue: { status: 'ACCEPTED' },
      comment: null,
      createdAt: at,
    },
    {
      id: 'e3',
      type: 'REASSIGNED',
      actor: admin,
      fromValue: { assigneeId: 's1', assigneeName: 'Surveillant' },
      toValue: { assigneeId: 's2', assigneeName: 'Remplaçante' },
      comment: null,
      createdAt: at,
    },
    {
      id: 'e4',
      type: 'SUPPORT_JOINED',
      actor: null,
      fromValue: null,
      toValue: { userId: 's3', userName: 'Surveillant 2e étage' },
      comment: null,
      createdAt: at,
    },
    {
      id: 'e5',
      type: 'SUPPORT_RELEASED',
      actor: admin,
      fromValue: null,
      toValue: { userId: 's3', userName: 'Surveillant 2e étage' },
      comment: null,
      createdAt: at,
    },
    {
      id: 'e6',
      type: 'TEACHER_SET',
      actor: admin,
      fromValue: { teacherId: null },
      toValue: { teacherId: 't1', teacherName: 'Enseignante' },
      comment: null,
      createdAt: at,
    },
    {
      id: 'e7',
      type: 'MERGE_DECIDED',
      actor: admin,
      fromValue: null,
      toValue: { decision: 'CONFIRM' },
      comment: null,
      createdAt: at,
    },
    {
      id: 'e8',
      type: 'ANONYMIZED',
      actor: null,
      fromValue: null,
      toValue: {},
      comment: null,
      createdAt: at,
    },
  ];

  it('sources, statuts, auteurs, réassignations, renforts, enseignant, doublons', async () => {
    setup('/gardes/g1', (url) =>
      url === '/api/coverage/g1'
        ? json(200, {
            id: 'g1',
            reference: 'G-2026-000001',
            status: 'ACCEPTED',
            mainStatus: 'ASSIGNED',
            subState: null,
            source: 'ADMIN_DIRECT',
            type: 'ABSENCE',
            priority: 'URGENT',
            version: 4,
            category: { id: 'c1', name: 'Garde de classe' },
            class: { id: 'k1', name: '1ère année Violet', room: null },
            floor: { id: 'f1', name: '1er étage' },
            teacher: { id: 't1', displayName: 'Enseignante' },
            absentTeacher: null,
            startAt: at,
            estimatedMinutes: 60,
            plannedEndAt: at,
            requester: admin,
            assignee: { id: 's2', displayName: 'Remplaçante' },
            supports: [],
            alerts: [],
            reliefForId: null,
            mergedIntoId: null,
            hasVoice: false,
            hasNote: false,
            currentStage: null,
            currentDueAt: null,
            overdueStage: null,
            extensionCount: 0,
            durationMinutes: null,
            timestamps: {
              createdAt: at,
              acceptedAt: at,
              departedAt: null,
              presenceAt: null,
              relievedAt: null,
              closedAt: null,
              cancelledAt: null,
            },
            view: 'ADMIN',
            reason: null,
            note: null,
            voice: null,
            proofMode: 'QR',
            finalValidation: false,
            cancelReason: null,
            allowedActions: [],
            modifiableFields: [],
            isManager: true,
            presences: [],
            history,
          })
        : url === '/api/coverage/teachers'
          ? json(200, [])
          : undefined,
    );
    const timeline = await screen.findByRole('list', { name: 'Historique de l’affectation' });
    const items = within(timeline)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items[0]).toMatch(/Affectation créée — affectation directe.*Admin/);
    expect(items[1]).toMatch(/Statut : Assignée/);
    expect(items[2]).toMatch(/Réassignée de Surveillant à Remplaçante/);
    expect(items[3]).toMatch(/Renfort arrivé : Surveillant 2e étage.*Système/);
    expect(items[4]).toMatch(/Renfort libéré : Surveillant 2e étage/);
    expect(items[5]).toMatch(/Enseignant : non précisé → Enseignante/);
    expect(items[6]).toMatch(/Doublon tranché : rattachement confirmé/);
    expect(items[7]).toMatch(/Données personnelles anonymisées/);
  });
});
