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
    substituteTeacher: null,
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

});

/**
 * Amendement 004 (FR-011b, 2026-11-09) : la présence se confirme en scannant le QR code de la classe dans
 * l'application, comme la déclaration d'une classe vide (013) ; avec « QR + photo », les deux preuves restent
 * exigées, dans l'ordre voulu, et la présence part dès que les deux sont là.
 */
describe('Confirmer ma présence : scan du QR dans l’application', () => {
  type User = ReturnType<typeof userEvent.setup>;
  const CLASS_ID = '0a1b2c3d-1111-4222-8333-444455556666';
  const OTHER_CLASS_ID = '9f8e7d6c-5555-4666-8777-888899990000';
  const TOKEN = `c1.${CLASS_ID}.1.c2ln`;
  const link = (token: string) => `http://localhost:5173/gardes/presence?c=${token}`;

  function setup(proofMode: CoverageDetail['proofMode'], action: () => Response | Promise<Response> = () => json(200, detail({ status: 'ON_DUTY' }))) {
    const calls = mockFetch((call) => {
      if (call.url === '/api/files') return json(201, { id: 'photo-1', kind: 'PHOTO', mimeType: 'image/jpeg', sizeBytes: 100 });
      if (call.url === '/api/coverage/g1/actions') return action();
      return json(200, {});
    });
    renderWith(
      <CoverageActions
        detail={detail({
          status: 'EN_ROUTE',
          proofMode,
          class: { id: CLASS_ID, name: '1ère année Violet', room: 'Salle 12' },
          allowedActions: ['CONFIRM_PRESENCE'],
        })}
      />,
    );
    return calls;
  }

  async function openPresence(user: User): Promise<HTMLElement> {
    await user.click(screen.getByRole('button', { name: 'Confirmer ma présence' }));
    return screen.findByRole('dialog', { name: 'Confirmer ma présence en classe 1ère année Violet' });
  }

  /** jsdom n'a pas de caméra : le lien collé dans le lecteur suit le même chemin qu'une lecture par la caméra. */
  async function scan(user: User, presence: HTMLElement, token: string): Promise<void> {
    await user.click(within(presence).getByRole('button', { name: 'Scanner le QR code de la classe' }));
    const scanner = await screen.findByRole('dialog', { name: 'Scanner le QR code de la classe' });
    await user.type(within(scanner).getByRole('textbox', { name: 'Lien ou code du QR code' }), link(token));
    await user.click(within(scanner).getByRole('button', { name: 'Continuer' }));
    await waitFor(() => expect(scanner).not.toBeInTheDocument());
  }

  async function takePhoto(user: User, presence: HTMLElement): Promise<void> {
    await user.upload(within(presence).getByLabelText('Prendre la photo'), new File(['jpeg'], 'classe.jpg', { type: 'image/jpeg' }));
    await within(presence).findByRole('img', { name: 'Photo de présence en classe' });
  }

  const actions = (calls: Call[]) => posts(calls, '/api/coverage/g1/actions');

  it('preuve « QR » : le lecteur s’ouvre dans l’application et la présence part dès la lecture, sans autre appui', async () => {
    const user = userEvent.setup();
    const calls = setup('QR');
    const presence = await openPresence(user);
    expect(within(presence).queryByText(/Ouvrez l’appareil photo de votre téléphone/)).not.toBeInTheDocument();
    expect(within(presence).getByText('Scannez le QR code affiché dans la classe (Salle 12) : la présence est confirmée dès qu’il est lu.')).toBeInTheDocument();
    expect(within(presence).queryByRole('button', { name: 'Confirmer ma présence' })).not.toBeInTheDocument();

    await scan(user, presence, TOKEN);
    await waitFor(() => expect(actions(calls)).toHaveLength(1));
    expect(actions(calls)[0].body).toEqual({ action: 'CONFIRM_PRESENCE', version: 1, qrToken: TOKEN });
    await waitFor(() => expect(presence).not.toBeInTheDocument());
    expect(await screen.findByText('Présence confirmée.')).toBeInTheDocument();
  });

  it('pendant l’envoi : « Confirmation de la présence… », le scan n’est plus proposé', async () => {
    const user = userEvent.setup();
    let release: (response: Response) => void = () => undefined;
    setup('QR', () => new Promise<Response>((resolve) => (release = resolve)));
    const presence = await openPresence(user);
    await scan(user, presence, TOKEN);
    expect(await within(presence).findByRole('status')).toHaveTextContent('Confirmation de la présence…');
    expect(within(presence).getByRole('button', { name: 'Scanner le QR code de la classe' })).toBeDisabled();
    release(json(200, detail({ status: 'ON_DUTY' })));
    await waitFor(() => expect(presence).not.toBeInTheDocument());
  });

  it('preuve « QR + photo », scan d’abord : rien ne part avant la photo, puis la présence part avec les deux', async () => {
    const user = userEvent.setup();
    const calls = setup('BOTH');
    const presence = await openPresence(user);
    expect(
      within(presence).getByText(
        'Prenez la photo et scannez le QR code affiché dans la classe (Salle 12), dans l’ordre que vous voulez : la présence est confirmée dès que les deux sont faits.',
      ),
    ).toBeInTheDocument();

    await scan(user, presence, TOKEN);
    expect(within(presence).getByText('QR code de la classe lu : prenez maintenant la photo.')).toBeInTheDocument();
    expect(actions(calls)).toHaveLength(0);

    // La présence part dès la photo prise : le dialogue se ferme sans attendre l'aperçu.
    await user.upload(within(presence).getByLabelText('Prendre la photo'), new File(['jpeg'], 'classe.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(actions(calls)).toHaveLength(1));
    expect(actions(calls)[0].body).toEqual({ action: 'CONFIRM_PRESENCE', version: 1, qrToken: TOKEN, photoFileId: 'photo-1' });
  });

  it('preuve « QR + photo », photo d’abord : rien ne part avant le scan, puis la présence part avec les deux', async () => {
    const user = userEvent.setup();
    const calls = setup('BOTH');
    const presence = await openPresence(user);
    await takePhoto(user, presence);
    expect(actions(calls)).toHaveLength(0);

    await scan(user, presence, TOKEN);
    await waitFor(() => expect(actions(calls)).toHaveLength(1));
    expect(actions(calls)[0].body).toEqual({ action: 'CONFIRM_PRESENCE', version: 1, qrToken: TOKEN, photoFileId: 'photo-1' });
  });

  it('QR d’une autre classe : message, rien n’est envoyé ; le QR de la classe passe ensuite', async () => {
    const user = userEvent.setup();
    const calls = setup('QR');
    const presence = await openPresence(user);
    await scan(user, presence, `c1.${OTHER_CLASS_ID}.1.c2ln`);
    expect(
      within(presence).getByText('Ce QR code correspond à une autre classe que celle de votre garde : scannez celui de la classe 1ère année Violet.'),
    ).toBeInTheDocument();
    expect(actions(calls)).toHaveLength(0);

    await scan(user, presence, TOKEN);
    await waitFor(() => expect(actions(calls)).toHaveLength(1));
  });

  it('refus du serveur : message dans le dialogue, la photo reste, un nouveau scan renvoie la présence', async () => {
    const user = userEvent.setup();
    const message = 'Ce QR code n’est pas valide ou a été révoqué. Demandez le QR code à jour.';
    const calls = setup('BOTH', () => json(422, { error: { code: 'QR_INVALID', message } }));
    const presence = await openPresence(user);
    await takePhoto(user, presence);
    await scan(user, presence, TOKEN);
    expect(await within(presence).findByText(message)).toBeInTheDocument();
    expect(actions(calls)).toHaveLength(1);
    expect(within(presence).getByRole('img', { name: 'Photo de présence en classe' })).toBeInTheDocument();

    await scan(user, presence, TOKEN);
    await waitFor(() => expect(actions(calls)).toHaveLength(2));
    expect(actions(calls)[1].body).toEqual({ action: 'CONFIRM_PRESENCE', version: 1, qrToken: TOKEN, photoFileId: 'photo-1' });
  });

  it('preuve « photo » : inchangée, la photo puis « Confirmer ma présence »', async () => {
    const user = userEvent.setup();
    const calls = setup('PHOTO');
    const presence = await openPresence(user);
    expect(within(presence).queryByRole('button', { name: 'Scanner le QR code de la classe' })).not.toBeInTheDocument();
    await takePhoto(user, presence);
    expect(actions(calls)).toHaveLength(0);
    await user.click(within(presence).getByRole('button', { name: 'Confirmer ma présence' }));
    await waitFor(() => expect(actions(calls)).toHaveLength(1));
    expect(actions(calls)[0].body).toEqual({ action: 'CONFIRM_PRESENCE', version: 1, photoFileId: 'photo-1' });
  });
});

describe('Section « Surveillance » (012)', () => {
  it.each([
    ['admin', { isTeacher: false, isSupervisor: false, inGroup: false, canManage: true }],
    ['enseignant', { isTeacher: true, isSupervisor: false, inGroup: true, canManage: false }],
    ['surveillant', { isTeacher: false, isSupervisor: true, inGroup: true, canManage: false }],
  ])('%s : titre et liste d’onglets « Surveillance », plus « Gardes de classe »', async (_label, flags) => {
    mockFetch((call) => {
      if (call.url === '/api/coverage/availability') return json(200, { availability: 'AVAILABLE', activeGuards: [], ...flags });
      if (call.url === '/api/coverage/mine') return json(200, { availability: { availability: 'AVAILABLE', activeGuards: [], ...flags }, items: [] });
      return json(200, []);
    });
    renderWith(<CoveragePage />, '/gardes');
    expect(await screen.findByRole('heading', { level: 1, name: 'Surveillance' })).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Surveillance' })).toBeInTheDocument();
    expect(screen.queryByText('Gardes de classe')).not.toBeInTheDocument();
  });

  // US5 : garde-fou, identique avant et après la réorganisation des onglets de l'administration.
  const group = (flags: Record<string, boolean>) => {
    mockFetch((call) => {
      if (call.url === '/api/coverage/availability') return json(200, { availability: 'AVAILABLE', activeGuards: [], inGroup: true, canManage: false, ...flags });
      if (call.url === '/api/coverage/mine') return json(200, { availability: { availability: 'AVAILABLE', activeGuards: [], inGroup: true, canManage: false, ...flags }, items: [] });
      return json(200, []);
    });
  };
  const tabNames = async () => (await screen.findAllByRole('tab')).map((tab) => tab.textContent);

  it('enseignant : « Mes signalements », « Mes présences » et le bouton de signalement, rien de l’administration', async () => {
    group({ isTeacher: true, isSupervisor: false });
    renderWith(<CoveragePage />, '/gardes');
    expect(await tabNames()).toEqual(['Mes signalements', 'Mes présences']);
    expect(screen.getByRole('link', { name: 'Signaler un retard ou une absence' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nouvelle affectation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Statistiques' })).not.toBeInTheDocument();
  });

  it('surveillant : « Mes affectations », « Historique » et « Déclarer une classe vide », rien de l’administration', async () => {
    group({ isTeacher: false, isSupervisor: true });
    renderWith(<CoveragePage />, '/gardes');
    expect(await tabNames()).toEqual(['Mes affectations', 'Historique']);
    expect(screen.getByRole('link', { name: 'Déclarer une classe vide' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nouvelle affectation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Statistiques' })).not.toBeInTheDocument();
  });

  it.each([
    [{ isTeacher: true, isSupervisor: false }, 'mes-presences', 'Mes présences'],
    [{ isTeacher: false, isSupervisor: true }, 'historique', 'Historique'],
  ])('l’adresse choisit l’onglet du groupe (%#)', async (flags, key, name) => {
    group(flags);
    renderWith(<CoveragePage />, `/gardes?onglet=${key}`);
    expect(await screen.findByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
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

  it('un admin membre du groupe Surveillants garde ses propres onglets, après ceux de l’admin', async () => {
    mockFetch((call) => {
      if (call.url === '/api/coverage/availability') {
        return json(200, { availability: 'AVAILABLE', activeGuards: [], isTeacher: false, isSupervisor: true, inGroup: true, canManage: true });
      }
      return json(200, []);
    });
    renderWith(<CoveragePage />, '/gardes');
    const tabs = (await screen.findAllByRole('tab')).map((tab) => tab.textContent);
    // 012 : trois onglets d'administration, puis ceux du groupe.
    expect(tabs).toEqual(['Absences et retards', 'Affectation des surveillants', 'Suivi des interventions', 'Mes affectations', 'Historique']);
    // L'onglet par défaut est le premier de l'administration.
    expect(screen.getByRole('tab', { name: 'Absences et retards' })).toHaveAttribute('aria-selected', 'true');
  });

  it('un admin qui n’est pas surveillant ne voit pas les onglets du surveillant', async () => {
    mockFetch((call) => {
      if (call.url === '/api/coverage/availability') {
        return json(200, { availability: 'AVAILABLE', activeGuards: [], isTeacher: false, isSupervisor: false, inGroup: false, canManage: true });
      }
      return json(200, []);
    });
    renderWith(<CoveragePage />, '/gardes');
    await screen.findByRole('tab', { name: 'Absences et retards' });
    expect(screen.queryByRole('tab', { name: 'Mes affectations' })).not.toBeInTheDocument();
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

  it('classe scannée sans garde : un seul geste déclare la classe vide, avec le jeton du QR', async () => {
    const user = userEvent.setup();
    let declared = false;
    const calls = setupQr((call) => {
      if (call.url === '/api/coverage/presence/resolve') {
        // Après la déclaration, l'affectation créée devient « ma garde » : la résolution du QR la renvoie.
        return json(200, {
          class: { id: 'k1', name: '1ère année Violet', room: 'Salle 12' },
          coverage: declared ? summary({ status: 'ON_DUTY', mainStatus: 'IN_PROGRESS' }) : null,
          otherClassGuard: false,
        });
      }
      if (call.url === '/api/coverage/availability') return json(200, { isSupervisor: true, capabilities: { declareEmptyClass: true, report: false, manage: false } });
      if (call.url === '/api/coverage/empty-class') {
        declared = true;
        return json(201, { outcome: 'CREATED', coverage: { id: 'g9' }, assignedTo: { id: 's1', displayName: 'Surveillant' }, doubleAssignment: false });
      }
      return undefined;
    });
    renderWith(
      <Routes>
        <Route path="/gardes/presence" element={<PresencePage />} />
      </Routes>,
      '/gardes/presence?c=jeton-signe',
    );
    const button = await screen.findByRole('button', { name: 'Déclarer cette classe vide' });
    expect(posts(calls, '/api/coverage/empty-class')).toHaveLength(0);
    await user.click(button);
    await waitFor(() => expect(posts(calls, '/api/coverage/empty-class')).toHaveLength(1));
    expect(posts(calls, '/api/coverage/empty-class')[0].body).toMatchObject({ classId: 'k1', teacherId: null, qrToken: 'jeton-signe' });
    expect(await screen.findByRole('status')).toHaveTextContent('déclarée vide');
    expect(screen.getByRole('link', { name: 'Voir l’affectation' })).toHaveAttribute('href', '/gardes/g9');
    // Le rafraîchissement qui suit ne remplace pas le résultat par « Confirmer ma présence ».
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/coverage/presence/resolve').length).toBeGreaterThan(1));
    expect(screen.getByRole('status')).toHaveTextContent('déclarée vide');
    expect(screen.queryByRole('button', { name: 'Confirmer ma présence' })).not.toBeInTheDocument();
  });

  it('013 : ouvrir le lien du QR (appareil photo du téléphone) ne déclare rien sans clic ; « Préciser l’enseignant » mène au formulaire', async () => {
    const calls = setupQr((call) => {
      if (call.url === '/api/coverage/presence/resolve') {
        return json(200, { class: { id: 'k1', name: '1ère année Violet', room: 'Salle 12' }, coverage: null, otherClassGuard: false });
      }
      if (call.url === '/api/coverage/availability') return json(200, { isSupervisor: true, capabilities: { declareEmptyClass: true, report: false, manage: false } });
      return undefined;
    });
    renderWith(
      <Routes>
        <Route path="/gardes/presence" element={<PresencePage />} />
      </Routes>,
      '/gardes/presence?c=jeton-signe',
    );
    expect(await screen.findByRole('button', { name: 'Déclarer cette classe vide' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Préciser l’enseignant' })).toHaveAttribute('href', '/gardes/classe-vide?classe=k1&c=jeton-signe');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(posts(calls, '/api/coverage/empty-class')).toHaveLength(0);
  });

  it('sans droit de déclaration : pas de bouton', async () => {
    setupQr((call) => {
      if (call.url === '/api/coverage/presence/resolve') {
        return json(200, { class: { id: 'k1', name: '1ère année Violet', room: null }, coverage: null, otherClassGuard: false });
      }
      if (call.url === '/api/coverage/availability') return json(200, { isSupervisor: false, capabilities: { declareEmptyClass: false, report: true, manage: false } });
      return undefined;
    });
    renderWith(<Routes><Route path="/gardes/presence" element={<PresencePage />} /></Routes>, '/gardes/presence?c=x');
    expect(await screen.findByText('Vous n’avez pas de garde en cours pour la classe 1ère année Violet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Déclarer cette classe vide' })).not.toBeInTheDocument();
  });
});
