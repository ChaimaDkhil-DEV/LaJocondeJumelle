import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationsSection } from '../../src/features/push/NotificationsSection';
import { fakeSubscription, installBrowser, resetBrowser, SERVER_KEY, type BrowserOptions } from './push-env';

/**
 * 014, T035 (US2, FR-001, FR-002, FR-003, FR-013, contracts/ui.md) : bloc « Cet appareil » de la section
 * « Notifications » de « Mon profil ». Aucune demande d'autorisation avant le clic ; chaque état a son
 * message ; l'activation enregistre le service worker, abonne l'appareil et l'envoie au serveur.
 */

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

interface Setup {
  browser?: BrowserOptions;
  enabled?: boolean;
  put?: Response;
}

function setup({ browser = {}, enabled = true, put }: Setup = {}) {
  const env = installBrowser(browser);
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
      if (url === '/api/push/config') return json(200, { enabled, publicKey: enabled ? SERVER_KEY : null });
      if (url === '/api/push/subscriptions' && method === 'PUT') {
        return put ?? json(201, { id: 'p1', deviceLabel: 'Windows · Chrome', created: true });
      }
      if (url === '/api/push/subscriptions/current' && method === 'DELETE') return json(204);
      return json(200, []);
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NotificationsSection />
    </QueryClientProvider>,
  );
  return { ...env, calls };
}

/** Zone d'état « Cet appareil », une fois son texte chargé. */
const expectStatus = (text: string) =>
  waitFor(() => expect(screen.getByRole('status', { name: /cet appareil/i })).toHaveTextContent(text));

afterEach(() => {
  vi.unstubAllGlobals();
  resetBrowser();
});

describe('Section « Notifications » — cet appareil (US2)', () => {
  it('a un titre de niveau 2 et la note sur les appareils partagés', async () => {
    setup();
    expect(await screen.findByRole('heading', { level: 2, name: 'Notifications' })).toBeVisible();
    expect(
      screen.getByText('Sur un appareil partagé, déconnectez-vous en partant : sinon vos notifications continuent d’y arriver.'),
    ).toBeVisible();
  });

  it('n’affiche jamais de demande d’autorisation à l’ouverture (FR-001)', async () => {
    const { notification, serviceWorker } = setup();
    await expectStatus('Les notifications push sont désactivées sur cet appareil.');
    expect(screen.getByRole('button', { name: 'Activer les notifications sur cet appareil' })).toBeEnabled();
    expect(notification.requestPermission).not.toHaveBeenCalled();
    expect(serviceWorker.register).not.toHaveBeenCalled();
  });

  it('activation : autorisation, service worker, abonnement, enregistrement côté serveur', async () => {
    const user = userEvent.setup();
    const { notification, serviceWorker, pushManager, calls } = setup();
    await user.click(await screen.findByRole('button', { name: 'Activer les notifications sur cet appareil' }));

    await waitFor(() => expect(within(screen.getByRole('status', { name: /cet appareil/i })).getByText('Les notifications push sont actives sur cet appareil.')).toBeVisible());
    expect(notification.requestPermission).toHaveBeenCalledTimes(1);
    expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js?lang=fr', { scope: '/', updateViaCache: 'none' });
    const [subscribeInit] = pushManager.subscribe.mock.calls[0];
    expect(subscribeInit.userVisibleOnly).toBe(true);
    expect(new Uint8Array(subscribeInit.applicationServerKey)[0]).toBe(0x04);
    expect(calls.filter((c) => c.method === 'PUT')).toEqual([
      {
        url: '/api/push/subscriptions',
        method: 'PUT',
        body: { endpoint: 'https://fcm.googleapis.com/fcm/send/appareil-test', keys: { p256dh: 'BCle-de-test', auth: 'secret-de-test' } },
      },
    ]);
    expect(screen.getByRole('button', { name: 'Désactiver sur cet appareil' })).toBeVisible();
  });

  it('première activation, service worker encore en installation : l’abonnement attend qu’il soit actif', async () => {
    const user = userEvent.setup();
    const { pushManager, calls } = setup({ browser: { activatesLater: true } });
    await user.click(await screen.findByRole('button', { name: 'Activer les notifications sur cet appareil' }));

    await expectStatus('Les notifications push sont actives sur cet appareil.');
    expect(screen.queryByText('Activation impossible. Vérifiez votre connexion puis réessayez.')).toBeNull();
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  });

  it('autorisation refusée au clic : message « refusé », rien n’est abonné', async () => {
    const user = userEvent.setup();
    const { pushManager, calls } = setup({ browser: { answer: 'denied' } });
    await user.click(await screen.findByRole('button', { name: 'Activer les notifications sur cet appareil' }));
    expect(await screen.findByText(/Vous avez refusé les notifications pour ce site\./)).toBeVisible();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('limite de 10 appareils : message du serveur, l’abonnement du navigateur est retiré', async () => {
    const user = userEvent.setup();
    const message = 'Vous avez déjà 10 appareils abonnés. Retirez-en un pour activer celui-ci.';
    const env = setup({ put: json(409, { error: { code: 'PUSH_DEVICE_LIMIT', message } }) });
    await user.click(await screen.findByRole('button', { name: 'Activer les notifications sur cet appareil' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    await waitFor(() => expect(env.current()).toBeNull());
    await expectStatus('Les notifications push sont désactivées sur cet appareil.');
  });

  it('désactivation : désabonnement du navigateur et retrait côté serveur', async () => {
    const user = userEvent.setup();
    const subscription = fakeSubscription();
    const { calls } = setup({ browser: { permission: 'granted', subscription, registeredScript: '/sw.js?lang=fr' } });
    await expectStatus('Les notifications push sont actives sur cet appareil.');
    await user.click(screen.getByRole('button', { name: 'Désactiver sur cet appareil' }));
    await waitFor(() => expect(subscription.unsubscribe).toHaveBeenCalled());
    expect(calls).toContainEqual({ url: '/api/push/subscriptions/current', method: 'DELETE', body: undefined });
    await expectStatus('Les notifications push sont désactivées sur cet appareil.');
  });

  it('clé changée par l’établissement : « Réactiver » réabonne avec la nouvelle clé', async () => {
    const user = userEvent.setup();
    const old = fakeSubscription(`BB${'B'.repeat(84)}`);
    const { pushManager, calls } = setup({ browser: { permission: 'granted', subscription: old, registeredScript: '/sw.js?lang=fr' } });
    await expectStatus('Les notifications de cet appareil doivent être réactivées.');
    await user.click(screen.getByRole('button', { name: 'Réactiver' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(old.unsubscribe).toHaveBeenCalled();
    expect(pushManager.subscribe).toHaveBeenCalled();
    await expectStatus('Les notifications push sont actives sur cet appareil.');
  });

  it.each([
    ['désactivé par l’établissement', { enabled: false }, 'Les notifications push ne sont pas activées par l’établissement.'],
    [
      'non pris en charge',
      { browser: { supported: false } },
      'Cet appareil ou ce navigateur ne permet pas les notifications push. Les notifications restent visibles dans l’application.',
    ],
    [
      'refusé',
      { browser: { permission: 'denied' as NotificationPermission } },
      'Vous avez refusé les notifications pour ce site. Réactivez-les dans les réglages du navigateur ou du téléphone.',
    ],
  ])('%s : message, aucune activation possible', async (_label, options, message) => {
    setup(options);
    await expectStatus(message);
    expect(screen.queryByRole('button', { name: /Activer|Réactiver/ })).toBeNull();
  });

  it('iPhone hors écran d’accueil : étapes d’installation en liste numérotée, sans bouton d’activation', async () => {
    setup({ browser: { userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 } });
    await expectStatus('Sur iPhone et iPad (iOS 16.4 ou plus récent), ajoutez d’abord l’application à l’écran d’accueil :');
    const steps = within(screen.getByRole('list', { name: 'Installer l’application sur l’écran d’accueil' })).getAllByRole('listitem');
    expect(steps.map((s) => s.textContent)).toEqual([
      'Touchez « Partager ».',
      'Choisissez « Sur l’écran d’accueil ».',
      'Ouvrez l’application depuis l’écran d’accueil, puis revenez ici.',
    ]);
    expect(screen.getByRole('list', { name: 'Installer l’application sur l’écran d’accueil' }).tagName).toBe('OL');
    expect(screen.queryByRole('button', { name: /Activer/ })).toBeNull();
  });
});
