import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, loadErrorMessage, serverNow, resetClockOffset } from '../../src/api/client';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetClockOffset();
  });

  it('envoie les cookies de même origine et sérialise le corps JSON', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/auth/login', { method: 'POST', body: { username: 'a' } })).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/auth/login');
    expect(init.credentials).toBe('same-origin');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ username: 'a' }));
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('renvoie undefined pour une réponse 204', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await expect(apiFetch('/api/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('transforme le format d’erreur de l’API en ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(422, { error: { code: 'REASON_REQUIRED', message: 'Un motif est obligatoire.', details: { a: 1 } } }),
      ),
    );
    const error = await apiFetch('/api/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: 'REASON_REQUIRED', message: 'Un motif est obligatoire.', details: { a: 1 } });
  });

  it('produit une erreur lisible si la réponse d’erreur n’est pas au format attendu', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })));
    const error = (await apiFetch('/api/x').catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(502);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.message).toBe('Une erreur inattendue est survenue. Réessayez plus tard.');
  });

  it('signale une coupure réseau avec le code NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const error = (await apiFetch('/api/x').catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(error.message).toBe('Connexion impossible. Vérifiez votre connexion internet puis réessayez.');
  });

  it('mesure le décalage d’horloge avec X-Server-Time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T10:00:00.000Z'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, {}, { 'X-Server-Time': '2026-10-12T10:00:30.000Z' })),
    );
    expect(serverNow().toISOString()).toBe('2026-10-12T10:00:00.000Z');
    await apiFetch('/api/auth/me');
    expect(serverNow().toISOString()).toBe('2026-10-12T10:00:30.000Z');
  });
});

describe('loadErrorMessage', () => {
  it('indique la référence d’une erreur serveur, sans détail technique', () => {
    const error = new ApiError(500, 'INTERNAL_ERROR', 'Une erreur inattendue est survenue.', { reference: 'a1b2c3d4' });
    const message = loadErrorMessage(error, 'le suivi');
    expect(message).toContain('Le serveur n’a pas pu charger le suivi');
    expect(message).toContain('a1b2c3d4');
  });

  it('reste utile sans référence', () => {
    expect(loadErrorMessage(new ApiError(502, 'INTERNAL_ERROR', 'x'), 'le suivi')).toContain('Réessayez dans quelques instants');
  });

  it('distingue la connexion, les droits et une requête invalide', () => {
    expect(loadErrorMessage(new ApiError(0, 'NETWORK_ERROR', 'x'), 'le suivi')).toMatch(/connexion/i);
    expect(loadErrorMessage(new ApiError(403, 'FORBIDDEN', 'x'), 'le suivi')).toMatch(/pas accès/);
    expect(loadErrorMessage(new ApiError(400, 'VALIDATION_ERROR', 'x'), 'le suivi', 'Réinitialisez les filtres.')).toContain('Réinitialisez les filtres.');
  });

  it('retombe sur un message générique pour une erreur inconnue', () => {
    expect(loadErrorMessage(new Error('boom'), 'le suivi')).toBe('Impossible de charger le suivi. Réessayez dans quelques instants.');
  });
});
