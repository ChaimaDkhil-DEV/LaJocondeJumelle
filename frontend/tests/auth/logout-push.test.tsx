import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLogout } from '../../src/features/auth/useCurrentUser';
import { fakeSubscription, installBrowser, resetBrowser } from '../push/push-env';

/**
 * 014, T065 (US5, D8, SC-003) : à la déconnexion, l'appareil se désabonne et retire son abonnement côté
 * serveur avant la fermeture de la session ; un échec de ces étapes n'empêche jamais la déconnexion.
 */

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function LogoutButton() {
  const logout = useLogout();
  return (
    <button type="button" onClick={() => logout.mutate()}>
      Se déconnecter
    </button>
  );
}

function setup(options: { deleteStatus?: number; unsubscribeFails?: boolean } = {}) {
  const subscription = fakeSubscription();
  const env = installBrowser({ permission: 'granted', subscription, registeredScript: '/sw.js?lang=fr' });
  if (options.unsubscribeFails) subscription.unsubscribe = vi.fn(async () => Promise.reject(new Error('navigateur')));
  const order: string[] = [];
  const unsubscribe = subscription.unsubscribe as unknown as () => Promise<boolean>;
  subscription.unsubscribe = vi.fn(async () => {
    order.push('unsubscribe');
    return unsubscribe();
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (url === '/api/push/subscriptions/current' && method === 'DELETE') {
        order.push('delete-current');
        return options.deleteStatus ? json(options.deleteStatus, { error: { code: 'INTERNAL_ERROR', message: 'Erreur' } }) : json(204);
      }
      if (url === '/api/auth/logout' && method === 'POST') {
        order.push('logout');
        return json(204);
      }
      return json(200, []);
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LogoutButton />
    </QueryClientProvider>,
  );
  return { order, env };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetBrowser();
});

describe('Déconnexion et notifications push (US5)', () => {
  it('désabonne l’appareil et retire l’abonnement avant de fermer la session', async () => {
    const user = userEvent.setup();
    const { order } = setup();
    await user.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    await waitFor(() => expect(order).toContain('logout'));
    expect(order).toEqual(['unsubscribe', 'delete-current', 'logout']);
  });

  it.each([
    ['retrait côté serveur en échec', { deleteStatus: 500 }],
    ['désabonnement du navigateur en échec', { unsubscribeFails: true }],
  ])('%s : la déconnexion a lieu quand même', async (_label, options) => {
    const user = userEvent.setup();
    const { order } = setup(options);
    await user.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    await waitFor(() => expect(order).toContain('logout'));
  });
});
