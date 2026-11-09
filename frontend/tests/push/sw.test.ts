import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NOTIFICATION_LABELS, type NotificationType } from '../../src/features/notifications/api';
import { en } from '../../src/i18n/en';

/**
 * 014, T022 (contracts/push-payload.md, D7, D10, FR-008, NFR-003) : service worker exécuté avec un
 * `self` simulé. Il compose le texte dans la langue de l'appareil, ne s'affiche pas quand l'application
 * est au premier plan (sauf iPhone/iPad), n'ouvre que l'application et ne met rien en cache.
 */

const SOURCE = readFileSync(join(__dirname, '..', '..', 'public', 'sw.js'), 'utf8');
const ORIGIN = 'https://ecole.example';

const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

/** Les 16 types envoyés en push (spec.md, correspondance validée). */
const PUSH_TYPES: NotificationType[] = [
  'URGENT',
  'ASSIGNED',
  'COVERAGE_REQUESTED',
  'COVERAGE_EMPTY_CLASS',
  'COVERAGE_LIFTED',
  'COVERAGE_UPDATED',
  'COVERAGE_EXTENDED',
  'COVERAGE_RELIEF_REQUESTED',
  'COVERAGE_LATE',
  'COVERAGE_DOUBLE_ASSIGNMENT',
  'COVERAGE_SUPPORT_REMINDER',
  'COVERAGE_TAKEOVER_EXPIRED',
  'COVERAGE_ESCALATED',
  'COVERAGE_UNFILLED',
  'COVERAGE_TEACHER_ARRIVED',
  'COVERAGE_ATTENDANCE_ANOMALY',
];

interface FakeWindow {
  url: string;
  focused: boolean;
  visibilityState: 'visible' | 'hidden';
  focus: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
}

const windowClient = (state: Partial<FakeWindow> = {}): FakeWindow => ({
  url: `${ORIGIN}/demandes`,
  focused: false,
  visibilityState: 'hidden',
  focus: vi.fn(async () => undefined),
  navigate: vi.fn(async () => undefined),
  ...state,
});

function loadWorker(options: { lang?: string; userAgent?: string; windows?: FakeWindow[] } = {}) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const showNotification = vi.fn(async () => undefined);
  const openWindow = vi.fn(async () => null);
  const claim = vi.fn(async () => undefined);
  const skipWaiting = vi.fn(async () => undefined);
  const self = {
    location: new URL(`${ORIGIN}/sw.js?lang=${options.lang ?? 'fr'}`),
    navigator: { userAgent: options.userAgent ?? DESKTOP },
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners[type] = listener;
    },
    registration: { showNotification },
    clients: { matchAll: vi.fn(async () => options.windows ?? []), openWindow, claim },
    skipWaiting,
  };
  new Function('self', SOURCE)(self);

  async function dispatch(type: string, event: Record<string, unknown>) {
    let work: Promise<unknown> = Promise.resolve();
    listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => (work = p) });
    await work;
  }

  return {
    listeners,
    showNotification,
    openWindow,
    claim,
    skipWaiting,
    push: (data: unknown) => dispatch('push', { data: { json: () => data } }),
    click: (data: unknown) => dispatch('notificationclick', { notification: { data, close: vi.fn() } }),
  };
}

const PAYLOAD = { v: 1, id: 'n-1', type: 'COVERAGE_EMPTY_CLASS', place: 'CE1 Vert', url: '/gardes/g-1' };

describe('service worker — push', () => {
  it('affiche le libellé du type et la classe, remplaçable par son identifiant', async () => {
    const sw = loadWorker();
    await sw.push(PAYLOAD);
    expect(sw.showNotification).toHaveBeenCalledWith(
      'Classe vide signalée',
      expect.objectContaining({ body: 'CE1 Vert', tag: 'n-1', data: { url: '/gardes/g-1', id: 'n-1' } }),
    );
  });

  it('compose le texte en anglais pour un appareil en anglais', async () => {
    const sw = loadWorker({ lang: 'en' });
    await sw.push(PAYLOAD);
    expect(sw.showNotification).toHaveBeenCalledWith('Empty class reported', expect.objectContaining({ body: 'CE1 Vert' }));
  });

  it.each(PUSH_TYPES)('%s : mêmes libellés que l’application, en français et en anglais', async (type) => {
    const fr = loadWorker();
    await fr.push({ ...PAYLOAD, type });
    expect(fr.showNotification).toHaveBeenCalledWith(NOTIFICATION_LABELS[type], expect.anything());
    const english = loadWorker({ lang: 'en' });
    await english.push({ ...PAYLOAD, type });
    expect(english.showNotification).toHaveBeenCalledWith(en[NOTIFICATION_LABELS[type]], expect.anything());
  });

  it.each([
    ['ordinateur', DESKTOP],
    ['Android', ANDROID],
  ])('%s : rien quand l’application est visible et active (D10)', async (_label, userAgent) => {
    const sw = loadWorker({ userAgent, windows: [windowClient({ focused: true, visibilityState: 'visible' })] });
    await sw.push(PAYLOAD);
    expect(sw.showNotification).not.toHaveBeenCalled();
  });

  it('affiche quand l’application est ouverte mais pas au premier plan', async () => {
    const sw = loadWorker({ windows: [windowClient({ focused: false, visibilityState: 'visible' }), windowClient()] });
    await sw.push(PAYLOAD);
    expect(sw.showNotification).toHaveBeenCalledTimes(1);
  });

  it('iPhone : affiche toujours, même au premier plan (exigence WebKit)', async () => {
    const sw = loadWorker({ userAgent: IPHONE, windows: [windowClient({ focused: true, visibilityState: 'visible' })] });
    await sw.push(PAYLOAD);
    expect(sw.showNotification).toHaveBeenCalledWith('Classe vide signalée', expect.anything());
  });

  it.each([
    ['version inconnue', { ...PAYLOAD, v: 2 }],
    ['type non envoyé en push', { ...PAYLOAD, type: 'MESSAGE_NEW' }],
    ['adresse absolue', { ...PAYLOAD, url: 'https://exemple.test/' }],
    ['adresse sans schéma', { ...PAYLOAD, url: '//exemple.test/' }],
    ['contenu vide', null],
  ])('contenu invalide (%s) : rien sur ordinateur, notification générique sur iPhone', async (_label, data) => {
    const desktop = loadWorker();
    await desktop.push(data);
    expect(desktop.showNotification).not.toHaveBeenCalled();

    const iphone = loadWorker({ userAgent: IPHONE });
    await iphone.push(data);
    expect(iphone.showNotification).toHaveBeenCalledWith('Nouvelle notification', expect.not.objectContaining({ body: expect.anything() }));
  });
});

describe('service worker — clic', () => {
  it('dirige une fenêtre existante de l’application vers la ressource et la met au premier plan', async () => {
    const existing = windowClient();
    const sw = loadWorker({ windows: [existing] });
    await sw.click({ url: '/gardes/g-1', id: 'n-1' });
    expect(existing.navigate).toHaveBeenCalledWith(`${ORIGIN}/gardes/g-1?notification=n-1`);
    expect(existing.focus).toHaveBeenCalled();
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it('ouvre une fenêtre si l’application n’est pas ouverte', async () => {
    const sw = loadWorker();
    await sw.click({ url: '/demandes/d-1', id: 'n-2' });
    expect(sw.openWindow).toHaveBeenCalledWith(`${ORIGIN}/demandes/d-1?notification=n-2`);
  });

  it('ouvre une fenêtre si la fenêtre existante ne peut pas être dirigée', async () => {
    const existing = windowClient({ navigate: vi.fn(async () => Promise.reject(new TypeError('non contrôlée'))) });
    const sw = loadWorker({ windows: [existing] });
    await sw.click({ url: '/gardes/g-1', id: 'n-1' });
    expect(sw.openWindow).toHaveBeenCalledWith(`${ORIGIN}/gardes/g-1?notification=n-1`);
  });

  it.each(['https://exemple.test/piege', '//exemple.test/piege', 'javascript:alert(1)', 42])(
    'n’ouvre jamais une autre origine (%s)',
    async (url) => {
      const sw = loadWorker();
      await sw.click({ url, id: 'n-3' });
      const [opened] = sw.openWindow.mock.calls[0] as unknown as [string];
      expect(new URL(opened).origin).toBe(ORIGIN);
      expect(new URL(opened).pathname).toBe('/');
    },
  );
});

describe('service worker — cycle de vie et cache', () => {
  it('n’intercepte aucune requête (aucun cache, NFR-003)', () => {
    const sw = loadWorker();
    expect(sw.listeners.fetch).toBeUndefined();
    expect(Object.keys(sw.listeners).sort()).toEqual(['activate', 'install', 'notificationclick', 'push']);
  });

  it('une nouvelle version remplace l’ancienne sans action de l’utilisateur', async () => {
    const sw = loadWorker();
    let work: Promise<unknown> = Promise.resolve();
    sw.listeners.install({ waitUntil: (p: Promise<unknown>) => (work = p) });
    await work;
    expect(sw.skipWaiting).toHaveBeenCalled();
    sw.listeners.activate({ waitUntil: (p: Promise<unknown>) => (work = p) });
    await work;
    expect(sw.claim).toHaveBeenCalled();
  });
});
