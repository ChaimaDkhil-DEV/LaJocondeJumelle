import { PrismaClient } from '@prisma/client';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFile } from '../../src/config/load-env-file';
import { applyRuntimeRole } from '../../src/database/runtime-role';
import { startTestDatabase, type TestDatabase } from './embedded-db';

declare global {
  var __TEST_DB__: TestDatabase | undefined;
}

const TEST_DB_PORT = Number(process.env.TEST_DB_PORT ?? 55433);

/** Crée le rôle d'exécution sur la base de test (après les migrations) et renvoie son URL de connexion. */
async function createRuntimeRole(ownerUrl: string): Promise<string> {
  const role = 'ljj_runtime';
  const password = 'RuntimeTest0123456789abcdef0123456789';
  const owner = new PrismaClient({ datasourceUrl: ownerUrl });
  try {
    await applyRuntimeRole(owner, { role, password });
  } finally {
    await owner.$disconnect();
  }
  const url = new URL(ownerUrl);
  url.username = role;
  url.password = password;
  return url.toString();
}

export default async function globalSetup(): Promise<void> {
  const db = await startTestDatabase(TEST_DB_PORT);
  globalThis.__TEST_DB__ = db;
  // Les workers Jest héritent de ces variables d'environnement.
  process.env.DATABASE_URL = db.url;
  process.env.DATABASE_URL_TEST = db.url;
  // Audit de sécurité R02 : l'application des tests tourne avec le rôle d'exécution, comme en production
  // (createTestApp) ; les tests gardent le compte propriétaire pour préparer et vider la base.
  process.env.RUNTIME_DATABASE_URL_TEST = await createRuntimeRole(db.url);
  process.env.SESSION_SECRET ??= 'test-session-secret-0123456789abcdef0123456789';
  process.env.APP_ORIGIN ??= 'http://localhost:5173';
  process.env.FILES_DIR ??= join(tmpdir(), 'ljj-files-test');
  // Valeurs explicites : le client Prisma charge backend/.env (développement) pour les variables absentes.
  process.env.COOKIE_SECURE = 'true';
  process.env.TRUST_PROXY = 'loopback';
  // Les jobs planifiés sont exécutés explicitement par les tests (runOnce), jamais en tâche de fond.
  process.env.JOBS_ENABLED = 'false';
  // L'assistance est désactivée par défaut, quel que soit le backend/.env local (rules, whisper...).
  process.env.ASSIST_SUGGESTION_PROVIDER = 'disabled';
  process.env.ASSIST_TRANSCRIPTION_PROVIDER = 'disabled';
  process.env.NODE_ENV = 'test';
  // Complète avec backend/.env (chemins ffmpeg/ffprobe) sans écraser les valeurs ci-dessus.
  loadEnvFile(join(__dirname, '..', '..'));
}
