/**
 * Horloge de test : un instant fixe, avancé explicitement. Les services et les jobs reçoivent
 * `clock.now()` en paramètre (`runOnce(now?: Date)`), comme les appels `runOnce()` existants.
 */
export interface TestClock {
  /** Instant courant (nouvelle instance à chaque appel). */
  now(): Date;
  /** Replace l'horloge sur un instant ISO 8601. */
  set(iso: string): Date;
  /** Avance de `minutes` (négatif : recule) et renvoie le nouvel instant. */
  advanceMinutes(minutes: number): Date;
}

export function fixedNow(iso: string): TestClock {
  let current = parseInstant(iso);
  return {
    now: () => new Date(current),
    set: (next) => {
      current = parseInstant(next);
      return new Date(current);
    },
    advanceMinutes: (minutes) => {
      current += minutes * 60_000;
      return new Date(current);
    },
  };
}

function parseInstant(iso: string): number {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) throw new Error(`Instant invalide pour l'horloge de test : ${iso}`);
  return time;
}
