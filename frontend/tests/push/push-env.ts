import { vi } from 'vitest';

/**
 * Navigateur simulé pour les tests du push (014) : Notification, service worker, PushManager et
 * abonnement. jsdom n'implémente aucun de ces objets ; rien n'atteint un vrai service de push.
 */

/** Clé publique de l'établissement (base64url de 65 octets commençant par 0x04). */
export const SERVER_KEY = `BA${'A'.repeat(84)}`;

export interface FakeSubscription {
  endpoint: string;
  options: { applicationServerKey: ArrayBuffer };
  toJSON: () => { endpoint: string; keys: { p256dh: string; auth: string } };
  unsubscribe: ReturnType<typeof vi.fn>;
}

function bytesOf(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function fakeSubscription(key = SERVER_KEY, endpoint = 'https://fcm.googleapis.com/fcm/send/appareil-test'): FakeSubscription {
  return {
    endpoint,
    options: { applicationServerKey: bytesOf(key) },
    toJSON: () => ({ endpoint, keys: { p256dh: 'BCle-de-test', auth: 'secret-de-test' } }),
    unsubscribe: vi.fn(async () => true),
  };
}

export interface BrowserOptions {
  permission?: NotificationPermission;
  /** Réponse de l'utilisateur à la demande d'autorisation. */
  answer?: NotificationPermission;
  subscription?: FakeSubscription | null;
  /** Service worker déjà enregistré (adresse de son script). */
  registeredScript?: string | null;
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
  supported?: boolean;
  /**
   * Premier enregistrement : le service worker s'installe encore quand `register()` répond et ne devient actif
   * qu'un instant plus tard, comme dans un vrai navigateur ; `ready` attend qu'il soit actif.
   */
  activatesLater?: boolean;
}

export function installBrowser(options: BrowserOptions = {}) {
  let subscription = options.subscription ?? null;
  /** Un abonnement retiré disparaît vraiment du navigateur simulé. */
  const track = (sub: FakeSubscription): FakeSubscription => {
    sub.unsubscribe = vi.fn(async () => {
      if (subscription === sub) subscription = null;
      return true;
    });
    return sub;
  };
  if (subscription) track(subscription);
  type Registration = { pushManager: PushManagerFake; active: { scriptURL: string } | null };
  type PushManagerFake = typeof pushManager;
  let registration: Registration | undefined;
  const pushManager = {
    getSubscription: vi.fn(async () => subscription),
    subscribe: vi.fn(async (init: { userVisibleOnly?: boolean; applicationServerKey: Uint8Array }) => {
      // Comme Chrome : pas d'abonnement sans service worker actif.
      if (!registration?.active) throw new DOMException('Subscription failed - no active Service Worker', 'AbortError');
      const key = btoa(String.fromCharCode(...new Uint8Array(init.applicationServerKey)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      subscription = track(fakeSubscription(key));
      return subscription;
    }),
  };
  let markReady: (value: Registration) => void = () => undefined;
  const ready = new Promise<Registration>((resolve) => (markReady = resolve));
  if (options.registeredScript) {
    registration = { pushManager, active: { scriptURL: `http://localhost:3000${options.registeredScript}` } };
    markReady(registration);
  }
  const serviceWorker = {
    register: vi.fn(async (script: string) => {
      const active = { scriptURL: `http://localhost:3000${script}` };
      if (options.activatesLater && !registration?.active) {
        const installing: Registration = { pushManager, active: null };
        registration = installing;
        setTimeout(() => {
          installing.active = active;
          markReady(installing);
        }, 20);
        return installing;
      }
      registration = { pushManager, active };
      markReady(registration);
      return registration;
    }),
    getRegistration: vi.fn(async () => registration),
    ready,
  };
  const notification = {
    permission: options.permission ?? 'default',
    requestPermission: vi.fn(async () => {
      notification.permission = options.answer ?? 'granted';
      return notification.permission;
    }),
  };

  const supported = options.supported ?? true;
  if (supported) {
    vi.stubGlobal('Notification', notification);
    vi.stubGlobal('PushManager', function PushManager() {});
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker });
  } else {
    vi.stubGlobal('Notification', undefined);
    vi.stubGlobal('PushManager', undefined);
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined });
  }
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: options.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36' });
  Object.defineProperty(navigator, 'platform', { configurable: true, value: options.platform ?? 'Win32' });
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: options.maxTouchPoints ?? 0 });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('standalone') ? (options.standalone ?? false) : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  }));

  return { notification, serviceWorker, pushManager, current: () => subscription };
}

/** Rend son état d'origine au navigateur simulé (à appeler dans afterEach). */
export function resetBrowser(): void {
  for (const key of ['serviceWorker', 'userAgent', 'platform', 'maxTouchPoints']) {
    Reflect.deleteProperty(navigator, key);
  }
}
