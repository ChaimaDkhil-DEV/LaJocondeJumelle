import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationCenter } from '../../src/features/notifications/NotificationCenter';
import { SocketProvider, type SocketLike } from '../../src/features/notifications/SocketProvider';

/** T068 — centre de notifications et connexion temps réel (contracts/realtime-events.md). */

class FakeSocket implements SocketLike {
  private handlers = new Map<string, Array<(...args: never[]) => void>>();
  disconnected = false;
  on(event: string, handler: (...args: never[]) => void): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }
  disconnect(): this {
    this.disconnected = true;
    return this;
  }
  emit(event: string, payload?: unknown): void {
    for (const handler of this.handlers.get(event) ?? [])
      (handler as (p?: unknown) => void)(payload);
  }
}

type Notif = {
  id: string;
  type: string;
  priority: string;
  request: { id: string; reference: string; title: string };
  createdAt: string;
  readAt: null;
};

function notif(id: string, type: string, priority = 'NORMAL', title = 'Photocopies'): Notif {
  return {
    id,
    type,
    priority,
    request: { id: `r-${id}`, reference: `D-2026-00000${id}`, title },
    createdAt: '2026-10-12T10:00:00.000Z',
    readAt: null,
  };
}

function setup(initial: Notif[]) {
  let unread = [...initial];
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({
        url,
        method,
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      if (url.startsWith('/api/notifications?')) {
        return new Response(
          JSON.stringify({ items: unread, nextCursor: null, unreadTotal: unread.length }),
          {
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
      if (url === '/api/notifications/read') {
        unread = [];
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 404 });
    }),
  );
  const socket = new FakeSocket();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <SocketProvider createSocket={() => socket}>
            <NotificationCenter />
          </SocketProvider>
        ),
      },
      { path: '/connexion', element: <p>Page de connexion</p> },
      { path: '/demandes/:id', element: <p>Détail de la demande</p> },
    ],
    { initialEntries: ['/'] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return {
    socket,
    calls,
    invalidate,
    push: (n: Notif) => {
      unread = [n, ...unread];
    },
    notificationGets: () => calls.filter((c) => c.url.startsWith('/api/notifications?')).length,
  };
}

describe('NotificationCenter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('affiche le nombre de notifications non lues', async () => {
    setup([notif('1', 'REQUEST_NEW'), notif('2', 'MESSAGE_NEW')]);
    expect(await screen.findByRole('button', { name: 'Notifications (2 non lues)' })).toBeVisible();
  });

  it('à la (re)connexion, relit les notifications non lues', async () => {
    const env = setup([]);
    await screen.findByRole('button', { name: 'Notifications (0 non lue)' });
    const before = env.notificationGets();
    act(() => env.socket.emit('connect'));
    await waitFor(() => expect(env.notificationGets()).toBeGreaterThan(before));
  });

  it('une nouvelle notification met à jour le compteur sans rechargement et est annoncée poliment', async () => {
    const env = setup([]);
    await screen.findByRole('button', { name: 'Notifications (0 non lue)' });
    const fresh = notif('3', 'REQUEST_NEW', 'NORMAL', 'Affiches A3');
    env.push(fresh);
    act(() =>
      env.socket.emit('notification:new', {
        id: '3',
        type: 'REQUEST_NEW',
        priority: 'NORMAL',
        requestId: 'r-3',
        reference: 'D-2026-000003',
        title: 'Affiches A3',
        createdAt: fresh.createdAt,
      }),
    );
    expect(await screen.findByRole('button', { name: 'Notifications (1 non lue)' })).toBeVisible();
    expect(screen.getByTestId('annonce-polie')).toHaveTextContent('Nouvelle demande : Affiches A3');
    expect(screen.getByTestId('annonce-polie')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveTextContent('Affiches A3');
  });

  it('une demande urgente est signalée par une icône, le mot « Urgent » et une annonce immédiate', async () => {
    const env = setup([]);
    await screen.findByRole('button', { name: 'Notifications (0 non lue)' });
    env.push(notif('4', 'URGENT', 'URGENT', 'Photocopies brevet'));
    act(() =>
      env.socket.emit('notification:new', {
        id: '4',
        type: 'URGENT',
        priority: 'URGENT',
        requestId: 'r-4',
        reference: 'D-2026-000004',
        title: 'Photocopies brevet',
        createdAt: '2026-10-12T10:00:00.000Z',
      }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Urgent');
    expect(alert).toHaveTextContent('Photocopies brevet');
    expect(within(alert).getByTestId('notification-urgente-icone')).toBeInTheDocument();
    expect(screen.getByTestId('annonce-urgente')).toHaveAttribute('aria-live', 'assertive');
    expect(screen.getByTestId('annonce-urgente')).toHaveTextContent(
      'Demande urgente : Photocopies brevet',
    );
  });

  it('liste les notifications, ouvre la demande et permet de tout marquer comme lu', async () => {
    const env = setup([
      notif('1', 'TO_CORRECT', 'NORMAL', 'Étagère'),
      notif('2', 'URGENT', 'URGENT', 'Brevet'),
    ]);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Notifications (2 non lues)' }),
    );
    const menu = await screen.findByRole('menu', { name: 'Notifications' });
    expect(
      within(menu).getByRole('menuitem', { name: /Demande à corriger.*Étagère/ }),
    ).toBeVisible();
    expect(within(menu).getByRole('menuitem', { name: /Urgent.*Brevet/ })).toBeVisible();

    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Tout marquer comme lu' }));
    await waitFor(() =>
      expect(env.calls.find((c) => c.url === '/api/notifications/read')?.body).toEqual({
        all: true,
      }),
    );
    expect(await screen.findByRole('button', { name: 'Notifications (0 non lue)' })).toBeVisible();
  });

  it('cliquer une notification la marque comme lue et ouvre la demande', async () => {
    const env = setup([notif('1', 'MESSAGE_NEW', 'NORMAL', 'Photocopies')]);
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications (1 non lue)' }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /Nouveau message.*Photocopies/ }),
    );
    expect(await screen.findByText('Détail de la demande')).toBeVisible();
    expect(env.calls.find((c) => c.url === '/api/notifications/read')?.body).toEqual({
      ids: ['1'],
    });
  });

  it('request:updated et message:new rafraîchissent les données concernées', async () => {
    const env = setup([]);
    await screen.findByRole('button', { name: 'Notifications (0 non lue)' });
    act(() =>
      env.socket.emit('request:updated', {
        requestId: 'r9',
        status: 'ACCEPTED',
        version: 2,
        overdueStage: null,
      }),
    );
    act(() => env.socket.emit('message:new', { requestId: 'r9', messageId: 'm1' }));
    const keys = env.invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify(['requests', 'detail', 'r9']),
        JSON.stringify(['requests', 'list']),
      ]),
    );
  });

  it('session:ended renvoie vers la page de connexion', async () => {
    const env = setup([]);
    await screen.findByRole('button', { name: 'Notifications (0 non lue)' });
    act(() => env.socket.emit('session:ended', { reason: 'EXPIRED' }));
    expect(await screen.findByText('Page de connexion')).toBeVisible();
    expect(env.socket.disconnected).toBe(true);
  });
});
