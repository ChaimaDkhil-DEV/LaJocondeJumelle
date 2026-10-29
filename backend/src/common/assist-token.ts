import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Priority } from '@prisma/client';

/**
 * Jeton signé des propositions automatiques (spec 009, research R6) : renvoyé avec les
 * propositions, joint par le navigateur à l'envoi de la demande. Il prouve les valeurs proposées
 * sans conserver de proposition : un formulaire abandonné ne laisse aucune trace. Placé dans
 * `common` parce que `requests` le lit et que `assist` vient après `requests`.
 */
export interface AssistTokenPayload {
  title?: string;
  categoryId?: string;
  priority?: Priority;
  /** Destinataire proposé (création vocale assistée), absent des jetons antérieurs. */
  recipientId?: string;
  sources: Array<{ id: string; title: string }>;
}

const VERSION = 1;
const MAX_AGE_MS = 24 * 3600_000;
/** Tolérance d'horloge pour un jeton émis « dans le futur ». */
const CLOCK_SKEW_MS = 60_000;
const PRIORITIES: readonly string[] = ['NORMAL', 'MEDIUM', 'HIGH', 'URGENT'];

/** Clé propre à cet usage : un jeton de proposition ne peut servir de signature ailleurs. */
function keyOf(secret: string): Buffer {
  return createHmac('sha256', secret).update('assist-suggestion:v1').digest();
}

function sign(secret: string, body: string): Buffer {
  return createHmac('sha256', keyOf(secret)).update(body).digest();
}

export function signAssistToken(secret: string, userId: string, payload: AssistTokenPayload, now: Date): string {
  const body = Buffer.from(JSON.stringify({ v: VERSION, uid: userId, iat: now.getTime(), s: payload })).toString(
    'base64url',
  );
  return `${body}.${sign(secret, body).toString('base64url')}`;
}

function isPayload(value: unknown): value is AssistTokenPayload {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    (p.title === undefined || typeof p.title === 'string') &&
    (p.categoryId === undefined || typeof p.categoryId === 'string') &&
    (p.priority === undefined || (typeof p.priority === 'string' && PRIORITIES.includes(p.priority))) &&
    (p.recipientId === undefined || typeof p.recipientId === 'string') &&
    Array.isArray(p.sources) &&
    p.sources.every(
      (s: unknown) =>
        !!s && typeof (s as { id?: unknown }).id === 'string' && typeof (s as { title?: unknown }).title === 'string',
    )
  );
}

/** Valeurs proposées si le jeton est intact, de cet utilisateur et récent ; sinon null. */
export function readAssistToken(
  secret: string,
  token: string | undefined,
  userId: string,
  now: Date,
): AssistTokenPayload | null {
  const parts = token?.split('.');
  if (!parts || parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, signature] = parts;
  const expected = sign(secret, body);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let decoded: { v?: unknown; uid?: unknown; iat?: unknown; s?: unknown };
  try {
    decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as typeof decoded;
  } catch {
    return null;
  }
  if (decoded.v !== VERSION || decoded.uid !== userId || typeof decoded.iat !== 'number') return null;
  const age = now.getTime() - decoded.iat;
  if (age > MAX_AGE_MS || age < -CLOCK_SKEW_MS) return null;
  return isPayload(decoded.s) ? decoded.s : null;
}
