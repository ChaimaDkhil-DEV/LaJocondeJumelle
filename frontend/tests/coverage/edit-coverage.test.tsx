import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/Toast';
import { CoverageDetailPage } from '../../src/features/coverage/CoverageDetailPage';

/** Spec 006 — dialogue « Modifier l’affectation » (contracts/ui.md), créneau (US1). */

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
type Reply = { status: number; body?: unknown };

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// 20 octobre 2026, heure d'été : Paris = UTC+2. Créneau 09:00–10:00 à l'école.
const START = '2026-10-20T07:00:00.000Z';
const END = '2026-10-20T08:00:00.000Z';
const ALL_FIELDS = ['classId', 'date', 'startTime', 'endTime'];

function detail(extra: Record<string, unknown> = {}) {
  return {
    id: '1',
    reference: 'G-2026-000001',
    status: 'ACCEPTED',
    mainStatus: 'ASSIGNED',
    subState: null,
    source: 'ADMIN_DIRECT',
    type: 'ABSENCE',
    priority: 'URGENT',
    version: 2,
    category: { id: 'c1', name: 'Garde de classe' },
    class: { id: 'k1', name: '1ère année Violet', room: 'Salle 12' },
    floor: { id: 'f1', name: '1er étage' },
    teacher: null,
    absentTeacher: null,
    startAt: START,
    estimatedMinutes: 60,
    plannedEndAt: END,
    requester: { id: 'a1', displayName: 'Admin' },
    assignee: { id: 's1', displayName: 'Surveillant' },
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
      createdAt: START,
      acceptedAt: START,
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
    allowedActions: ['UPDATE', 'REASSIGN', 'EXTEND', 'CANCEL', 'SET_TEACHER'],
    modifiableFields: ALL_FIELDS,
    isManager: true,
    presences: [],
    history: [],
    ...extra,
  };
}

const CLASSES = [
  { id: 'k1', name: '1ère année Violet', room: 'Salle 12', floor: { id: 'f1', name: '1er étage' } },
  { id: 'k2', name: '2e année Bleu', room: 'Salle 14', floor: { id: 'f2', name: '2e étage' } },
];

/** `patch` : réponse à `PATCH /api/coverage/1` (succès par défaut, détail modifié). */
function setup(initial: Record<string, unknown>, patch?: (body: Record<string, unknown>) => Reply | Promise<Reply>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call: Call = {
        url,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      if (call.method === 'PATCH' && url === '/api/coverage/1') {
        const reply = patch ? await patch(call.body ?? {}) : { status: 200, body: detail({ version: 3 }) };
        return json(reply.status, reply.body);
      }
      if (url === '/api/coverage/1') return json(200, initial);
      if (url === '/api/coverage/form-options') return json(200, { classes: CLASSES, teachers: [] });
      if (url === '/api/coverage/teachers') return json(200, []);
      if (url === '/api/coverage/availability') {
        return json(200, {
          availability: 'AVAILABLE',
          activeGuards: [],
          isTeacher: false,
          isSupervisor: false,
          inGroup: false,
          canManage: true,
          schoolDates: { timezone: 'Europe/Paris', today: '2026-10-20', tomorrow: '2026-10-21' },
        });
      }
      return json(200, []);
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/gardes/1']}>
          <Routes>
            <Route path="/gardes/:id" element={<CoverageDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return calls;
}

const patches = (calls: Call[]) => calls.filter((c) => c.method === 'PATCH');

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Modifier' }));
  return screen.findByRole('dialog', { name: 'Modifier l’affectation' });
}

async function setTime(user: ReturnType<typeof userEvent.setup>, field: HTMLElement, value: string) {
  await user.clear(field);
  await user.type(field, value);
}

afterEach(() => vi.unstubAllGlobals());

describe('« Modifier l’affectation » (spec 006)', () => {
  it('bouton absent sans champ modifiable (vue non admin, ou enseignant auteur)', async () => {
    setup(detail({ view: 'TEACHER', isManager: false, allowedActions: ['UPDATE', 'WITHDRAW'], modifiableFields: [] }));
    await screen.findByRole('heading', { name: /Garde/ });
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
  });

  it('dialogue pré-rempli à l’heure de l’école', async () => {
    const user = userEvent.setup();
    setup(detail());
    const dialog = await openDialog(user);
    expect(within(dialog).getByLabelText(/^Date/)).toHaveValue('2026-10-20');
    expect(within(dialog).getByLabelText(/^Heure de début/)).toHaveValue('09:00');
    expect(within(dialog).getByLabelText(/^Heure de fin/)).toHaveValue('10:00');
  });

  it('pendant la présence : seule l’heure de fin est modifiable, avec explication', async () => {
    const user = userEvent.setup();
    setup(detail({ status: 'ON_DUTY', mainStatus: 'IN_PROGRESS', modifiableFields: ['endTime'] }));
    const dialog = await openDialog(user);
    expect(within(dialog).getByText('Le surveillant est en classe : seule l’heure de fin peut changer.')).toBeVisible();
    expect(within(dialog).getByLabelText(/^Date/)).toBeDisabled();
    expect(within(dialog).getByLabelText(/^Heure de début/)).toBeDisabled();
    expect(within(dialog).getByLabelText(/^Heure de fin/)).toBeEnabled();
  });

  it('« Enregistrer » n’envoie que les champs changés, avec la version ; confirmation', async () => {
    const user = userEvent.setup();
    const calls = setup(detail());
    const dialog = await openDialog(user);
    await setTime(user, within(dialog).getByLabelText(/^Heure de fin/), '10:30');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    expect(patches(calls)[0].body).toEqual({ version: 2, endTime: '10:30' });
    expect(await screen.findByText('Affectation modifiée.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('créneau invalide : message sous l’heure de fin', async () => {
    const user = userEvent.setup();
    setup(detail(), () => ({
      status: 400,
      body: { error: { code: 'INVALID_RANGE', message: 'Le créneau est invalide : la fin doit suivre le début et ne pas être déjà passée.' } },
    }));
    const dialog = await openDialog(user);
    await setTime(user, within(dialog).getByLabelText(/^Heure de fin/), '08:00');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    const end = within(dialog).getByLabelText(/^Heure de fin/);
    await waitFor(() => expect(end).toHaveAttribute('aria-invalid', 'true'));
    expect(within(dialog).getByText(/la fin doit suivre le début/)).toBeVisible();
  });

  it('erreur de champ du serveur : message sous le champ concerné', async () => {
    const user = userEvent.setup();
    setup(detail(), () => ({
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Certaines informations sont manquantes ou invalides.',
          details: { fields: [{ field: 'startTime', messages: ['L’heure de début doit être comprise entre 12 h avant et 7 jours après maintenant.'] }] },
        },
      },
    }));
    const dialog = await openDialog(user);
    await setTime(user, within(dialog).getByLabelText(/^Heure de début/), '09:30');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText(/entre 12 h avant et 7 jours après/)).toBeVisible();
    expect(within(dialog).getByLabelText(/^Heure de début/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('conflit : message du serveur dans une alerte du dialogue, dialogue ouvert', async () => {
    const user = userEvent.setup();
    const message = 'Surveillant déjà affecté : 2e année Bleu, 20/10 09:00–10:00. Réassignez d’abord, puis modifiez.';
    setup(detail(), () => ({ status: 409, body: { error: { code: 'NOT_AVAILABLE', message } } }));
    const dialog = await openDialog(user);
    await setTime(user, within(dialog).getByLabelText(/^Heure de début/), '09:30');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('dialog', { name: 'Modifier l’affectation' })).toBeInTheDocument();
  });

  // Le cas « dialogue démonté avant la réponse » relève des retours au niveau de la mutation
  // (useUpdateCoverage, comme useCoverageAction : non-régression de la PR #23).
  it('confirmation affichée après une réponse tardive', async () => {
    const user = userEvent.setup();
    setup(detail(), async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { status: 200, body: detail({ version: 3 }) };
    });
    const dialog = await openDialog(user);
    await setTime(user, within(dialog).getByLabelText(/^Heure de fin/), '10:30');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Affectation modifiée.')).toBeInTheDocument();
  });
});

describe('historique : « Affectation modifiée » (spec 006, T011)', () => {
  const event = (fromValue: Record<string, unknown> | null, toValue: Record<string, unknown> | null) => ({
    id: 'e1',
    type: 'UPDATED',
    actor: { id: 'a1', displayName: 'Admin' },
    fromValue,
    toValue,
    comment: null,
    createdAt: START,
  });
  const violet = { classId: 'k1', className: '1ère année Violet' };

  async function historyText(entry: ReturnType<typeof event>) {
    setup(detail({ history: [entry] }));
    const timeline = await screen.findByRole('list', { name: 'Historique de l’affectation' });
    return timeline.textContent ?? '';
  }

  it('créneau seul : anciennes et nouvelles heures', async () => {
    const text = await historyText(
      event(
        { ...violet, startAt: START, plannedEndAt: END },
        { ...violet, startAt: '2026-10-20T07:30:00.000Z', plannedEndAt: '2026-10-20T08:30:00.000Z', byAdmin: true },
      ),
    );
    expect(text).toContain('Affectation modifiée : 09:00–10:00 → 09:30–10:30');
  });

  it('changement de jour : dates affichées', async () => {
    const text = await historyText(
      event(
        { ...violet, startAt: START, plannedEndAt: END },
        { ...violet, startAt: '2026-10-21T07:00:00.000Z', plannedEndAt: '2026-10-21T08:00:00.000Z', byAdmin: true },
      ),
    );
    expect(text).toContain('Affectation modifiée : 20/10 09:00–10:00 → 21/10 09:00–10:00');
  });

  it('sans valeurs (événement antérieur) : libellé « Affectation modifiée »', async () => {
    const text = await historyText(event(null, null));
    expect(text).toContain('Affectation modifiée');
    expect(text).not.toContain('Demande modifiée');
  });
});

describe('classe (spec 006, US2, T019)', () => {
  it('liste des classes actives ; le changement est envoyé en classId', async () => {
    const user = userEvent.setup();
    const calls = setup(detail());
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('combobox', { name: /^Classe/ }));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option').map((o) => o.textContent)).toEqual([
      '1ère année Violet · Salle 12 · 1er étage',
      '2e année Bleu · Salle 14 · 2e étage',
    ]);
    await user.click(within(listbox).getByRole('option', { name: /2e année Bleu/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    expect(patches(calls)[0].body).toEqual({ version: 2, classId: 'k2' });
  });

  it('pendant la présence : classe désactivée', async () => {
    const user = userEvent.setup();
    setup(detail({ status: 'ON_DUTY', mainStatus: 'IN_PROGRESS', modifiableFields: ['endTime'] }));
    const dialog = await openDialog(user);
    expect(within(dialog).getByRole('combobox', { name: /^Classe/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('historique : changement de classe', async () => {
    setup(
      detail({
        history: [
          {
            id: 'e1',
            type: 'UPDATED',
            actor: { id: 'a1', displayName: 'Admin' },
            fromValue: { classId: 'k2', className: '2e année Bleu', startAt: START, plannedEndAt: END },
            toValue: { classId: 'k1', className: '1ère année Violet', startAt: START, plannedEndAt: END, byAdmin: true },
            comment: null,
            createdAt: START,
          },
        ],
      }),
    );
    const timeline = await screen.findByRole('list', { name: 'Historique de l’affectation' });
    expect(timeline).toHaveTextContent('Affectation modifiée : classe 2e année Bleu → 1ère année Violet');
  });
});
