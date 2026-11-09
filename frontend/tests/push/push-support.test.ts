import { describe, expect, it } from 'vitest';
import { pushSupportState, type PushEnvironment } from '../../src/features/push/pushSupport';

/**
 * 014, T033 (D2, FR-002, FR-003, FR-013, research R12) : état du push sur l'appareil courant, évalué dans
 * l'ordre disabled → unsupported → ios-install → denied → reactivate → inactive → active.
 */

const UA = {
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
  iphone164: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1',
  iphone163: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1',
  iphone17: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
};

const KEY = 'BPx-cle-publique';

/** Ordinateur compatible, autorisation pas encore demandée, aucun abonnement. */
function env(overrides: Partial<PushEnvironment> = {}): PushEnvironment {
  return {
    pushEnabled: true,
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    permission: 'default',
    userAgent: UA.desktop,
    platform: 'Win32',
    maxTouchPoints: 0,
    standalone: false,
    subscriptionKey: null,
    serverKey: KEY,
    ...overrides,
  };
}

describe('pushSupportState', () => {
  it('désactivé par l’établissement passe avant tout', () => {
    expect(pushSupportState(env({ pushEnabled: false, hasPushManager: false, permission: 'denied' }))).toBe('disabled');
  });

  it.each([
    ['sans service worker', { hasServiceWorker: false }],
    ['sans PushManager', { hasPushManager: false }],
    ['sans Notification', { hasNotification: false }],
  ])('non pris en charge (%s)', (_label, overrides) => {
    expect(pushSupportState(env(overrides))).toBe('unsupported');
  });

  it('iPhone sous iOS 16.3 : non pris en charge, même depuis l’écran d’accueil', () => {
    expect(pushSupportState(env({ userAgent: UA.iphone163, platform: 'iPhone', maxTouchPoints: 5, hasPushManager: false }))).toBe('unsupported');
    expect(pushSupportState(env({ userAgent: UA.iphone163, platform: 'iPhone', maxTouchPoints: 5, standalone: true }))).toBe('unsupported');
  });

  it.each([
    ['iPhone iOS 16.4', { userAgent: UA.iphone164, platform: 'iPhone' }],
    ['iPhone iOS 17.5', { userAgent: UA.iphone17, platform: 'iPhone' }],
    ['iPad en mode ordinateur (MacIntel + écran tactile)', { userAgent: UA.ipadDesktopMode, platform: 'MacIntel' }],
  ])('%s hors écran d’accueil : instructions d’installation', (_label, overrides) => {
    // Safari hors écran d'accueil n'expose pas PushManager.
    expect(pushSupportState(env({ ...overrides, maxTouchPoints: 5, hasPushManager: false }))).toBe('ios-install');
    expect(pushSupportState(env({ ...overrides, maxTouchPoints: 5 }))).toBe('ios-install');
  });

  it('iPhone depuis l’écran d’accueil : activable', () => {
    expect(pushSupportState(env({ userAgent: UA.iphone17, platform: 'iPhone', maxTouchPoints: 5, standalone: true }))).toBe('inactive');
  });

  it('Mac sans écran tactile n’est pas un iPad : pas d’installation exigée', () => {
    expect(pushSupportState(env({ userAgent: UA.macSafari, platform: 'MacIntel', maxTouchPoints: 0 }))).toBe('inactive');
  });

  it('Android hors écran d’accueil : activable sans installation', () => {
    expect(pushSupportState(env({ userAgent: UA.android, platform: 'Linux armv8l', maxTouchPoints: 5 }))).toBe('inactive');
  });

  it('autorisation refusée', () => {
    expect(pushSupportState(env({ permission: 'denied', subscriptionKey: KEY }))).toBe('denied');
  });

  it('abonnement avec une autre clé : à réactiver', () => {
    expect(pushSupportState(env({ permission: 'granted', subscriptionKey: 'ancienne-cle' }))).toBe('reactivate');
  });

  it('autorisé sans abonnement : inactif', () => {
    expect(pushSupportState(env({ permission: 'granted' }))).toBe('inactive');
  });

  it('autorisé avec un abonnement à la bonne clé : actif', () => {
    expect(pushSupportState(env({ permission: 'granted', subscriptionKey: KEY }))).toBe('active');
  });
});
