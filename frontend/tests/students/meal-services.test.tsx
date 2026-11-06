import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/Toast';
import { MealServicesPage } from '../../src/features/students/MealServicesPage';

/** Restauration : la surveillante générale change le service d'un élève et consulte son historique. */

type Call = { url: string; method: string; body: unknown };

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const student = (id: string, firstName: string, lastName: string, classId: string, mealService: 'CANTINE' | 'PANIER') => ({
  id,
  firstName,
  lastName,
  mealService,
  class: { id: classId, name: `Classe ${classId}`, level: { id: 'l1', name: 'Niveau 1', position: 1 } },
});

const STUDENTS = [student('s1', 'Aya', 'Ben Ali', 'c1', 'CANTINE'), student('s2', 'Adam', 'Zribi', 'c2', 'PANIER')];

const HISTORY = [
  {
    id: 'h1',
    fromService: 'PANIER',
    toService: 'CANTINE',
    reason: 'Demande des parents',
    createdAt: '2026-11-02T08:30:00.000Z',
    actor: { id: 'u1', displayName: 'Surveillante générale' },
  },
];

function setup(handler: (url: string, method: string, body: unknown) => Response | undefined = () => undefined) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body });
      const custom = handler(url, method, body);
      if (custom) return custom;
      if (url === '/api/meal-services/students') return json(200, STUDENTS);
      if (url === '/api/meal-services/students/s1/history') return json(200, HISTORY);
      if (url === '/api/meal-services/students/s2/history') return json(200, []);
      if (method === 'PATCH') return json(200, { ...STUDENTS[0], mealService: 'PANIER' });
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter>
          <MealServicesPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { calls };
}

afterEach(() => vi.unstubAllGlobals());

describe('Restauration', () => {
  it('liste les élèves, propose l’autre service et n’affiche aucun téléphone', async () => {
    setup();
    const list = await screen.findByRole('list', { name: 'Élèves' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('2 élèves · 1 à la cantine · 1 au panier')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Passer au panier : Aya Ben Ali' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Passer à la cantine : Adam Zribi' })).toBeInTheDocument();
  });

  it('filtre par service', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('list', { name: 'Élèves' });
    await user.click(screen.getByRole('combobox', { name: 'Service' }));
    await user.click(screen.getByRole('option', { name: 'Panier' }));
    expect(within(screen.getByRole('list', { name: 'Élèves' })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('ZRIBI Adam')).toBeInTheDocument();
  });

  it('change le service avec un motif, puis recharge la liste', async () => {
    const user = userEvent.setup();
    const { calls } = setup();
    await user.click(await screen.findByRole('button', { name: 'Passer au panier : Aya Ben Ali' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: 'Motif (facultatif)' }), '  Allergie ');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((c) => c.method === 'PATCH')).toEqual({
      url: '/api/meal-services/students/s1',
      method: 'PATCH',
      body: { mealService: 'PANIER', reason: 'Allergie' },
    });
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/meal-services/students' && c.method === 'GET')).toHaveLength(2));
    expect(await screen.findByText('Aya Ben Ali : service changé.')).toBeInTheDocument();
  });

  it('sans motif, aucun motif n’est envoyé', async () => {
    const user = userEvent.setup();
    const { calls } = setup();
    await user.click(await screen.findByRole('button', { name: 'Passer au panier : Aya Ben Ali' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ mealService: 'PANIER' }));
  });

  it('annuler n’envoie rien', async () => {
    const user = userEvent.setup();
    const { calls } = setup();
    await user.click(await screen.findByRole('button', { name: 'Passer au panier : Aya Ben Ali' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Annuler' }));
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('affiche le refus du serveur dans la fenêtre', async () => {
    const user = userEvent.setup();
    setup((_url, method) =>
      method === 'PATCH' ? json(400, { error: { code: 'VALIDATION_ERROR', message: 'L’élève est déjà inscrit à ce service.' } }) : undefined,
    );
    await user.click(await screen.findByRole('button', { name: 'Passer au panier : Aya Ben Ali' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirmer' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('L’élève est déjà inscrit à ce service.');
  });

  it('montre l’historique : changement, auteur et motif', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Historique de Aya Ben Ali' }));
    const changes = await screen.findByRole('list', { name: 'Changements de service' });
    expect(within(changes).getByText('Panier → Cantine')).toBeInTheDocument();
    expect(within(changes).getByText(/par Surveillante générale/)).toBeInTheDocument();
    expect(within(changes).getByText('Demande des parents')).toBeInTheDocument();
  });

  it('indique quand un élève n’a aucun changement', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Historique de Adam Zribi' }));
    expect(await screen.findByText('Aucun changement')).toBeInTheDocument();
  });

  it('dit que l’accès est refusé, sans proposer de réessayer', async () => {
    setup((url) => (url === '/api/meal-services/students' ? json(403, { error: { code: 'FORBIDDEN', message: 'Accès refusé.' } }) : undefined));
    expect(await screen.findByRole('alert')).toHaveTextContent('Vous n’avez pas accès à la liste des élèves.');
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
  });

  it('propose de réessayer après une erreur passagère du serveur', async () => {
    setup((url) => (url === '/api/meal-services/students' ? json(500, { error: { code: 'INTERNAL_ERROR', message: 'Erreur.' } }) : undefined));
    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
