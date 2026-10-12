import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Charge backend/.env (développement et tests) sans écraser les variables déjà définies.
 * En production, la configuration vient uniquement de l'environnement du conteneur.
 * (Affectation explicite de process.env : fonctionne aussi dans l'environnement isolé de Jest.)
 */
export function loadEnvFile(dir = join(__dirname, '..', '..')): void {
  if (process.env.NODE_ENV === 'production') return;
  const file = join(dir, '.env');
  if (!existsSync(file)) return;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
