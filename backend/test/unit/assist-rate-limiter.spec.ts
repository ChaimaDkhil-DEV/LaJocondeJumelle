import { AssistRateLimiter } from '../../src/assist/assist-rate-limiter';

/** 009, FR-014, research R7 : fenêtre glissante de 5 minutes par utilisateur. */
describe('AssistRateLimiter', () => {
  const WINDOW = 5 * 60_000;

  it('accepte `limit` appels par fenêtre, refuse le suivant', () => {
    let now = 0;
    const limiter = new AssistRateLimiter(3, () => now);
    expect([limiter.tryConsume('u1'), limiter.tryConsume('u1'), limiter.tryConsume('u1')]).toEqual([true, true, true]);
    now = WINDOW - 1;
    expect(limiter.tryConsume('u1')).toBe(false);
  });

  it('accepte de nouveau quand les appels les plus anciens sortent de la fenêtre', () => {
    let now = 0;
    const limiter = new AssistRateLimiter(2, () => now);
    limiter.tryConsume('u1');
    now = 1000;
    limiter.tryConsume('u1');
    now = WINDOW;
    expect(limiter.tryConsume('u1')).toBe(true);
    expect(limiter.tryConsume('u1')).toBe(false);
    now = WINDOW + 1000;
    expect(limiter.tryConsume('u1')).toBe(true);
  });

  it('compte chaque utilisateur à part ; un refus ne consomme rien', () => {
    let now = 0;
    const limiter = new AssistRateLimiter(1, () => now);
    expect(limiter.tryConsume('u1')).toBe(true);
    expect(limiter.tryConsume('u1')).toBe(false);
    expect(limiter.tryConsume('u2')).toBe(true);
    now = WINDOW;
    expect(limiter.tryConsume('u1')).toBe(true);
  });
});
