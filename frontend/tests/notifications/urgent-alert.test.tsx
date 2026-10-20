import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationCenter } from '../../src/features/notifications/NotificationCenter';
import { SocketProvider, type SocketLike } from '../../src/features/notifications/SocketProvider';

/**
 * T062 — Alerte URGENT (classe vide, double affectation…) : `role="alert"`, annonce assertive,
 * bandeau persistant ; signal sonore facultatif, désactivable, jamais joué sans interaction
 * préalable avec la page, jamais seul porteur de l'information.
 */

class FakeSocket implements SocketLike {
  private handlers = new Map<string, Array<(...args: never[]) => void>>();
  on(event: string, handler: (...args: never[]) => void): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }
  disconnect(): this {
    return this;
  }
  emit(event: string, payload?: unknown): void {
    for (const handler of this.handlers.get(event) ?? [])
      (handler as (p?: unknown) => void)(payload);
  }
}

/** Faux Web Audio : compte les sons joués. */
let beeps = 0;
class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  resume() {
    return Promise.resolve();
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime: () => undefined },
      connect: (node: unknown) => node,
      start: () => {
        beeps += 1;
      },
      stop: () => undefined,
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
      connect: (node: unknown) => node,
    };
  }
}

function setup() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/api/notifications?')) {
        return new Response(JSON.stringify({ items: [], nextCursor: null, unreadTotal: 0 }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    }),
  );
  vi.stubGlobal('AudioContext', FakeAudioContext);
  const socket = new FakeSocket();
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
    ],
    { initialEntries: ['/'] },
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return {
    send: (priority: 'URGENT' | 'NORMAL', type = 'COVERAGE_EMPTY_CLASS') =>
      act(() =>
        socket.emit('notification:new', {
          id: String(Math.random()),
          type,
          priority,
          requestId: 'g1',
          reference: 'G-2026-000001',
          title: 'Classe vide — 1ère année Violet',
          kind: 'COVERAGE',
          createdAt: '2026-10-20T08:00:00.000Z',
        }),
      ),
  };
}

beforeEach(() => {
  beeps = 0;
  try {
    localStorage.clear();
  } catch {
    // stockage indisponible : préférence par défaut
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Alerte urgente', () => {
  it('rôle alert, annonce assertive, bandeau qui reste affiché', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const env = setup();
    await screen.findByRole('button', { name: /Notifications/ });
    env.send('URGENT');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Urgent — Classe vide signalée : Classe vide — 1ère année Violet',
    );
    expect(screen.getByTestId('annonce-urgente')).toHaveAttribute('aria-live', 'assertive');
    expect(screen.getByTestId('annonce-urgente')).toHaveTextContent('Classe vide signalée');
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('aucun son sans interaction préalable avec la page', async () => {
    const env = setup();
    await screen.findByRole('button', { name: /Notifications/ });
    env.send('URGENT');
    await screen.findByRole('alert');
    expect(beeps).toBe(0);
  });

  it('après une interaction : un son pour une urgence, aucun pour une notification ordinaire', async () => {
    const user = userEvent.setup();
    const env = setup();
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    await user.keyboard('{Escape}');
    env.send('NORMAL', 'COVERAGE_PRESENCE');
    expect(beeps).toBe(0);
    env.send('URGENT');
    await screen.findByRole('alert');
    expect(beeps).toBe(1);
  });

  it('son désactivable dans le menu des notifications ; l’alerte visuelle reste', async () => {
    const user = userEvent.setup();
    const env = setup();
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    const toggle = await screen.findByRole('menuitemcheckbox', {
      name: /Signal sonore des urgences/,
    });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    // Le menu masque le reste de la page aux technologies d'assistance tant qu'il se ferme.
    const close = async () => {
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    };
    await close();
    // Préférence conservée à la réouverture.
    await user.click(screen.getByRole('button', { name: /Notifications/ }));
    expect(
      within(await screen.findByRole('menu')).getByRole('menuitemcheckbox', {
        name: /Signal sonore des urgences/,
      }),
    ).toHaveAttribute('aria-checked', 'false');
    await close();
    env.send('URGENT');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(beeps).toBe(0);
  });
});
