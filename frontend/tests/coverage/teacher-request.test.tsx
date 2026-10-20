import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/Toast';
import { TeacherRequestPage } from '../../src/features/coverage/TeacherRequestPage';

/**
 * T051 — Formulaire de l'enseignant (US1, FR-012, FR-008g) : type, classe parmi toutes les classes,
 * aujourd'hui ou demain, début, fin ou durée, motif facultatif ; erreurs par champ ; modification et
 * retrait tant que la demande est en attente ; libellés accessibles.
 */

type Call = { url: string; method: string; body: unknown };

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const PROFILE = {
  availability: 'AVAILABLE',
  activeGuards: [],
  isTeacher: true,
  isSupervisor: false,
  inGroup: false,
  canManage: false,
  schoolDates: { timezone: 'Europe/Paris', today: '2026-10-20', tomorrow: '2026-10-21' },
};

const CLASSES = [
  { id: 'k1', name: '1ère année Violet', room: 'Salle 12', floor: { id: 'f1', name: '1er étage' } },
  { id: 'k2', name: '2e année Bleu', room: null, floor: { id: 'f2', name: '2e étage' } },
];

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    reference: 'G-2026-000001',
    status: 'PENDING',
    mainStatus: 'PENDING',
    subState: null,
    source: 'TEACHER_REQUEST',
    type: 'LATENESS',
    priority: 'URGENT',
    version: 3,
    category: { id: 'c1', name: 'Garde de classe' },
    class: { id: 'k1', name: '1ère année Violet', room: 'Salle 12' },
    floor: { id: 'f1', name: '1er étage' },
    teacher: { id: 't1', displayName: 'Enseignante' },
    absentTeacher: null,
    // 08:00 – 09:00 à Paris le 21 octobre 2026 (UTC+2).
    startAt: '2026-10-21T06:00:00.000Z',
    plannedEndAt: '2026-10-21T07:00:00.000Z',
    estimatedMinutes: 60,
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
    timestamps: { createdAt: '2026-10-20T16:00:00.000Z', acceptedAt: null, departedAt: null, presenceAt: null, relievedAt: null, closedAt: null, cancelledAt: null },
    view: 'TEACHER',
    reason: 'Rendez-vous',
    note: null,
    voice: null,
    proofMode: 'BOTH',
    finalValidation: false,
    cancelReason: null,
    allowedActions: ['UPDATE', 'WITHDRAW'],
    isManager: false,
    presences: [],
    history: null,
    ...overrides,
  };
}

function setup(path: string, handler: (call: Call) => Response | undefined = () => undefined): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call = { url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined };
      calls.push(call);
      const custom = handler(call);
      if (custom) return custom;
      if (url === '/api/coverage/availability') return json(200, PROFILE);
      if (url === '/api/coverage/classes') return json(200, CLASSES);
      if (url === '/api/coverage/g1') return json(200, detail());
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/gardes/signaler" element={<TeacherRequestPage />} />
            <Route path="/gardes/signalements/:id" element={<TeacherRequestPage />} />
            <Route path="/gardes" element={<p>Liste des gardes</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return calls;
}

const posts = (calls: Call[]) => calls.filter((c) => c.method === 'POST' || c.method === 'PATCH');

afterEach(() => vi.unstubAllGlobals());

describe('Signaler un retard ou une absence', () => {
  it('champs requis signalés un à un, sans envoi', async () => {
    const user = userEvent.setup();
    const calls = setup('/gardes/signaler');
    expect(await screen.findByRole('heading', { name: 'Signaler un retard ou une absence' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Envoyer le signalement' }));
    expect(await screen.findByText('Choisissez la classe.')).toBeInTheDocument();
    expect(screen.getByText('Indiquez l’heure de début.')).toBeInTheDocument();
    expect(screen.getByText('Indiquez l’heure de fin ou une durée.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Heure de début/)).toHaveAttribute('aria-invalid', 'true');
    expect(posts(calls)).toHaveLength(0);
  });

  it('envoi : type, classe, demain, début et fin ; motif facultatif ; retour à la liste', async () => {
    const user = userEvent.setup();
    const calls = setup('/gardes/signaler', (call) =>
      call.url === '/api/coverage/teacher-requests' && call.method === 'POST' ? json(201, detail()) : undefined,
    );
    await user.click(await screen.findByRole('radio', { name: 'Absence' }));
    await user.click(screen.getByRole('combobox', { name: /Classe/ }));
    await user.click(await screen.findByRole('option', { name: /2e année Bleu/ }));
    await user.click(screen.getByRole('radio', { name: /Demain/ }));
    await user.type(screen.getByLabelText(/Heure de début/), '08:00');
    await user.type(screen.getByLabelText(/Heure de fin/), '09:00');
    await user.click(screen.getByRole('button', { name: 'Envoyer le signalement' }));
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(posts(calls)[0]).toMatchObject({
      url: '/api/coverage/teacher-requests',
      body: { type: 'ABSENCE', classId: 'k2', date: '2026-10-21', startTime: '08:00', endTime: '09:00' },
    });
    expect(posts(calls)[0].body).not.toHaveProperty('reason');
    expect(posts(calls)[0].body).toHaveProperty('clientId');
    expect(await screen.findByText('Liste des gardes')).toBeInTheDocument();
  });

  it('durée au lieu de l’heure de fin', async () => {
    const user = userEvent.setup();
    const calls = setup('/gardes/signaler', (call) =>
      call.url === '/api/coverage/teacher-requests' ? json(201, detail()) : undefined,
    );
    await user.click(await screen.findByRole('combobox', { name: /Classe/ }));
    await user.click(await screen.findByRole('option', { name: /1ère année Violet/ }));
    await user.type(screen.getByLabelText(/Heure de début/), '10:00');
    await user.click(screen.getByRole('radio', { name: 'Durée' }));
    await user.type(screen.getByLabelText(/Durée en minutes/), '45');
    await user.type(screen.getByLabelText(/Motif/), 'Rendez-vous médical');
    await user.click(screen.getByRole('button', { name: 'Envoyer le signalement' }));
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(posts(calls)[0].body).toMatchObject({ date: '2026-10-20', startTime: '10:00', durationMinutes: 45, reason: 'Rendez-vous médical' });
    expect(posts(calls)[0].body).not.toHaveProperty('endTime');
  });

  it('refus du serveur affiché clairement', async () => {
    const user = userEvent.setup();
    setup('/gardes/signaler', (call) =>
      call.url === '/api/coverage/teacher-requests'
        ? json(400, { error: { code: 'INVALID_RANGE', message: 'Le créneau est invalide : la fin doit suivre le début et ne pas être déjà passée.' } })
        : undefined,
    );
    await user.click(await screen.findByRole('combobox', { name: /Classe/ }));
    await user.click(await screen.findByRole('option', { name: /1ère année Violet/ }));
    await user.type(screen.getByLabelText(/Heure de début/), '07:00');
    await user.type(screen.getByLabelText(/Heure de fin/), '07:30');
    await user.click(screen.getByRole('button', { name: 'Envoyer le signalement' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Le créneau est invalide');
  });
});

describe('Modifier ou retirer un signalement', () => {
  it('en attente : champs préremplis (heure de l’école), envoi des modifications avec la version', async () => {
    const user = userEvent.setup();
    const calls = setup('/gardes/signalements/g1', (call) =>
      call.url === '/api/coverage/g1/teacher-request' && call.method === 'PATCH' ? json(200, detail({ version: 4 })) : undefined,
    );
    expect(await screen.findByRole('heading', { name: 'Modifier le signalement' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Heure de début/)).toHaveValue('08:00');
    expect(screen.getByLabelText(/Heure de fin/)).toHaveValue('09:00');
    expect(screen.getByRole('radio', { name: /Demain/ })).toBeChecked();
    expect(screen.getByLabelText(/Motif/)).toHaveValue('Rendez-vous');
    await user.clear(screen.getByLabelText(/Heure de fin/));
    await user.type(screen.getByLabelText(/Heure de fin/), '10:00');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(posts(calls)[0]).toMatchObject({
      url: '/api/coverage/g1/teacher-request',
      method: 'PATCH',
      body: { version: 3, type: 'LATENESS', classId: 'k1', date: '2026-10-21', startTime: '08:00', endTime: '10:00', reason: 'Rendez-vous' },
    });
  });

  it('retrait : motif facultatif, action WITHDRAW', async () => {
    const user = userEvent.setup();
    const calls = setup('/gardes/signalements/g1', (call) =>
      call.url === '/api/coverage/g1/actions' ? json(200, detail({ status: 'CANCELLED', mainStatus: 'CANCELLED', allowedActions: [] })) : undefined,
    );
    await user.click(await screen.findByRole('button', { name: 'Retirer la demande' }));
    const dialog = await screen.findByRole('dialog', { name: 'Retirer la demande' });
    await user.click(within(dialog).getByRole('button', { name: 'Retirer la demande' }));
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(posts(calls)[0]).toMatchObject({ url: '/api/coverage/g1/actions', body: { action: 'WITHDRAW', version: 3 } });
  });

  it('déjà assignée : lecture seule, nom du surveillant, plus de modification ni de retrait', async () => {
    setup('/gardes/signalements/g1', (call) =>
      call.url === '/api/coverage/g1'
        ? json(200, detail({ status: 'ACCEPTED', mainStatus: 'ASSIGNED', assignee: { id: 's1', displayName: 'Surveillant' }, allowedActions: [] }))
        : undefined,
    );
    expect(await screen.findByText(/Surveillant assigné : Surveillant/)).toBeInTheDocument();
    expect(screen.getByText('Assignée')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer les modifications' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retirer la demande' })).not.toBeInTheDocument();
  });
});
