/**
 * Garde-fou des scripts de données fictives lancés en ligne de commande (`prisma:seed`, `seed:volume`, et
 * `db:seed:demo` via `reset.ts`). Ces scripts créent des comptes aux mots de passe provisoires ou connus, dont un
 * super administrateur : sur la base d'un vrai établissement, ce serait une porte ouverte et des fausses données
 * mêlées aux vraies. Ils ne s'exécutent donc que contre une base de cette machine, hors production.
 *
 * Ce contrôle protège les points d'entrée en ligne de commande seulement : `runSeed` et `seedVolume` restent
 * appelables directement (tests, e2e, démonstration en ligne), qui fournissent leur propre base embarquée.
 */
import { loadEnvFile } from '../../src/config/load-env-file';

export const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Refuse toute base qui n'est pas sur cette machine (n'importe quel port et nom de base : les bases embarquées de
 * développement et de test n'ont pas les mêmes), et tout lancement avec NODE_ENV=production. Sans URL lisible, on
 * refuse aussi : dans le doute, rien n'est écrit.
 */
export function assertLocalDatabase(url: string | undefined, command: string, env: NodeJS.ProcessEnv = process.env): void {
  const refuse = (reason: string): never => {
    throw new Error(
      `${command} refusé : ${reason} Ce script crée des comptes et des données fictives ; il ne tourne que sur une base locale de développement. ` +
        'En production, le premier compte se crée avec « node dist/cli/bootstrap.js », et les vraies données avec l’import CSV.',
    );
  };
  if (env.NODE_ENV === 'production') return refuse('NODE_ENV=production.');
  if (!url) return refuse('DATABASE_URL est absente.');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return refuse('DATABASE_URL est illisible.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return refuse('DATABASE_URL n’est pas une URL PostgreSQL.');
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    return refuse(`la base ciblée (« ${parsed.hostname || 'serveur distant'} ») n’est pas sur cette machine.`);
  }
}

/** Point d'entrée en ligne de commande : charge backend/.env comme Prisma, puis contrôle la cible. Lève si elle est refusée. */
export function guardSeedCommand(command: string): void {
  loadEnvFile();
  assertLocalDatabase(process.env.DATABASE_URL, command);
}
