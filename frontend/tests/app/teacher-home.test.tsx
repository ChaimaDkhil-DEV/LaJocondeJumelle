import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../src/app/routes';

/**
 * 016 — Accueil de l'enseignant : scanner le QR code (action principale), demande urgente ou normale
 * (formulaire vocal, priorité préremplie), « Suivi de mes demandes » (trois boutons avec compteur,
 * chacun ouvrant la liste filtrée par le serveur).
 */

vi.mock('socket.io-client', () => ({
  io: () => ({
    on() {
      return this;
    },
    disconnect() {
      return this;
    },
  }),
}));

// Boîte d'envoi (IndexedDB) : vide sauf dans le test qui la remplit.
const outbox = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async (key: string) => outbox.get(key),
  set: async (key: string, value: unknown) => void outbox.set(key, value),
  del: async (key: string) => void outbox.delete(key),
  values: async () => [...outbox.values()],
}));

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const TEACHER = {
  id: 'u1',
  username: 'enseignante',
  displayName: 'Enseignante',
  jobTitle: null,
  role: 'EMPLOYEE',
  permissions: [],
  mustChangePassword: false,
  isTeacher: true,
  isSupervisor: false,
};
const TOKEN = 'c1.0a1b2c3d-1111-4222-8333-444455556666.1.c2ln';

const summary = (id: string, title: string, status: string) => ({
  id,
  reference: `D-2026-${id}`,
  title,
  status,
  priority: 'NORMAL',
  category: { id: 'cat-a', name: 'Photocopies' },
  requester: { id: 'u1', displayName: 'Enseignante' },
  assignee: null,
  createdAt: '2026-11-09T08:00:00.000Z',
  currentStage: null,
  currentDueAt: null,
  warnAt: null,
  overdueStage: null,
  hasVoice: true,
  unreadCount: 0,
});

interface Setup {
  me?: unknown;
  tracking?: () => Response;
  lists?: Record<string, unknown[]>;
}

function renderAt(path: string, { me = TEACHER, tracking = () => json(200, { pending: 3, handled: 1, archived: 12 }), lists = {} }: Setup = {}) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('min-width'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })),
  );
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url === '/api/auth/me') return json(200, me);
      if (url.includes('/api/notifications')) return json(200, { items: [], nextCursor: null, unreadTotal: 0 });
      if (url === '/api/requests/tracking') return tracking();
      const group = /tracking=(\w+)/.exec(url)?.[1];
      if (url.startsWith('/api/requests?') && group) return json(200, { items: lists[group] ?? [], nextCursor: null });
      if (url.startsWith('/api/requests?')) return json(200, { items: [], nextCursor: null });
      if (url === '/api/categories') return json(200, []);
      return json(404, { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } });
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { urls, router, queryClient };
}

const mainNav = () => screen.getByRole('navigation', { name: 'Navigation principale' });
const tracking = () => screen.getByRole('region', { name: 'Suivi de mes demandes' });

describe('Accueil de l’enseignant', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    outbox.clear();
    delete (navigator as unknown as Record<string, unknown>).mediaDevices;
  });

  it('boîte d’envoi : une demande restée hors ligne est visible dès l’accueil, avec « Réessayer »', async () => {
    outbox.set('o1', {
      id: 'o1',
      type: 'request',
      savedAt: '2026-11-10T08:00:00.000Z',
      lastError: 'Envoi impossible.',
      categoryName: 'Photocopies',
      payload: { clientId: 'o1', title: 'Affiches A3 hors ligne', categoryId: 'cat-a', priority: 'NORMAL' },
    });
    renderAt('/');
    const region = await screen.findByRole('region', { name: 'Boîte d’envoi' });
    expect(within(region).getByText('Affiches A3 hors ligne')).toBeVisible();
    expect(within(region).getByRole('button', { name: 'Réessayer' })).toBeVisible();
  });

  it('remplace « Mes demandes » à l’accueil ; « Accueil » en tête de la navigation', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();
    const links = within(mainNav()).getAllByRole('link');
    expect(links[0]).toHaveTextContent('Accueil');
    expect(links[0]).toHaveAttribute('href', '/');
    expect(links[0]).toHaveAttribute('aria-current', 'page');
    // « Mes demandes » reste accessible, sans être la page courante.
    const mine = within(mainNav()).getByRole('link', { name: 'Mes demandes' });
    expect(mine).toHaveAttribute('href', '/demandes');
    expect(mine).not.toHaveAttribute('aria-current');
  });

  it('action principale : « Scanner un QR code » ouvre aussitôt le scanner de la classe', async () => {
    // Caméra refusée : le scanner existant propose alors la saisie du lien ou du code.
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(() => Promise.reject(new DOMException('refus', 'NotAllowedError'))) },
    });
    const { router } = renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Scanner un QR code' }));
    const dialog = screen.getByRole('dialog', { name: 'Scanner le QR code de la classe' });
    // Caméra demandée dès l'ouverture : aucun clic de plus.
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);

    // Mécanisme existant conservé : le code saisi mène à la page de confirmation de la classe.
    await userEvent.type(await within(dialog).findByLabelText('Lien ou code du QR code'), TOKEN);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continuer' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/gardes/presence'));
    expect(router.state.location.search).toBe(`?c=${encodeURIComponent(TOKEN)}`);
  });

  it('demande urgente et demande normale : le formulaire vocal, priorité préremplie', async () => {
    renderAt('/');
    const urgent = await screen.findByRole('link', { name: 'Demande urgente' });
    const normal = screen.getByRole('link', { name: 'Demande normale' });
    expect(urgent).toHaveAccessibleDescription('Message vocal');
    expect(urgent).toHaveAttribute('href', '/demandes/nouvelle?priorite=URGENT');
    expect(normal).toHaveAttribute('href', '/demandes/nouvelle?priorite=NORMAL');
  });

  it('suivi : trois boutons-liens avec titre, descriptif, compteur et chevron, vers leur liste', async () => {
    renderAt('/');
    const pending = await within(await screen.findByRole('region', { name: 'Suivi de mes demandes' })).findByRole('link', { name: /En attente/ });
    const handled = within(tracking()).getByRole('link', { name: /Validées \/ traitées/ });
    const archived = within(tracking()).getByRole('link', { name: /Archives/ });

    // Nom : titre et nombre ; le descriptif est la description du lien.
    await waitFor(() => expect(pending).toHaveAccessibleName('En attente 3 demandes'));
    expect(handled).toHaveAccessibleName('Validées / traitées 1 demande');
    expect(archived).toHaveAccessibleName('Archives 12 demandes');
    expect(pending).toHaveAccessibleDescription('Demandes envoyées qui attendent une validation ou sont en cours de traitement.');
    expect(within(pending).getByText('Demandes envoyées qui attendent une validation ou sont en cours de traitement.')).toBeVisible();

    expect(pending).toHaveAttribute('href', '/demandes/suivi/en-attente');
    expect(handled).toHaveAttribute('href', '/demandes/suivi/traitees');
    expect(archived).toHaveAttribute('href', '/demandes/suivi/archives');
    // Toute la surface est le lien : icône, compteur et chevron sont à l'intérieur.
    expect(pending.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
    expect(within(pending).getByText('3')).toBeVisible();
  });

  it('compteurs relus quand les listes de demandes sont invalidées (changement de statut)', async () => {
    let pending = 3;
    const { queryClient } = renderAt('/', { tracking: () => json(200, { pending, handled: 0, archived: 0 }) });
    const link = await within(await screen.findByRole('region', { name: 'Suivi de mes demandes' })).findByRole('link', { name: /En attente/ });
    await waitFor(() => expect(link).toHaveAccessibleName('En attente 3 demandes'));

    pending = 2;
    // Même clé que celle invalidée par les événements temps réel « request:updated » et « notification:new ».
    await act(() => queryClient.invalidateQueries({ queryKey: ['requests', 'list'] }));
    await waitFor(() => expect(link).toHaveAccessibleName('En attente 2 demandes'));
  });

  it('compteurs indisponibles : les boutons restent utilisables, avec un message et « Réessayer »', async () => {
    renderAt('/', { tracking: () => json(500, { error: { code: 'INTERNAL', message: 'Erreur' } }) });
    expect(await screen.findByText('Impossible de charger le nombre de vos demandes.')).toBeVisible();
    expect(within(tracking()).getByRole('link', { name: /En attente/ })).toHaveAttribute('href', '/demandes/suivi/en-attente');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  });

  it.each([
    ['admin enseignant', { ...TEACHER, role: 'ADMIN' }],
    ['employé non enseignant', { ...TEACHER, isTeacher: false }],
  ])('%s : l’accueil reste « Mes demandes », sans appel de suivi', async (_label, me) => {
    const { urls } = renderAt('/', { me });
    expect(await screen.findByRole('heading', { level: 1, name: 'Mes demandes' })).toBeVisible();
    expect(urls).not.toContain('/api/requests/tracking');
    expect(within(mainNav()).queryByRole('link', { name: 'Accueil' })).not.toBeInTheDocument();
  });
});

describe('Listes du suivi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['en-attente', 'pending', 'En attente'],
    ['traitees', 'handled', 'Validées / traitées'],
    ['archives', 'archived', 'Archives'],
  ])('/demandes/suivi/%s : demande au serveur le groupe « %s » de ses propres demandes', async (slug, group, title) => {
    const { urls } = renderAt(`/demandes/suivi/${slug}`, { lists: { [group]: [summary('1', 'Photocopies du contrôle', 'SENT')] } });
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeVisible();
    const row = await screen.findByRole('link', { name: /Photocopies du contrôle/ });
    expect(row).toHaveAttribute('href', '/demandes/1');
    expect(urls.some((u) => u.startsWith('/api/requests?scope=mine') && u.includes(`tracking=${group}`))).toBe(true);
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toHaveAttribute('href', '/');
  });

  it('liste vide : un état vide explicite', async () => {
    renderAt('/demandes/suivi/archives');
    expect(await screen.findByText('Aucune demande archivée pour le moment.')).toBeVisible();
  });

  it('groupe inconnu : retour à l’accueil, aucune liste demandée', async () => {
    const { router, urls } = renderAt('/demandes/suivi/toutes');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(urls.some((u) => u.includes('tracking='))).toBe(false);
  });
});
