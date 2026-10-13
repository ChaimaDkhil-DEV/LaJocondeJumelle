import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFile } from '../../src/config/load-env-file';
import { startTestDatabase, type TestDatabase } from './embedded-db';

declare global {
  var __TEST_DB__: TestDatabase | undefined;
}

const TEST_DB_PORT = Number(process.env.TEST_DB_PORT ?? 55433);

export default async function globalSetup(): Promise<void> {
  const db = await startTestDatabase(TEST_DB_PORT);
  globalThis.__TEST_DB__ = db;
  // Les workers Jest héritent de ces variables d'environnement.
  process.env.DATABASE_URL = db.url;
  process.env.DATABASE_URL_TEST = db.url;
  process.env.SESSION_SECRET ??= 'test-session-secret-0123456789abcdef0123456789';
  process.env.APP_ORIGIN ??= 'http://localhost:5173';
  process.env.FILES_DIR ??= join(tmpdir(), 'ljj-files-test');
  // Valeurs explicites : le client Prisma charge backend/.env (développement) pour les variables absentes.
  process.env.COOKIE_SECURE = 'true';
  process.env.TRUST_PROXY = 'loopback';
  // Les jobs planifiés sont exécutés explicitement par les tests (runOnce), jamais en tâche de fond.
  process.env.JOBS_ENABLED = 'false';
  process.env.NODE_ENV = 'test';
  // Complète avec backend/.env (chemins ffmpeg/ffprobe) sans écraser les valeurs ci-dessus.
  loadEnvFile(join(__dirname, '..', '..'));
}
