import type { CommunicationDeliveryStatus } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Protocole avec n8n (015, FR-009, FR-010). Règles pures : signature des événements envoyés,
 * authentification des appels de n8n, reprises limitées, statuts de livraison idempotents.
 */

/** Au-delà, l'événement passe à FAILED : il reste visible et peut être relancé à la main. */
export const MAX_OUTBOX_ATTEMPTS = 8;
const FIRST_RETRY_MS = 30_000;
const MAX_RETRY_MS = 3_600_000;

/** Délai avant la tentative suivante : 30 s, 1 min, 2 min… plafonné à 1 h. */
export function retryDelayMs(attempts: number): number {
  return Math.min(FIRST_RETRY_MS * 2 ** Math.max(0, attempts - 1), MAX_RETRY_MS);
}

/**
 * Signature d'un événement envoyé à n8n : HMAC-SHA256 de « horodatage.corps » avec le secret partagé.
 * n8n la recalcule, refuse un horodatage trop ancien et ignore un identifiant d'événement déjà traité.
 */
export function signBody(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

/** Jeton porteur des appels de n8n, comparé en temps constant au secret partagé. */
export function verifyBearer(header: string | undefined, secret: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const ATTEMPTS: readonly CommunicationDeliveryStatus[] = ['PROCESSING', 'RETRYING'];

/**
 * Statut de livraison après un compte rendu de n8n. Un compte rendu répété ne change rien ; une
 * livraison confirmée (DELIVERED) est définitive ; une tentative (PROCESSING, RETRYING) est comptée.
 */
export function nextDeliveryStatus(
  current: CommunicationDeliveryStatus,
  incoming: CommunicationDeliveryStatus,
): { status: CommunicationDeliveryStatus; changed: boolean; attempt: boolean } {
  if (current === incoming || current === 'DELIVERED')
    return { status: current, changed: false, attempt: false };
  return { status: incoming, changed: true, attempt: ATTEMPTS.includes(incoming) };
}
