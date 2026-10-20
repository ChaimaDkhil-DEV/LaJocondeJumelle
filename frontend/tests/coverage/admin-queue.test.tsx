import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canSeeCoverage } from '../../src/app/AppLayout';
import { ToastProvider } from '../../src/components/Toast';
import { CoveragePage } from '../../src/features/coverage/CoveragePage';

/**
 * T051 / T059 — File de l'admin (« En attente » en tête, délais expirés mis en évidence) ; onglets de
 * l'enseignant ; visibilité du menu « Gardes » (FR-011e, FR-023b).
 */

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const NOW = new Date().toISOString();

function item(id: string, className: string, alerts: string[]) {
  return {
    id,
    reference: `G-2026-${id}`,
    status: 'PENDING',
    mainStatus: 'PENDING',
    subState: null,
    source: 'TEACHER_REQUEST',
    type: 'LATENESS',
    priority: 'URGENT',
    version: 0,
    category: { id: 'c1', name: 'Garde de classe' },
    class: { id: `k-${id}`, name: className, room: null },
    floor: { id: 'f1', name: '1er étage' },
    teacher: { id: 't1', displayName: 'Enseignante' },
    absentTeacher: null,
    startAt: NOW,
    estimatedMinutes: 60,
    plannedEndAt: NOW,
    requester: { id: 't1', displayName: 'Enseignante' },
    assignee: null,
    supports: [],
    alerts,
    reliefForId: null,
    mergedIntoId: null,
    hasVoice: false,
    hasNote: false,
    currentStage: null,
    currentDueAt: null,
    overdueStage: null,
    extensionCount: 0,
    durationMinutes: null,
    timestamps: { createdAt: NOW, acceptedAt: null, departedAt: null, presenceAt: null, relievedAt: null, closedAt: null, cancelledAt: null },
  };
}

function setup(profile: Record<string, unknown>, handler: (url: string) => Response | undefined = () => undefined) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      const custom = handler(url);
      if (custom) return custom;
      if (url === '/api/coverage/availability') {
        return json(200, {
          availability: 'AVAILABLE',
          activeGuards: [],
          isTeacher: false,
          isSupervisor: false,
          inGroup: false,
          canManage: false,
          schoolDates: { timezone: 'Europe/Paris', today: '2026-10-20', tomorrow: '2026-10-21' },
          ...profile,
        });
      }
      return json(200, []);
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/gardes']}>
          <CoveragePage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return urls;
}

afterEach(() => vi.unstubAllGlobals());

describe('File de l’admin', () => {
  it('onglet « En attente » en tête ; demande au délai dépassé en premier et mise en évidence', async () => {
    const urls = setup({ canManage: true }, (url) =>
      url === '/api/coverage?mainStatus=PENDING' ? json(200, [item('1', 'CE1 Vert', ['TAKEOVER_EXPIRED']), item('2', 'CE2 Jaune', [])]) : undefined,
    );
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['En attente', 'En cours', 'Doublons', 'Équipe', 'Terminées']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    const rows = within(await screen.findByRole('list')).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('CE1 Vert');
    expect(within(rows[0]).getByText('Délai d’assignation dépassé')).toBeInTheDocument();
    expect(within(rows[1]).queryByText('Délai d’assignation dépassé')).not.toBeInTheDocument();
    expect(urls).toContain('/api/coverage?mainStatus=PENDING');
  });
});

describe('Enseignant', () => {
  it('onglet « Mes signalements » et bouton « Signaler un retard ou une absence »', async () => {
    setup({ isTeacher: true }, (url) => (url === '/api/coverage/my-requests' ? json(200, [item('3', 'CM1 A', [])]) : undefined));
    expect(await screen.findByRole('tab', { name: 'Mes signalements' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('link', { name: 'Signaler un retard ou une absence' })).toHaveAttribute('href', '/gardes/signaler');
    expect(await screen.findByRole('link', { name: /CM1 A/ })).toHaveAttribute('href', '/gardes/signalements/3');
  });
});

describe('Menu « Gardes » (FR-023b)', () => {
  const me = (role: string, isTeacher = false, isSupervisor = false) => ({
    id: 'u',
    displayName: 'u',
    role,
    permissions: [],
    mustChangePassword: false,
    isTeacher,
    isSupervisor,
  });

  it.each([
    ['admin', me('ADMIN'), true],
    ['super administrateur', me('SUPER_ADMIN'), true],
    ['enseignant', me('EMPLOYEE', true), true],
    ['surveillant', me('EMPLOYEE', false, true), true],
    ['autre employé', me('EMPLOYEE'), false],
  ] as const)('%s', (_label, user, visible) => {
    expect(canSeeCoverage(user as never)).toBe(visible);
  });
});
