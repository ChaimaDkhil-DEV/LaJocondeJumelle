/**
 * Garde-fous de la démo : elle ne s'exécute que dans un environnement déclaré explicitement « dev »
 * ou « test », et uniquement sur sa propre base embarquée locale. Jamais sur une base de production.
 */
const ALLOWED: Record<string, 'dev' | 'test'> = { dev: 'dev', development: 'dev', test: 'test' };

/** Environnement lu dans --env=… ou NODE_ENV ; refus s'il est absent ou autre que dev/test. */
export function assertDemoEnvironment(argv: readonly string[]): 'dev' | 'test' {
  const flag = argv.find((a) => a.startsWith('--env='))?.slice('--env='.length);
  const declared = (flag ?? process.env.NODE_ENV ?? '').trim().toLowerCase();
  const env = ALLOWED[declared];
  if (!env) {
    throw new Error(
      `Environnement « ${declared || 'non défini'} » refusé : la démo ne s'exécute qu'en dev ou test. ` +
        'Indiquez --env=test (ou NODE_ENV=test).',
    );
  }
  return env;
}

/** La base visée doit être locale (localhost) : protection contre toute URL de production. */
export function assertLocalDatabase(url: string): void {
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`Base « ${host} » refusée : la démo n'utilise que sa base embarquée locale.`);
  }
}
