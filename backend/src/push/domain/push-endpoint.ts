/**
 * Validation d'un abonnement push envoyé par le navigateur (spec 014, NFR-001, research R9). Le serveur
 * n'enverra qu'à des services de push reconnus, en HTTPS sur le port par défaut, sans identifiants dans
 * l'adresse : il ne peut donc pas servir à joindre une adresse interne (SSRF). Liste fixe : toute autre
 * adresse est refusée dès l'abonnement.
 */

/** Hôtes exacts des services de push des navigateurs (Chrome et dérivés, Firefox, Safari). */
const ALLOWED_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']);
/** Sous-domaines du service de push de Windows (Edge). */
const ALLOWED_SUFFIXES = ['.notify.windows.com'];
export const MAX_ENDPOINT_LENGTH = 2048;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export type PushSubscriptionField = 'endpoint' | 'keys';

function bytes(value: unknown): Buffer | null {
  return typeof value === 'string' && BASE64URL.test(value) ? Buffer.from(value, 'base64url') : null;
}

function isAllowedEndpoint(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ENDPOINT_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') return false;
  const host = url.hostname;
  return ALLOWED_HOSTS.has(host) || ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length);
}

function areValidKeys(keys: unknown): boolean {
  if (!keys || typeof keys !== 'object') return false;
  const { p256dh, auth } = keys as Record<string, unknown>;
  const publicKey = bytes(p256dh);
  const secret = bytes(auth);
  return publicKey !== null && publicKey.length === 65 && publicKey[0] === 0x04 && secret !== null && secret.length === 16;
}

/** Champs invalides de l'abonnement (liste vide : abonnement acceptable). */
export function validatePushSubscription(input: { endpoint?: unknown; keys?: unknown }): PushSubscriptionField[] {
  const invalid: PushSubscriptionField[] = [];
  if (!isAllowedEndpoint(input.endpoint)) invalid.push('endpoint');
  if (!areValidKeys(input.keys)) invalid.push('keys');
  return invalid;
}
