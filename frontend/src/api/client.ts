/**
 * Client HTTP de l'API (même origine, cookie de session).
 * Format d'erreur de l'API : { "error": { "code", "message", "details" } } (contracts/rest-api.md).
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const NETWORK_MESSAGE = 'Connexion impossible. Vérifiez votre connexion internet puis réessayez.';
const UNEXPECTED_MESSAGE = 'Une erreur inattendue est survenue. Réessayez plus tard.';

let clockOffsetMs = 0;

/** Heure du serveur estimée (heure locale corrigée du décalage mesuré via X-Server-Time). */
export function serverNow(): Date {
  return new Date(Date.now() + clockOffsetMs);
}

export function resetClockOffset(): void {
  clockOffsetMs = 0;
}

function recordServerTime(response: Response): void {
  const header = response.headers.get('X-Server-Time');
  if (!header) return;
  const serverTime = Date.parse(header);
  if (!Number.isNaN(serverTime)) clockOffsetMs = serverTime - Date.now();
}

export interface ApiRequestInit extends Omit<RequestInit, 'body'> {
  /** Corps JSON (sérialisé automatiquement) ou FormData (téléversement). */
  body?: unknown;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const payload = (await response.json()) as {
      error?: { code?: string; message?: string; details?: Record<string, unknown> };
    };
    if (payload.error?.code && payload.error.message) {
      return new ApiError(response.status, payload.error.code, payload.error.message, payload.error.details);
    }
  } catch {
    // Réponse non JSON (proxy, page d'erreur) : message générique ci-dessous.
  }
  return new ApiError(response.status, 'INTERNAL_ERROR', UNEXPECTED_MESSAGE);
}

export async function apiFetch<T = unknown>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let body: BodyInit | undefined;
  if (init.body instanceof FormData) {
    body = init.body;
  } else if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.body);
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, body, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_MESSAGE);
  }

  recordServerTime(response);
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Erreurs par champ renvoyées par l'API (VALIDATION_ERROR). */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return {};
  const fields = (error.details?.fields ?? []) as Array<{ field: string; messages: string[] }>;
  return Object.fromEntries(fields.map((f) => [f.field, f.messages[0] ?? 'Valeur invalide']));
}
