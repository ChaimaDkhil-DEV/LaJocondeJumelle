import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/Toast';
import { CoverageActions } from '../../src/features/coverage/CoverageActions';
import { CoverageDetailPage } from '../../src/features/coverage/CoverageDetailPage';
import { CreateCoveragePage } from '../../src/features/coverage/CreateCoveragePage';
import { OpenCoverageTab } from '../../src/features/coverage/EmployeeViews';
import { PresencePage } from '../../src/features/coverage/PresencePage';
import type { CoverageDetail, OpenCoverage } from '../../src/features/coverage/types';

/** Couverture de classe : actions autorisées, motifs, affectation forcée, « Je prends », page du QR, groupe vide. */

const NOW = new Date().toISOString();

function summary(overrides: Partial<OpenCoverage> = {}): OpenCoverage {
  return {
    id: 'g1',
    reference: 'G-2026-000001',
    status: 'BROADCAST',
    priority: 'URGENT',
    version: 1,
    category: { id: 'c1', name: 'Garde de classe' },
    class: { id: 'k1', name: '1ère année Violet', room: 'Salle 12' },
    absentTeacher: null,
    startAt: NOW,
    estimatedMinutes: null,
    plannedEndAt: null,
    groups: [{ id: 'grp', name: 'Surveillants/Remplaçants' }],
    requester: { id: 'resp', displayName: 'Responsable administratif' },
    assignee: null,
    reliefForId: null,
    hasVoice: false,
    hasNote: false,
    currentStage: 'TAKEOVER',
    currentDueAt: new Date(Date.now() + 120_000).toISOString(),
    overdueStage: null,
    releaseCount: 0,
    extensionCount: 0,
    durationMinutes: null,
    timestamps: {
      createdAt: NOW,
      broadcastAt: NOW,
      acceptedAt: null,
      departedAt: null,
      presenceAt: null,
      relievedAt: null,
      closedAt: null,
      cancelledAt: null,
    },
    canAccept: true,
    ...overrides,
  };
}

function detail(overrides: Partial<CoverageDetail> = {}): CoverageDetail {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- canAccept n'existe que dans le résumé
  const { canAccept: _ignored, ...base } = summary();
  return {
    ...base,
    limited: false,
    note: null,
    voice: null,
    proofMode: 'BOTH',
    finalValidation: false,
    cancelReason: null,
    allowedActions: [],
    isManager: false,
    presences: [],
    history: [],
    ...overrides,
  };
}

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Call = { url: string; method: string; body: unknown };

function mockFetch(handler: (call: Call) => Response | Promise<Response>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call: Call = {
        url,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
      };
      calls.push(call);
      return handler(call);
    }),
  );
  return calls;
}

function renderWith(ui: ReactNode, path = '/') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const posts = (calls: Call[], url: string) => calls.filter((c) => c.method === 'POST' && c.url === url);

beforeAll(() => {
  // jsdom n'implémente pas createObjectURL (aperçu des photos).
  URL.createObjectURL = vi.fn(() => 'blob:aperçu');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => vi.unstubAllGlobals());

describe('Actions d’une garde', () => {
  it('n’affiche que les actions autorisées par le serveur', () => {
    mockFetch(() => json(200, {}));
    renderWith(<CoverageActions detail={detail({ status: 'ON_DUTY', allowedActions: ['REQUEST_RELIEF', 'RELIEVE', 'EXTEND'] })} />);
    expect(screen.getByRole('button', { name: 'Garde terminée' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Demander une relève' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Me désister' })).not.toBeInTheDocument();
  });

  it('désistement : motif obligatoire, envoyé avec la version', async () => {
    const user = userEvent.setup();
    const calls = mockFetch(() => json(200, detail({ status: 'BROADCAST' })));
    renderWith(<CoverageActions detail={detail({ status: 'ACCEPTED', version: 4, allowedActions: ['DEPART', 'RELEASE'] })} />);

    await user.click(screen.getByRole('button', { name: 'Me désister' }));
    const dialog = await screen.findByRole('dialog', { name: 'Me désister de cette garde' });
    await user.click(within(dialog).getByRole('button', { name: 'Me désister' }));
    expect(await within(dialog).findByText('Le motif est obligatoire.')).toBeInTheDocument();
    expect(posts(calls, '/api/coverage/g1/actions')).toHaveLength(0);

    await user.type(within(dialog).getByLabelText('Motif du désistement'), 'Appelée en urgence');
    await user.click(within(dialog).getByRole('button', { name: 'Me désister' }));
    await waitFor(() => expect(posts(calls, '/api/coverage/g1/actions')).toHaveLength(1));
    expect(posts(calls, '/api/coverage/g1/actions')[0].body).toEqual({ action: 'RELEASE', reason: 'Appelée en urgence', version: 4 });
  });

  it('affectation d’un employé déjà en garde : confirmation explicite obligatoire, puis force=true', async () => {
    const user = userEvent.setup();
    const calls = mockFetch((call) => {
      if (call.url === '/api/coverage/g1/candidates') {
        return json(200, [
          { id: 'e1', displayName: 'Surveillant', jobTitle: null, inTargetGroup: true, available: false, reason: 'ON_GUARD' },
          { id: 'e2', displayName: 'Remplaçante', jobTitle: null, inTargetGroup: true, available: true, reason: null },
        ]);
      }
      return json(200, detail());
    });
    renderWith(<CoverageActions detail={detail({ status: 'UNFILLED', isManager: true, allowedActions: ['ASSIGN', 'WIDEN', 'CANCEL'] })} />);

    await user.click(screen.getByRole('button', { name: 'Affecter' }));
    const dialog = await screen.findByRole('dialog', { name: 'Affecter la garde' });
    await user.click(await within(dialog).findByRole('radio', { name: /Surveillant/ }));
    expect(within(dialog).getByText(/n’est pas disponible \(déjà en garde\)/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Affecter' }));
    expect(within(dialog).getByText('Cochez la confirmation pour forcer l’affectation.')).toBeInTheDocument();
    expect(posts(calls, '/api/coverage/g1/actions')).toHaveLength(0);

    await user.click(within(dialog).getByRole('checkbox', { name: 'Je confirme l’affectation forcée' }));
    await user.click(within(dialog).getByRole('button', { name: 'Affecter' }));
    await waitFor(() => expect(posts(calls, '/api/coverage/g1/actions')).toHaveLength(1));
    expect(posts(calls, '/api/coverage/g1/actions')[0].body).toMatchObject({ action: 'ASSIGN', assigneeId: 'e1', force: true });
  });

  it('confirmation de présence avec QR : instructions de scan, aucun envoi depuis ce dialogue', async () => {
    const user = userEvent.setup();
    const calls = mockFetch(() => json(200, detail()));
    renderWith(<CoverageActions detail={detail({ status: 'ACCEPTED', proofMode: 'BOTH', allowedActions: ['CONFIRM_PRESENCE'] })} />);
    await user.click(screen.getByRole('button', { name: 'Confirmer ma présence' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/scannez le QR code affiché dans la classe/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Confirmer ma présence' })).not.toBeInTheDocument();
    expect(posts(calls, '/api/coverage/g1/actions')).toHaveLength(0);
  });
});

describe('Onglet « À prendre »', () => {
  const profile = { availability: 'AVAILABLE', activeGuards: [], inGroup: true, canManage: false };

  it('carte lisible avec « Je prends » ; course perdue : « Déjà prise par … »', async () => {
    const user = userEvent.setup();
    mockFetch((call) => {
      if (call.url === '/api/coverage/open') return json(200, { availability: profile, items: [summary()] });
      if (call.url === '/api/coverage/g1/actions') {
        return json(409, { error: { code: 'ALREADY_TAKEN', message: 'Déjà prise par Surveillant.' } });
      }
      return json(200, {});
    });
    renderWith(<OpenCoverageTab />);
    const card = await screen.findByRole('article', { name: /1ère année Violet/ });
    expect(within(card).getByText('Salle 12')).toBeInTheDocument();
    expect(within(card).getByText('Urgente')).toBeInTheDocument();
    expect(within(card).getByText('Jusqu’à l’arrivée de l’enseignant')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Je prends' }));
    expect(await screen.findByText('Déjà prise par Surveillant.')).toBeInTheDocument();
  });

  it('bouton désactivé si l’employé est déjà en garde sur le créneau', async () => {
    mockFetch((call) =>
      call.url === '/api/coverage/open' ? json(200, { availability: profile, items: [summary({ canAccept: false })] }) : json(200, {}),
    );
    renderWith(<OpenCoverageTab />);
    expect(await screen.findByRole('button', { name: 'Je prends' })).toBeDisabled();
  });
});

describe('Détail d’une garde prise par un autre', () => {
  it('n’affiche que « Déjà prise par [nom] », sans détail', async () => {
    mockFetch(() => json(200, { id: 'g1', reference: 'G-2026-000001', limited: true, takenBy: 'Surveillant', finished: false }));
    renderWith(
      <Routes>
        <Route path="/gardes/:id" element={<CoverageDetailPage />} />
      </Routes>,
      '/gardes/g1',
    );
    expect(await screen.findByText('Déjà prise par Surveillant')).toBeInTheDocument();
    expect(screen.queryByText('Salle 12')).not.toBeInTheDocument();
  });
});

describe('Page du QR code de la classe', () => {
  function setupQr(handler?: (call: Call) => Response | undefined) {
    return mockFetch((call) => {
      const custom = handler?.(call);
      if (custom) return custom;
      if (call.url === '/api/coverage/presence/resolve') {
        return json(200, { class: { id: 'k1', name: '1ère année Violet', room: 'Salle 12' }, coverage: summary({ status: 'ACCEPTED' }), otherClassGuard: false });
      }
      if (call.url === '/api/coverage/g1') return json(200, detail({ status: 'ACCEPTED', proofMode: 'BOTH', allowedActions: ['CONFIRM_PRESENCE', 'DEPART'] }));
      if (call.url === '/api/files') return json(201, { id: 'photo-1', kind: 'PHOTO', mimeType: 'image/jpeg', sizeBytes: 100 });
      if (call.url === '/api/coverage/g1/actions') return json(200, detail({ status: 'ON_DUTY' }));
      return json(200, {});
    });
  }

  it('ouvrir la page ne valide rien : confirmation explicite avec photo (capture caméra) et jeton', async () => {
    const user = userEvent.setup();
    const calls = setupQr();
    renderWith(
      <Routes>
        <Route path="/gardes/presence" element={<PresencePage />} />
        <Route path="/gardes" element={<p>Gardes</p>} />
      </Routes>,
      '/gardes/presence?c=jeton-signe',
    );
    expect(await screen.findByRole('heading', { name: 'Confirmer ma présence en classe 1ère année Violet' })).toBeInTheDocument();
    expect(screen.getByText('Photographiez la porte ou l’intérieur de la classe, évitez de cadrer les visages des enfants.')).toBeInTheDocument();
    expect(posts(calls, '/api/coverage/g1/actions')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Confirmer ma présence' })).toBeDisabled();

    // Capture directe par la caméra : pas de choix dans la galerie.
    const input = screen.getByLabelText('Prendre la photo');
    expect(input).toHaveAttribute('capture', 'environment');
    expect(screen.queryByLabelText('Choisir dans la galerie')).not.toBeInTheDocument();
    await user.upload(input, new File(['jpeg'], 'classe.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmer ma présence' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Confirmer ma présence' }));
    await waitFor(() => expect(posts(calls, '/api/coverage/g1/actions')).toHaveLength(1));
    expect(posts(calls, '/api/coverage/g1/actions')[0].body).toEqual({
      action: 'CONFIRM_PRESENCE',
      version: 1,
      qrToken: 'jeton-signe',
      photoFileId: 'photo-1',
    });
  });

  it('QR d’une autre classe : message clair, aucune action', async () => {
    const calls = setupQr((call) =>
      call.url === '/api/coverage/presence/resolve'
        ? json(200, { class: { id: 'k2', name: '2e année Bleu', room: null }, coverage: null, otherClassGuard: true })
        : undefined,
    );
    renderWith(
      <Routes>
        <Route path="/gardes/presence" element={<PresencePage />} />
      </Routes>,
      '/gardes/presence?c=autre',
    );
    expect(await screen.findByText('Ce QR code correspond à la classe 2e année Bleu, qui n’est pas celle de votre garde.')).toBeInTheDocument();
    expect(posts(calls, '/api/coverage/g1/actions')).toHaveLength(0);
  });
});

describe('Création rapide', () => {
  it('avertit avant l’envoi quand le groupe n’a aucun employé disponible', async () => {
    mockFetch((call) => {
      if (call.url === '/api/coverage/form-options') {
        return json(200, {
          categories: [{ id: 'c1', name: 'Garde de classe', proofMode: 'BOTH' }],
          classes: [{ id: 'k1', name: '1ère année Violet', room: 'Salle 12' }],
          groups: [{ id: 'grp', name: 'Surveillants/Remplaçants', memberCount: 2, availableCount: 0 }],
        });
      }
      return json(200, {});
    });
    renderWith(<CreateCoveragePage />);
    expect(await screen.findByText('Aucun employé disponible dans ce groupe.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diffuser' })).toBeEnabled();
    expect(screen.getByLabelText('Surveillants/Remplaçants — 0 disponible sur 2')).toBeChecked();
  });
});
