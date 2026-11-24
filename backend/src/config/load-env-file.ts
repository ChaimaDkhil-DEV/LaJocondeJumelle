import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const BACKEND_DIR = join(__dirname, '..', '..');

/**
 * Charge backend/.env (développement et tests) sans écraser les variables déjà définies.
 * En production, la configuration vient uniquement de l'environnement du conteneur (voir aussi
 * assertNoEnvFileInProduction).
 * (Affectation explicite de process.env : fonctionne aussi dans l'environnement isolé de Jest.)
 */
export function loadEnvFile(dir = BACKEND_DIR): void {
  if (process.env.NODE_ENV === 'production') return;
  const file = join(dir, '.env');
  if (!existsSync(file)) return;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * Refuse de démarrer en production si backend/.env existe. @prisma/client charge ce fichier dès son import, quel que
 * soit NODE_ENV : une variable oubliée prendrait en silence sa valeur de développement. L'image Docker n'en contient
 * pas (.dockerignore).
 */
export function assertNoEnvFileInProduction(dir = BACKEND_DIR): void {
  if (process.env.NODE_ENV !== 'production') return;
  const file = join(dir, '.env');
  if (existsSync(file)) {
    throw new Error(`Démarrage refusé en production : supprimez ${file} (réglages de développement, chargés par Prisma).`);
  }
}
