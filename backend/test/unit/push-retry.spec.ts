import { nextAttemptDelayMs, PUSH_MAX_ATTEMPTS } from '../../src/push/domain/push-retry';

/**
 * 014, T016 (NC-4, FR-017, research R7) : au plus 3 tentatives (0 s, +5 s, +30 s) pour les erreurs
 * temporaires, jamais au-delà de la validité de 30 min ; 404/410 suppriment l'abonnement ; les autres
 * erreurs définitives abandonnent.
 */

const TTL_MS = 1_800_000;

describe('nextAttemptDelayMs', () => {
  it('3 tentatives au plus', () => {
    expect(PUSH_MAX_ATTEMPTS).toBe(3);
  });

  it.each([200, 201, 202, 204])('%i : envoi accepté', (statusCode) => {
    expect(nextAttemptDelayMs(1, { statusCode }, 0)).toBe('done');
  });

  it.each([404, 410])('%i : abonnement à supprimer, sans nouvelle tentative', (statusCode) => {
    expect(nextAttemptDelayMs(1, { statusCode }, 0)).toBe('delete');
    expect(nextAttemptDelayMs(2, { statusCode }, 6_000)).toBe('delete');
  });

  it.each([400, 401, 403, 413, 301])('%i : abandon définitif', (statusCode) => {
    expect(nextAttemptDelayMs(1, { statusCode }, 0)).toBe('drop');
  });

  it.each([null, 429, 500, 502, 503])('%s : 5 s puis 30 s, puis abandon', (statusCode) => {
    expect(nextAttemptDelayMs(1, { statusCode }, 0)).toBe(5_000);
    expect(nextAttemptDelayMs(2, { statusCode }, 5_100)).toBe(30_000);
    expect(nextAttemptDelayMs(3, { statusCode }, 35_200)).toBe('drop');
  });

  it('respecte un retry-after plus long s’il tient dans la validité', () => {
    expect(nextAttemptDelayMs(1, { statusCode: 429, retryAfterSeconds: 60 }, 0)).toBe(60_000);
    expect(nextAttemptDelayMs(1, { statusCode: 503, retryAfterSeconds: 2 }, 0)).toBe(5_000);
  });

  it('abandonne si le retry-after dépasse la validité', () => {
    expect(nextAttemptDelayMs(1, { statusCode: 429, retryAfterSeconds: 3_600 }, 0)).toBe('drop');
  });

  it('ne programme jamais une tentative au-delà de la validité', () => {
    expect(nextAttemptDelayMs(1, { statusCode: 500 }, TTL_MS - 4_000)).toBe('drop');
    expect(nextAttemptDelayMs(2, { statusCode: 500 }, TTL_MS - 20_000)).toBe('drop');
    expect(nextAttemptDelayMs(1, { statusCode: 500 }, TTL_MS - 6_000)).toBe(5_000);
  });
});
