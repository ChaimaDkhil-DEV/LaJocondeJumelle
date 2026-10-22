import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/Toast';
import { CoverageActions } from '../../src/features/coverage/CoverageActions';
import { CoveragePage } from '../../src/features/coverage/CoveragePage';
import { PresencePage } from '../../src/features/coverage/PresencePage';
import type { CoverageDetail, CoverageSummary } from '../../src/features/coverage/types';

/**
 * Affectations (004) : actions autorisées par le serveur, motifs, assignation par l'admin sans
 * forçage, onglets du surveillant (plus d'onglet « À prendre »), page du QR de la classe.
 */

const NOW = new Date().toISOString();

function summary(overrides: Partial<CoverageSummary> = {}): CoverageSummary {
  return {
    id: 'g1',
    reference: 'G-2026-000001',
    status: 'PENDING',
    mainStatus: 'PENDING',
    subState: null,
    source: 'TEACHER_REQUEST',
    type: 'LATENESS',
    priority: 'URGENT',
    version: 1,
    category: { id: 'c1', name: 'Garde de classe' },
    class: { id: 'k1', name: '1ère année Violet', room: 'Salle 12' },
    floor: { id: 'f1', name: '1er étage' },
    teacher: { id: 't1', displayName: 'Enseignante' },
    absentTeacher: null,
    startAt: NOW,
    estimatedMinutes: null,
    plannedEndAt: null,
    requester: { id: 't1', displayName: 'Enseignante' },
    assignee: null,
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
      createdAt: NOW,
      acceptedAt: null,
      departedAt: null,
      presenceAt: null,
      relievedAt: null,
      closedAt: null,
      cancelledAt: null,
    },
    ...overrides,
  };
}

function detail(overrides: Partial<CoverageDetail> = {}): CoverageDetail {
  return {
    ...summary(),
    view: 'ADMIN',
    reason: null,
    note: null,
    voice: null,
    proofMode: 'BOTH',
    finalValidation: false,
    cancelReason: null,
    allowedActions: [],
    modifiableFields: [],
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
  it('n’affiche que les actions autorisées par le serveur ; plus de « Je prends » ni de désistement', () => {
    mockFetch(() => json(200, {}));
    renderWith(<CoverageActions detail={detail({ status: 'ON_DUTY', allowedActions: ['REQUEST_RELIEF', 'RELIEVE', 'EXTEND'] })} />);
    expect(screen.getByRole('button', { name: 'Terminer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Demander une relève' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Je prends' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Me désister' })).not.toBeInTheDocument();
  });

  it('« Terminer » : la confirmation s’affiche même si la carte disparaît avant la réponse', async () => {
    // Comme en navigateur (vu en e2e, 768 px) : la mise à jour temps réel retire la carte de
    // « Mes affectations » avant que la réponse de l'action n'arrive.
    const user = userEvent.setup();
    let hide = () => {};
    function Card() {
      const [shown, setShown] = useState(true);
      hide = () => setShown(false);
      return shown ? (
        <CoverageActions detail={detail({ status: 'ON_DUTY', allowedActions: ['RELIEVE'] })} />
      ) : (
        <p>Aucune affectation en cours</p>
      );
    }
    mockFetch(async (call) => {
      if (call.method !== 'POST') return json(200, {});
      queueMicrotask(hide);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return json(200, detail({ status: 'DONE', allowedActions: [] }));
    });
    renderWith(<Card />);
    await user.click(screen.getByRole('button', { name: 'Terminer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Terminer l’affectation ?' });
    await user.click(within(dialog).getByRole('button', { name: 'Terminer' }));
    expect(await screen.findByText('Aucune affectation en cours')).toBeInTheDocument();
    expect(await screen.findByText('Affectation terminée.')).toBeInTheDocument();
  });

  it('demande de relève : motif obligatoire, envoyé avec la version', async () => {
    const user = userEvent.setup();
    const calls = mockFetch(() => json(200, detail({ status: 'RELIEF_PENDING' })));
    renderWith(<CoverageActions detail={detail({ status: 'ON_DUTY', version: 4, allowedActions: ['REQUEST_RELIEF'] })} />);

    await user.click(screen.getByRole('button', { name: 'Demander une relève' }));
    const dialog = await screen.findByRole('dialog', { name: 'Demander une relève' });
    await user.click(within(dialog).getByRole('button', { name: 'Demander une relève' }));
    expect(await within(dialog).findByText('Le motif est obligatoire.')).toBeInTheDocument();
    expect(posts(calls, '/api/coverage/g1/actions')).toHaveLength(0);

    await user.type(within(dialog).getByLabelText('Motif de la demande de relève'), 'Malaise');
    await user.click(within(dialog).getByRole('button', { name: 'Demander une relève' }));
    await waitFor(() => expect(posts(calls, '/api/coverage/g1/actions')).toHaveLength(1));
    expect(posts(calls, '/api/coverage/g1/actions')[0].body).toEqual({ action: 'REQUEST_RELIEF', reason: 'Malaise', version: 4 });
  });

  it('assignation par l’admin : étage de la classe d’abord, indisponibles non sélectionnables, jamais de forçage', async () => {
    const user = userEvent.setup();
    const calls = mockFetch((call) => {
      if (call.url === '/api/coverage/g1/candidates') {
        return json(200, [
          { id: 'e1', displayName: 'Surveillant', jobTitle: null, floor: { id: 'f1', name: '1er étage' }, sameFloor: true, available: false, reason: 'ON_GUARD' },
          { id: 'e2', displayName: 'Surveillant 2e étage', jobTitle: null, floor: { id: 'f2', name: '2e étage' }, sameFloor: false, available: true, reason: null },
        ]);
      }
      return json(200, detail());
    });
    renderWith(<CoverageActions detail={detail({ isManager: true, allowedActions: ['ASSIGN', 'CANCEL'] })} />);

    await user.click(screen.getByRole('button', { name: 'Assigner un surveillant' }));
    const dialog = await screen.findByRole('dialog', { name: 'Assigner un surveillant' });
    const busy = await within(dialog).findByRole('radio', { name: /^Surveillant · 1er étage/ });
    expect(busy).toBeDisabled();
    expect(within(dialog).getByText(/Déjà affecté/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Assigner' }));
    expect(within(dialog).getByText('Choisissez un surveillant disponible.')).toBeInTheDocument();
    expect(posts(calls, '/api/coverage/g1/actions')).toHaveLength(0);

    await user.click(within(dialog).getByRole('radio', { name: /Surveillant 2e étage/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Assigner' }));
    await waitFor(() => expect(posts(calls, '/api/coverage/g1/actions')).toHaveLength(1));
    expect(posts(calls, '/api/coverage/g1/actions')[0].body).toEqual({ action: 'ASSIGN', assigneeId: 'e2', version: 1 });
  });

  it('annulation par l’admin : motif facultatif', async () => {
    const user = userEvent.setup();
    const calls = mockFetch(() => json(200, detail({ status: 'CANCELLED' })));
    renderWith(<CoverageActions detail={detail({ isManager: true, allowedActions: ['CANCEL'] })} />);
    await user.click(screen.getByRole('button', { name: 'Annuler l’affectation' }));
    const dialog = await screen.findByRole('dialog', { name: 'Annuler l’affectation' });
    await user.click(within(dialog).getByRole('button', { name: 'Annuler l’affectation' }));
    await waitFor(() => expect(posts(calls, '/api/coverage/g1/actions')).toHaveLength(1));
    expect(posts(calls, '/api/coverage/g1/actions')[0].body).toEqual({ action: 'CANCEL', version: 1 });
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

describe('Onglets du surveillant', () => {
  it('« Mes affectations » et « Historique » ; plus d’onglet « À prendre »', async () => {
    mockFetch((call) => {
      if (call.url === '/api/coverage/availability') {
        return json(200, { availability: 'AVAILABLE', activeGuards: [], isTeacher: false, isSupervisor: true, inGroup: true, canManage: false });
      }
      if (call.url === '/api/coverage/mine') {
        return json(200, {
          availability: { availability: 'AVAILABLE', activeGuards: [], isTeacher: false, isSupervisor: true, inGroup: true, canManage: false },
          items: [detail({ status: 'ACCEPTED', mainStatus: 'ASSIGNED', view: 'SUPERVISOR', allowedActions: ['DEPART'] })],
        });
      }
      return json(200, {});
    });
    renderWith(<CoveragePage />, '/gardes');
    expect(await screen.findByRole('tab', { name: 'Mes affectations' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Historique' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'À prendre' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Je suis en route' })).toBeInTheDocument();
  });
});

describe('Page du QR code de la classe', () => {
  function setupQr(handler?: (call: Call) => Response | undefined) {
    return mockFetch((call) => {
      const custom = handler?.(call);
      if (custom) return custom;
      if (call.url === '/api/coverage/presence/resolve') {
        return json(200, { class: { id: 'k1', name: '1ère année Violet', room: 'Salle 12' }, coverage: summary({ status: 'ACCEPTED', mainStatus: 'ASSIGNED' }), otherClassGuard: false });
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
