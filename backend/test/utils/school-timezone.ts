/**
 * Fuseau de l'école pour les suites qui créent des créneaux « du jour » à partir de maintenant :
 * un fuseau à décalage fixe où il est entre 10 h et 14 h au moment de l'exécution. Ces créneaux ne
 * passent ainsi jamais minuit, quelle que soit l'heure du lancement (CI le soir : constat sur la
 * PR #18). À appeler dans `beforeAll` avant `createTestApp()`, et `restore()` dans `afterAll`.
 */
export function useMiddayTimezone(now = new Date()): { tz: string; restore: () => void } {
  const previous = process.env.SCHOOL_TIMEZONE;
  // Décalage tel que l'heure locale soit ≈ 12 h ; Etc/GMT-N = UTC+N (signe inversé), de -12 à +11.
  const offset = 12 - now.getUTCHours();
  const tz = offset === 0 ? 'Etc/GMT' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
  process.env.SCHOOL_TIMEZONE = tz;
  return {
    tz,
    restore: () => {
      if (previous === undefined) delete process.env.SCHOOL_TIMEZONE;
      else process.env.SCHOOL_TIMEZONE = previous;
    },
  };
}
