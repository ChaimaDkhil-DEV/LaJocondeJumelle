import { UserRateLimiter } from '../../src/common/upload-rate-limit.guard';

describe('UserRateLimiter', () => {
  it('refuse au-delà de la limite dans la fenêtre, par utilisateur, puis réaccepte', () => {
    let now = 0;
    const limiter = new UserRateLimiter(2, 1000, () => now);
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(false);
    expect(limiter.tryConsume('b')).toBe(true);
    now = 999;
    expect(limiter.tryConsume('a')).toBe(false);
    now = 1000;
    expect(limiter.tryConsume('a')).toBe(true);
  });

  it('un refus ne consomme rien', () => {
    let now = 0;
    const limiter = new UserRateLimiter(1, 1000, () => now);
    expect(limiter.tryConsume('a')).toBe(true);
    now = 500;
    expect(limiter.tryConsume('a')).toBe(false);
    now = 1000; // l'appel accepté à 0 expire ; le refus de 500 n'a pas prolongé la fenêtre
    expect(limiter.tryConsume('a')).toBe(true);
  });
});
