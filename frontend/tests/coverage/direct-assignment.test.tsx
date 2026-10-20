import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/Toast';
import { CreateCoveragePage } from '../../src/features/coverage/CreateCoveragePage';

/**
 * T071 — Affectation directe par l'admin (US3, FR-019) : classe, type, enseignant facultatif,
 * date, début, fin (heures de l'école), surveillant choisi parmi les disponibles ; erreurs par
 * champ ; libellés accessibles.
 */

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const OPTIONS = {
  classes: [
    {
      id: 'k1',
      name: '1ère année Violet',
      room: 'Salle 12',
      floor: { id: 'f1', name: '1er étage' },
    },
    { id: 'k2', name: '2e année Bleu', room: null, floor: { id: 'f2', name: '2e étage' } },
  ],
  teachers: [{ id: 't1', displayName: 'Enseignante' }],
};

const CANDIDATES = [
  {
    id: 's2',
    displayName: 'Remplaçante',
    jobTitle: null,
    floor: { id: 'f1', name: '1er étage' },
    sameFloor: true,
    available: true,
    reason: null,
  },
  {
    id: 's3',
    displayName: 'Surveillant 2e étage',
    jobTitle: null,
    floor: { id: 'f2', name: '2e étage' },
    sameFloor: false,
    available: true,
    reason: null,
  },
  {
    id: 's1',
    displayName: 'Surveillant',
    jobTitle: null,
    floor: { id: 'f1', name: '1er étage' },
    sameFloor: true,
    available: false,
    reason: 'ON_GUARD',
  },
];

function setup(create: Response = json(201, { id: 'g9' })): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call = {
        url,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      if (url === '/api/coverage/form-options') return json(200, OPTIONS);
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
      if (url.startsWith('/api/coverage/candidates?')) return json(200, CANDIDATES);
      if (url === '/api/coverage' && call.method === 'POST') return create.clone();
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <MemoryRouter initialEntries={['/gardes/nouvelle']}>
          <Routes>
            <Route path="/gardes/nouvelle" element={<CreateCoveragePage />} />
            <Route path="/gardes/:id" element={<p>Détail de l’affectation</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return calls;
}

const creations = (calls: Call[]) => calls.filter((c) => c.method === 'POST');
const user = () => userEvent.setup();

async function fillSlot(u: ReturnType<typeof userEvent.setup>, classPattern = /1ère année Violet/) {
  await u.click(await screen.findByRole('combobox', { name: /Classe/ }));
  await u.click(await screen.findByRole('option', { name: classPattern }));
  const date = screen.getByLabelText(/Date/);
  await u.clear(date);
  await u.type(date, '2026-10-21');
  await u.type(screen.getByLabelText(/Heure de début/), '08:00');
  await u.type(screen.getByLabelText(/Heure de fin/), '09:30');
}

afterEach(() => vi.unstubAllGlobals());

describe('Nouvelle affectation directe', () => {
  it('champs requis signalés un à un, sans envoi', async () => {
    const u = user();
    const calls = setup();
    expect(
      await screen.findByRole('heading', { name: 'Nouvelle affectation' }),
    ).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Créer l’affectation' }));
    expect(await screen.findByText('Choisissez la classe.')).toBeInTheDocument();
    expect(screen.getByText('Indiquez l’heure de début.')).toBeInTheDocument();
    expect(screen.getByText('Indiquez l’heure de fin.')).toBeInTheDocument();
    expect(screen.getByText('Choisissez un surveillant disponible.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Heure de début/)).toHaveAttribute('aria-invalid', 'true');
    expect(creations(calls)).toHaveLength(0);
  });

  it('surveillants du créneau : demandés avec les heures de l’école ; indisponibles non sélectionnables', async () => {
    const u = user();
    const calls = setup();
    expect(await screen.findByText(/Choisissez la classe et le créneau/)).toBeInTheDocument();
    await fillSlot(u);
    expect(
      await screen.findByRole('radio', { name: /Remplaçante · 1er étage · Disponible/ }),
    ).toBeEnabled();
    expect(
      screen.getByRole('radio', { name: /^Surveillant · 1er étage · Déjà affecté sur ce créneau/ }),
    ).toBeDisabled();
    const query = calls.find((c) => c.url.startsWith('/api/coverage/candidates?'))!.url;
    const params = new URL(query, 'http://test').searchParams;
    expect(params.get('classId')).toBe('k1');
    // 08:00 et 09:30 à Paris le 21 octobre 2026 (UTC+2).
    expect(params.get('startAt')).toBe('2026-10-21T06:00:00.000Z');
    expect(params.get('endAt')).toBe('2026-10-21T07:30:00.000Z');
  });

  it('création : type, enseignant facultatif, surveillant, motif ; ouverture du détail', async () => {
    const u = user();
    const calls = setup();
    await fillSlot(u);
    await u.click(screen.getByRole('radio', { name: 'Retard' }));
    await u.click(screen.getByRole('combobox', { name: /Enseignant \(facultatif\)/ }));
    await u.click(await screen.findByRole('option', { name: 'Enseignante' }));
    await u.click(await screen.findByRole('radio', { name: /Remplaçante/ }));
    await u.type(screen.getByLabelText(/Motif/), 'Appel de l’enseignante');
    await u.click(screen.getByRole('button', { name: 'Créer l’affectation' }));
    await waitFor(() => expect(creations(calls)).toHaveLength(1));
    expect(creations(calls)[0].body).toMatchObject({
      classId: 'k1',
      type: 'LATENESS',
      teacherId: 't1',
      assigneeId: 's2',
      startAt: '2026-10-21T06:00:00.000Z',
      endAt: '2026-10-21T07:30:00.000Z',
      reason: 'Appel de l’enseignante',
    });
    expect(creations(calls)[0].body).toHaveProperty('clientId');
    expect(creations(calls)[0].body).not.toHaveProperty('note');
    expect(await screen.findByText('Détail de l’affectation')).toBeInTheDocument();
  });

  it('enseignant non précisé par défaut ; fin avant le début refusée', async () => {
    const u = user();
    const calls = setup();
    expect(
      await screen.findByRole('combobox', { name: /Enseignant \(facultatif\)/ }),
    ).toHaveTextContent('Non précisé');
    await u.click(await screen.findByRole('combobox', { name: /Classe/ }));
    await u.click(await screen.findByRole('option', { name: /1ère année Violet/ }));
    await u.type(screen.getByLabelText(/Heure de début/), '10:00');
    await u.type(screen.getByLabelText(/Heure de fin/), '09:00');
    await u.click(screen.getByRole('button', { name: 'Créer l’affectation' }));
    expect(
      await screen.findByText('L’heure de fin doit suivre l’heure de début.'),
    ).toBeInTheDocument();
    expect(creations(calls)).toHaveLength(0);
  });

  it('surveillant devenu indisponible entre-temps : message du serveur', async () => {
    const u = user();
    setup(
      json(409, {
        error: {
          code: 'NOT_AVAILABLE',
          message: 'Ce surveillant n’est plus disponible sur ce créneau.',
        },
      }),
    );
    await fillSlot(u);
    await u.click(await screen.findByRole('radio', { name: /Remplaçante/ }));
    await u.click(screen.getByRole('button', { name: 'Créer l’affectation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ce surveillant n’est plus disponible',
    );
  });
});
