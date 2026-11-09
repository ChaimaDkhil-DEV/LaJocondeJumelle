/**
 * État du push sur l'appareil courant (spec 014, D2, FR-002, FR-003, FR-013, research R12), évalué
 * dans l'ordre : désactivé par l'établissement, non pris en charge, installation requise (iPhone/iPad),
 * refusé, à réactiver (clé changée), inactif, actif.
 */
export type PushSupportState = 'disabled' | 'unsupported' | 'ios-install' | 'denied' | 'reactivate' | 'inactive' | 'active';

export interface PushEnvironment {
  /** Clés configurées par l'établissement (GET /api/push/config). */
  pushEnabled: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  permission: NotificationPermission;
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** Application ouverte depuis l'écran d'accueil (mode « standalone »). */
  standalone: boolean;
  /** Clé publique de l'abonnement existant du navigateur (base64url), ou null. */
  subscriptionKey: string | null;
  /** Clé publique de l'établissement (base64url), ou null. */
  serverKey: string | null;
}

/** iPhone, iPod, iPad, y compris l'iPad récent qui se présente comme un Mac (MacIntel + écran tactile). */
export function isAppleMobile(env: Pick<PushEnvironment, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean {
  return /iPhone|iPad|iPod/.test(env.userAgent) || (env.platform === 'MacIntel' && env.maxTouchPoints > 1);
}

/** Version d'iOS/iPadOS lue dans l'agent utilisateur (« OS 16_4 »), ou null si elle n'y figure pas. */
function appleOsVersion(userAgent: string): [number, number] | null {
  const match = /(?:iPhone|iPad|iPod).*? OS (\d+)_(\d+)/.exec(userAgent);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

/** iOS/iPadOS 16.4 au moins : version minimale du push pour les applications de l'écran d'accueil. */
function supportsWebPush(version: [number, number] | null): boolean {
  if (!version) return true;
  const [major, minor] = version;
  return major > 16 || (major === 16 && minor >= 4);
}

export function pushSupportState(env: PushEnvironment): PushSupportState {
  if (!env.pushEnabled) return 'disabled';
  if (isAppleMobile(env)) {
    if (!supportsWebPush(appleOsVersion(env.userAgent))) return 'unsupported';
    if (!env.standalone) return 'ios-install';
  }
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return 'unsupported';
  if (env.permission === 'denied') return 'denied';
  if (env.subscriptionKey && env.serverKey && env.subscriptionKey !== env.serverKey) return 'reactivate';
  if (env.permission === 'granted' && env.subscriptionKey && env.subscriptionKey === env.serverKey) return 'active';
  return 'inactive';
}

/** Clé binaire (ArrayBuffer) en base64url sans remplissage, comme la clé publique du serveur. */
export function bufferToBase64url(buffer: ArrayBuffer | null | undefined): string | null {
  if (!buffer) return null;
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Clé base64url en octets, pour pushManager.subscribe({ applicationServerKey }). */
export function base64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
