import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { language, t } from '../../i18n';
import { removeCurrentPushSubscription, savePushSubscription, usePushConfig, type PushConfig } from './api';
import { base64urlToBytes, bufferToBase64url, pushSupportState, type PushEnvironment, type PushSupportState } from './pushSupport';

/**
 * Push sur l'appareil courant (spec 014, US2) : lecture de l'état, activation après un clic seulement
 * (FR-001), désactivation, et resynchronisation de l'abonnement à chaque ouverture de l'application.
 */

/** Clé de la requête de l'état du push sur l'appareil courant. */
const PUSH_DEVICE_KEY = ['push', 'device'] as const;

/** Adresse du service worker : la langue de l'appareil compose le texte des notifications. */
function workerUrl(): string {
  return `/sw.js?lang=${language()}`;
}

function serviceWorkerContainer(): ServiceWorkerContainer | null {
  return typeof navigator !== 'undefined' && navigator.serviceWorker ? navigator.serviceWorker : null;
}

function hasPushManager(): boolean {
  return typeof window !== 'undefined' && typeof (window as { PushManager?: unknown }).PushManager !== 'undefined';
}

function hasNotification(): boolean {
  return typeof window !== 'undefined' && typeof (window as { Notification?: unknown }).Notification !== 'undefined';
}

function isStandalone(): boolean {
  const media = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  return media || (navigator as { standalone?: boolean }).standalone === true;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const container = serviceWorkerContainer();
  if (!container || !hasPushManager()) return null;
  const registration = await container.getRegistration('/');
  return (await registration?.pushManager.getSubscription()) ?? null;
}

async function readPushEnvironment(config: PushConfig): Promise<PushEnvironment> {
  const subscription = config.enabled ? await currentSubscription().catch(() => null) : null;
  return {
    pushEnabled: config.enabled,
    hasServiceWorker: serviceWorkerContainer() !== null,
    hasPushManager: hasPushManager(),
    hasNotification: hasNotification(),
    permission: hasNotification() ? Notification.permission : 'default',
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: isStandalone(),
    subscriptionKey: bufferToBase64url(subscription?.options.applicationServerKey),
    serverKey: config.publicKey,
  };
}

/**
 * Désabonne ce navigateur et retire l'abonnement de la session courante côté serveur. Utilisé par
 * « Désactiver sur cet appareil » et avant la déconnexion ; l'appel serveur est fait même sans abonnement.
 */
export async function unsubscribeThisDevice(): Promise<void> {
  const subscription = await currentSubscription().catch(() => null);
  await subscription?.unsubscribe().catch(() => false);
  await removeCurrentPushSubscription();
}

export function usePushDevice() {
  const config = usePushConfig();
  // État de l'appareil (autorisation, abonnement du navigateur) : relu après chaque action.
  const environment = useQuery({
    queryKey: [...PUSH_DEVICE_KEY, config.data],
    queryFn: () => readPushEnvironment(config.data!),
    enabled: config.data !== undefined,
    staleTime: Infinity,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    await environment.refetch();
  };

  const state: PushSupportState | null = environment.data ? pushSupportState(environment.data) : null;

  async function activate(): Promise<void> {
    const publicKey = config.data?.publicKey;
    const container = serviceWorkerContainer();
    if (!publicKey || !container) return;
    setBusy(true);
    setError(null);
    try {
      // Seule demande d'autorisation de l'application : jamais sans ce clic (FR-001).
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
      const registration = await container.register(workerUrl(), { scope: '/', updateViaCache: 'none' });
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && bufferToBase64url(subscription.options.applicationServerKey) !== publicKey) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64urlToBytes(publicKey),
      });
      try {
        await savePushSubscription(subscription.toJSON());
      } catch (cause) {
        // Refusé par le serveur (limite d'appareils, push désactivé…) : le navigateur ne reste pas abonné.
        await subscription.unsubscribe().catch(() => false);
        throw cause;
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('Activation impossible. Vérifiez votre connexion puis réessayez.'));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function deactivate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await unsubscribeThisDevice();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('Désactivation impossible. Réessayez.'));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  return { state, busy, error, activate, deactivate };
}

/**
 * À l'ouverture de l'application (research R8) : si ce navigateur est déjà abonné avec la clé de
 * l'établissement, l'abonnement est renvoyé au serveur (session, dernière utilisation) et le service
 * worker suit la langue de l'appareil. Rien n'est enregistré ni demandé sinon ; erreurs ignorées.
 */
export function usePushSync(): void {
  const config = usePushConfig();
  const done = useRef(false);

  useEffect(() => {
    const data = config.data;
    if (done.current || !data?.enabled || !data.publicKey) return;
    if (!hasNotification() || Notification.permission !== 'granted') return;
    const container = serviceWorkerContainer();
    if (!container || !hasPushManager()) return;
    done.current = true;
    void (async () => {
      const registration = await container.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (!registration || !subscription) return;
      if (bufferToBase64url(subscription.options.applicationServerKey) !== data.publicKey) return;
      const script = registration.active?.scriptURL;
      if (script && new URL(script).search !== `?lang=${language()}`) {
        await container.register(workerUrl(), { scope: '/', updateViaCache: 'none' });
      }
      await savePushSubscription(subscription.toJSON());
    })().catch(() => undefined);
  }, [config.data]);
}
