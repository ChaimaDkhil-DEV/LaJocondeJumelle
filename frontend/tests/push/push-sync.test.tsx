import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePushSync } from '../../src/features/push/usePushDevice';
import { fakeSubscription, installBrowser, resetBrowser, SERVER_KEY, type BrowserOptions } from './push-env';

/**
 * 014, T038 (research R8, NC-3) : à l'ouverture de l'application, un navigateur déjà abonné avec la clé de
 * l'établissement renvoie son abonnement au serveur, une seule fois ; rien n'est enregistré ni demandé sinon.
 */

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function Harness() {
  usePushSync();
  return null;
}

function setup(browser: BrowserOptions, enabled = true) {
  const env = installBrowser(browser);
  const puts: unknown[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    if (url === '/api/push/config') return json(200, { enabled, publicKey: enabled ? SERVER_KEY : null });
    if (url === '/api/push/subscriptions' && init.method === 'PUT') {
      puts.push(JSON.parse(String(init.body)));
      return json(200, { id: 'p1', deviceLabel: 'Windows · Chrome', created: false });
    }
    return json(200, []);
  });
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
  const configLoaded = () => waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/push/config', expect.anything()));
  return { ...env, puts, view, client, configLoaded };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

afterEach(() => {
  vi.unstubAllGlobals();
  resetBrowser();
});

describe('usePushSync', () => {
  it('abonnement à la bonne clé : un seul envoi au serveur, sans réenregistrer le service worker', async () => {
    const { puts, serviceWorker, view, client } = setup({
      permission: 'granted',
      subscription: fakeSubscription(),
      registeredScript: '/sw.js?lang=fr',
    });
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/appareil-test', keys: { p256dh: 'BCle-de-test', auth: 'secret-de-test' } });
    expect(serviceWorker.register).not.toHaveBeenCalled();

    view.rerender(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );
    await settle();
    expect(puts).toHaveLength(1);
  });

  it('service worker enregistré dans une autre langue : réenregistré dans la langue de l’appareil', async () => {
    const { puts, serviceWorker } = setup({ permission: 'granted', subscription: fakeSubscription(), registeredScript: '/sw.js?lang=en' });
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js?lang=fr', { scope: '/', updateViaCache: 'none' });
  });

  it('abonnement à une autre clé : aucun envoi (l’appareil est « à réactiver »)', async () => {
    const { puts, configLoaded } = setup({
      permission: 'granted',
      subscription: fakeSubscription(`BB${'B'.repeat(84)}`),
      registeredScript: '/sw.js?lang=fr',
    });
    await configLoaded();
    await settle();
    expect(puts).toEqual([]);
  });

  it.each([
    ['push désactivé par l’établissement', { permission: 'granted' as NotificationPermission, subscription: fakeSubscription(), registeredScript: '/sw.js?lang=fr' }, false],
    ['aucun abonnement', { permission: 'granted' as NotificationPermission, registeredScript: '/sw.js?lang=fr' }, true],
    ['autorisation non accordée', { permission: 'default' as NotificationPermission, subscription: fakeSubscription(), registeredScript: '/sw.js?lang=fr' }, true],
    ['aucun service worker enregistré', { permission: 'granted' as NotificationPermission }, true],
  ])('%s : aucun envoi ni enregistrement du service worker', async (_label, browser, enabled) => {
    const { puts, serviceWorker, notification, configLoaded } = setup(browser, enabled);
    await configLoaded();
    await settle();
    expect(puts).toEqual([]);
    expect(serviceWorker.register).not.toHaveBeenCalled();
    expect(notification.requestPermission).not.toHaveBeenCalled();
  });
});
