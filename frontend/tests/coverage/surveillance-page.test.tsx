import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/Toast';
import { CoveragePage } from '../../src/features/coverage/CoveragePage';

/**
 * 012 (US3, US4, FR-005 à FR-008, contracts/ui.md) : « Affectation des surveillants » regroupe la nouvelle affectation, la file
 * en attente, les doublons possibles et l'équipe ; « Nouvelle affectation » quitte l'en-tête de la page.
 * « Suivi des interventions » filtre les affectations sur les listes des anciens onglets, sans changer les statuts.
 */

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const NOW = new Date().toISOString();

function item(id: string, className: string, alerts: string[] = [], extra: Record<string, unknown> = {}) {
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
    ...extra,
  };
}

/** Adresse courante affichée dans la page, pour vérifier les réécritures. */
function LocationProbe() {
  const current = useLocation();
  return <output data-testid="adresse">{`${current.pathname}${current.search}${current.hash}`}</output>;
}
const location = () => screen.getByTestId('adresse').textContent;

function setup(path: string, profile: Record<string, unknown> = {}, handler: (url: string) => Response | undefined = () => undefined) {
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
          canManage: true,
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
        <MemoryRouter initialEntries={[path]}>
          <CoveragePage />
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return urls;
}

afterEach(() => vi.unstubAllGlobals());

describe('« Affectation des surveillants » (012)', () => {
  it('nouvelle affectation, puis « À assigner », « Doublons possibles », « Équipe », dans cet ordre', async () => {
    const urls = setup('/gardes?onglet=affectation', {}, (url) =>
      url === '/api/coverage?mainStatus=PENDING' ? json(200, [item('1', 'CE1 Vert', ['TAKEOVER_EXPIRED']), item('2', 'CE2 Jaune')]) : undefined,
    );
    const panel = await screen.findByRole('tabpanel');
    expect(within(panel).getByRole('link', { name: 'Nouvelle affectation' })).toHaveAttribute('href', '/gardes/nouvelle');

    const headings = within(panel).getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['À assigner', 'Doublons possibles', 'Équipe']);
    expect(headings.map((h) => h.id)).toEqual(['a-assigner', 'doublons', 'equipe']);

    // File : même ordre que le serveur (délai expiré en tête), comme l'ancien onglet « En attente ».
    await within(panel).findByText('CE1 Vert');
    expect(within(panel).getByText('CE1 Vert').compareDocumentPosition(within(panel).getByText('CE2 Jaune'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(urls).toContain('/api/coverage?mainStatus=PENDING');

    // Doublons et équipe : contenu et messages actuels.
    expect(await within(panel).findByText('Aucun doublon à trancher')).toBeInTheDocument();
    expect(await within(panel).findByText('Aucun surveillant')).toBeInTheDocument();
  });

  it('en-tête : plus de « Nouvelle affectation », « Statistiques » reste', async () => {
    setup('/gardes?onglet=affectation');
    const panel = await screen.findByRole('tabpanel');
    const header = document.querySelector('header')!;
    expect(within(header).queryByRole('link', { name: 'Nouvelle affectation' })).not.toBeInTheDocument();
    expect(within(header).getByRole('link', { name: 'Statistiques' })).toHaveAttribute('href', '/gardes/statistiques');
    expect(within(panel).getByRole('link', { name: 'Nouvelle affectation' })).toBeInTheDocument();
  });

  it('admin aussi enseignant et surveillant : leurs boutons restent dans l’en-tête', async () => {
    setup('/gardes', { isTeacher: true, isSupervisor: true, inGroup: true });
    await screen.findByRole('tabpanel');
    const header = document.querySelector('header')!;
    expect(within(header).getByRole('link', { name: 'Déclarer une classe vide' })).toBeInTheDocument();
    expect(within(header).getByRole('link', { name: 'Signaler un retard ou une absence' })).toBeInTheDocument();
  });

  it.each([
    ['en-attente', ''],
    ['doublons', '#doublons'],
    ['equipe', '#equipe'],
  ])('ancienne adresse ?onglet=%s → « Affectation des surveillants », adresse réécrite', async (former, hash) => {
    setup(`/gardes?onglet=${former}`);
    expect(await screen.findByRole('tab', { name: 'Affectation des surveillants' })).toHaveAttribute('aria-selected', 'true');
    await vi.waitFor(() => expect(location()).toBe(`/gardes?onglet=affectation${hash}`));
  });
});

describe('« Suivi des interventions » (012)', () => {
  const ACTIVE = '/api/coverage?mainStatus=ASSIGNED&mainStatus=IN_PROGRESS';
  const PENDING = '/api/coverage?mainStatus=PENDING';
  const FINISHED = '/api/coverage?mainStatus=DONE&mainStatus=CANCELLED&mainStatus=UNFILLED';
  const lists = (url: string) => {
    if (url === ACTIVE) {
      return json(200, [
        item('a1', 'CE1 Vert', [], { status: 'EN_ROUTE', mainStatus: 'ASSIGNED', subState: 'EN_ROUTE' }),
        item('a2', 'CE2 Jaune', [], { status: 'RELIEF_PENDING', mainStatus: 'IN_PROGRESS', subState: 'RELIEF_PENDING' }),
      ]);
    }
    if (url === PENDING) return json(200, [item('p1', 'CP Bleu')]);
    if (url === FINISHED) return json(200, [item('f1', 'CM1 Rouge', [], { status: 'UNFILLED', mainStatus: 'UNFILLED', subState: null })]);
    return undefined;
  };
  const filters = () => screen.findByRole('group', { name: 'Filtrer les interventions' });

  it('trois filtres, « Prise en charge » par défaut : liste de l’ancien onglet « En cours », statuts précis', async () => {
    const urls = setup('/gardes?onglet=suivi', {}, lists);
    const group = await filters();
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['En attente', 'Prise en charge', 'Terminée']);
    expect(within(group).getByRole('button', { name: 'Prise en charge' })).toHaveAttribute('aria-pressed', 'true');
    const panel = screen.getByRole('tabpanel');
    expect(await within(panel).findByText('CE1 Vert')).toBeInTheDocument();
    expect(within(panel).getByText('En route')).toBeInTheDocument();
    expect(within(panel).getByText('Relève demandée')).toBeInTheDocument();
    expect(urls).toContain(ACTIVE);
    expect(urls).not.toContain(FINISHED);
  });

  it('chaque filtre interroge la liste de son ancien onglet et s’inscrit dans l’adresse', async () => {
    const user = userEvent.setup();
    const urls = setup('/gardes?onglet=suivi', {}, lists);
    const group = await filters();

    await user.click(within(group).getByRole('button', { name: 'En attente' }));
    expect(within(group).getByRole('button', { name: 'En attente' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('CP Bleu')).toBeInTheDocument();
    expect(urls).toContain(PENDING);
    expect(location()).toBe('/gardes?onglet=suivi&filtre=en-attente');

    await user.click(within(group).getByRole('button', { name: 'Terminée' }));
    expect(await screen.findByText('CM1 Rouge')).toBeInTheDocument();
    expect(screen.getByText('Non pourvue')).toBeInTheDocument();
    expect(urls).toContain(FINISHED);
    expect(location()).toBe('/gardes?onglet=suivi&filtre=terminee');
  });

  it('l’adresse garde le filtre au rechargement', async () => {
    setup('/gardes?onglet=suivi&filtre=terminee', {}, lists);
    expect(within(await filters()).getByRole('button', { name: 'Terminée' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('CM1 Rouge')).toBeInTheDocument();
  });

  it('filtre inconnu : « Prise en charge »', async () => {
    setup('/gardes?onglet=suivi&filtre=nimporte', {}, lists);
    expect(within(await filters()).getByRole('button', { name: 'Prise en charge' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('chaque filtre garde le message vide de son ancien onglet', async () => {
    const user = userEvent.setup();
    setup('/gardes?onglet=suivi');
    const group = await filters();
    expect(await screen.findByText('Les affectations assignées et en cours apparaîtront ici.')).toBeInTheDocument();
    await user.click(within(group).getByRole('button', { name: 'En attente' }));
    expect(await screen.findByText('Les retards et absences signalés par les enseignants apparaîtront ici.')).toBeInTheDocument();
    await user.click(within(group).getByRole('button', { name: 'Terminée' }));
    expect(await screen.findByText('Les affectations terminées, annulées ou non pourvues apparaîtront ici.')).toBeInTheDocument();
  });

  it.each([
    ['en-cours', 'Prise en charge', 'prise-en-charge'],
    ['terminees', 'Terminée', 'terminee'],
  ])('ancienne adresse ?onglet=%s → « Suivi des interventions », filtre « %s »', async (former, name, filtre) => {
    setup(`/gardes?onglet=${former}`, {}, lists);
    expect(await screen.findByRole('tab', { name: 'Suivi des interventions' })).toHaveAttribute('aria-selected', 'true');
    expect(within(await filters()).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
    await vi.waitFor(() => expect(location()).toBe(`/gardes?onglet=suivi&filtre=${filtre}`));
  });
});
