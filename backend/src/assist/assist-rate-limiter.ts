/** Fenêtre de la limite d'appels de l'assistance. */
export const ASSIST_RATE_WINDOW_MS = 5 * 60_000;

/**
 * Limite d'appels de l'assistance par utilisateur (spec 009, FR-014, research R7) : fenêtre
 * glissante en mémoire, partagée par la transcription et les propositions. L'API tourne en une
 * seule instance ; la clé est l'utilisateur (un établissement sort souvent par une seule adresse).
 */
export class AssistRateLimiter {
  private readonly calls = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** `true` si l'appel est accepté (et compté) ; un refus ne consomme rien. */
  tryConsume(userId: string): boolean {
    const now = this.now();
    const recent = (this.calls.get(userId) ?? []).filter((t) => now - t < ASSIST_RATE_WINDOW_MS);
    if (recent.length >= this.limit) {
      this.calls.set(userId, recent);
      return false;
    }
    recent.push(now);
    this.calls.set(userId, recent);
    return true;
  }
}
