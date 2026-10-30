/**
 * Pile jetable de la démo : PostgreSQL embarqué (migrations appliquées), API Nest et frontend Vite sur
 * des ports propres à la démo. La base est remise à zéro et réensemencée avant chaque scénario
 * (comptes et données fictifs) ; elle est détruite à l'arrêt.
 */
import { PrismaClient } from '@prisma/client';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSeed } from '../../backend/prisma/seed';
import { SETTING_DEFAULTS } from '../../backend/src/settings/settings.service';
import { startTestDatabase, type TestDatabase } from '../../backend/test/utils/embedded-db';
import { resetDatabase } from '../../backend/test/utils/test-db';
import { session } from './api';
import { BASE_URL, DEMO_PASSWORD, PORTS, VOICE_SENTENCE, type AssistMode } from './config';
import { assertLocalDatabase } from './env';


const ROOT = join(__dirname, '..', '..');
const BACKEND_DIR = join(ROOT, 'backend');

export interface DemoStack {
  databaseUrl: string;
  prisma: PrismaClient;
  /** Base remise à zéro, seed fictif, réglages par défaut réappliqués par l'API (vide son cache). */
  reset: () => Promise<void>;
  stop: () => Promise<void>;
}

async function waitFor(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Pas encore prêt.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Délai dépassé en attendant ${url}`);
}

/** Arrête un processus et ses enfants (sous Windows, kill() n'atteint pas les sous-processus). */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

export interface DemoStackOptions {
  /**
   * Assistance de la création vocale : Whisper réel (URL de backend/.env) et propositions par règles,
   * fournisseurs locaux de démonstration, ou aucune (défaut).
   */
  assist?: AssistMode;
  whisperUrl?: string;
}

function assistEnv(options: DemoStackOptions): Record<string, string> {
  if (options.assist === 'whisper' && options.whisperUrl) {
    return { ASSIST_TRANSCRIPTION_PROVIDER: 'whisper', ASSIST_WHISPER_URL: options.whisperUrl, ASSIST_SUGGESTION_PROVIDER: 'rules', ASSIST_RATE_LIMIT: '1000' };
  }
  if (options.assist === 'demo') {
    return { ASSIST_TRANSCRIPTION_PROVIDER: 'demo', ASSIST_DEMO_TRANSCRIPT: VOICE_SENTENCE, ASSIST_SUGGESTION_PROVIDER: 'demo', ASSIST_RATE_LIMIT: '1000' };
  }
  return { ASSIST_SUGGESTION_PROVIDER: 'disabled', ASSIST_TRANSCRIPTION_PROVIDER: 'disabled' };
}

export async function startDemoStack(log: (message: string) => void, options: DemoStackOptions = {}): Promise<DemoStack> {
  log(`Base PostgreSQL jetable (port ${PORTS.db}) et migrations…`);
  const db: TestDatabase = await startTestDatabase(PORTS.db);
  assertLocalDatabase(db.url);
  const prisma = new PrismaClient({ datasources: { db: { url: db.url } } });
  const filesDir = mkdtempSync(join(tmpdir(), 'joconde-demo-files-'));
  const children: ChildProcess[] = [];

  const stop = async (): Promise<void> => {
    for (const child of children.reverse()) killTree(child);
    await prisma.$disconnect();
    await db.stop();
    rmSync(filesDir, { recursive: true, force: true });
  };

  const seed = () => runSeed(prisma, { e2ePassword: DEMO_PASSWORD, log: () => undefined });

  try {
    await seed();
    log(`API (port ${PORTS.api})…`);
    const nestCli = require.resolve('@nestjs/cli/bin/nest.js', { paths: [BACKEND_DIR] });
    children.push(
      spawn(process.execPath, [nestCli, 'start'], {
        cwd: BACKEND_DIR,
        // DEMO_API_LOG=<fichier> : journal de l'API de démo, pour diagnostiquer un scénario.
        stdio: process.env.DEMO_API_LOG ? ['ignore', openSync(process.env.DEMO_API_LOG, 'w'), 'pipe'] : 'ignore',
        env: {
          ...process.env,
          PORT: String(PORTS.api),
          DATABASE_URL: db.url,
          SESSION_SECRET: 'demo-session-secret-0123456789abcdef0123456789',
          FILES_DIR: filesDir,
          APP_ORIGIN: BASE_URL,
          COOKIE_SECURE: 'false',
          LOGIN_RATE_LIMIT: '1000',
          NODE_ENV: 'test',
          ...assistEnv(options),
        },
      }),
    );

    log(`Frontend (port ${PORTS.web})…`);
    // Vite n'expose pas son exécutable dans « exports » : on le cherche dans les node_modules.
    const viteCli = [join(ROOT, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js'), join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')].find((p) =>
      existsSync(p),
    );
    if (!viteCli) throw new Error('Vite introuvable : installez les dépendances (npm ci).');
    children.push(
      spawn(process.execPath, [viteCli, '--port', String(PORTS.web), '--strictPort'], {
        cwd: join(ROOT, 'frontend'),
        stdio: 'ignore',
        env: { ...process.env, API_URL: `http://localhost:${PORTS.api}` },
      }),
    );

    await waitFor(`http://localhost:${PORTS.api}/api/health`, 180_000);
    await waitFor(BASE_URL, 120_000);
  } catch (error) {
    await stop();
    throw error;
  }

  const reset = async (): Promise<void> => {
    await resetDatabase(prisma);
    await seed();
    // L'API garde les réglages en mémoire : on les réécrit par l'API pour vider ce cache.
    const admin = await session('superadmin');
    await admin('/api/admin/settings', SETTING_DEFAULTS, 'PUT');
  };

  return { databaseUrl: db.url, prisma, reset, stop };
}
