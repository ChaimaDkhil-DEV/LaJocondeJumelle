import type { PushSendResult } from '../web-push.sender';

/**
 * Nouvelles tentatives d'un push (spec 014, NC-4, research R7) : au plus 3 tentatives (0 s, +5 s,
 * +30 s) pour les erreurs temporaires, jamais au-delà de la validité de 30 minutes. 404/410 :
 * abonnement disparu, à supprimer. Toute autre erreur définitive : abandon.
 */
export const PUSH_MAX_ATTEMPTS = 3;
const VALIDITY_MS = 1_800_000;
const DELAYS_MS = [5_000, 30_000];

export type PushAttemptDecision = 'done' | 'delete' | 'drop' | number;

function isTemporary(statusCode: number | null): boolean {
  return statusCode === null || statusCode === 429 || statusCode >= 500;
}

/**
 * Suite à donner à la tentative `attempt` (de 1 à 3) : `elapsedMs` depuis la première tentative.
 * Un nombre est le délai avant la tentative suivante.
 */
export function nextAttemptDelayMs(attempt: number, result: PushSendResult, elapsedMs: number): PushAttemptDecision {
  const { statusCode } = result;
  if (statusCode !== null && statusCode >= 200 && statusCode < 300) return 'done';
  if (statusCode === 404 || statusCode === 410) return 'delete';
  if (!isTemporary(statusCode) || attempt >= PUSH_MAX_ATTEMPTS) return 'drop';

  const planned = DELAYS_MS[attempt - 1];
  const requested = (result.retryAfterSeconds ?? 0) * 1000;
  const delay = Math.max(planned, requested);
  return elapsedMs + delay < VALIDITY_MS ? delay : 'drop';
}
