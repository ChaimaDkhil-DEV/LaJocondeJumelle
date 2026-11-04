/**
 * Démonstration en ligne gratuite, sans compte ni carte : l'application tourne sur ce poste et un
 * Quick Tunnel Cloudflare la publie en HTTPS (https://xxxx.trycloudflare.com), ce qui permet
 * d'utiliser le micro sur téléphone et tablette. Le poste doit rester allumé ; l'adresse change à
 * chaque lancement. Usage : npm run -w backend demo:en-ligne   (Ctrl+C pour tout arrêter)
 *
 * Étapes : base locale (port 5433, démarrée si besoin), migrations, Whisper (Docker, si la
 * transcription est configurée), construction de l'API et de l'interface, tunnel, API avec
 * APP_ORIGIN = adresse du tunnel, `vite preview` (port 4173). Whisper reste démarré après Ctrl+C.
 */
import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import QRCode from 'qrcode';

const backendDir = join(__dirname, '..');
const rootDir = join(backendDir, '..');
const DB_PORT = 5433;
const API_PORT = 3002;
const PREVIEW_PORT = 4173;
const WHISPER_TIMEOUT_MS = 120_000;
const isWindows = process.platform === 'win32';

const children: ChildProcess[] = [];
let stopping = false;

function log(message: string): void {
  console.log(`[demo-en-ligne] ${message}`);
}

function fail(message: string): never {
  console.error(`[demo-en-ligne] ERREUR : ${message}`);
  stopAll();
  process.exit(1);
}

function stopAll(): void {
  stopping = true;
  for (const child of children) {
    if (child.pid === undefined || child.exitCode !== null) continue;
    // npm et les shells lancent des sous-processus : arrêter tout l'arbre.
    if (isWindows)
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
}

/** Commande bloquante ; `attempts` > 1 réessaie toutes les 3 s (base encore en démarrage). */
async function run(command: string, attempts = 1): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    log(`> ${command}`);
    if (spawnSync(command, { cwd: rootDir, stdio: 'inherit', shell: true }).status === 0) return;
    if (attempt < attempts) await new Promise((r) => setTimeout(r, 3000));
  }
  fail(`échec de « ${command} »`);
}

function start(
  name: string,
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; shell?: boolean } = {},
): ChildProcess {
  const spawnOptions: SpawnOptions = {
    cwd: options.cwd ?? rootDir,
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  };
  // Commande shell : une seule chaîne (des arguments séparés avec shell déclenchent DEP0190).
  const child = options.shell
    ? spawn([command, ...args].join(' '), { ...spawnOptions, shell: true })
    : spawn(command, args, spawnOptions);
  children.push(child);
  const prefix = (chunk: Buffer): void => {
    for (const line of chunk.toString().split(/\r?\n/))
      if (line.trim()) console.log(`[${name}] ${line}`);
  };
  child.stdout?.on('data', prefix);
  child.stderr?.on('data', prefix);
  child.on('exit', (code) => {
    if (!stopping) fail(`le processus « ${name} » s'est arrêté (code ${code})`);
  });
  return child;
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.setTimeout(1000);
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('timeout', () => (socket.destroy(), resolve(false)));
    socket.once('error', () => resolve(false));
  });
}

async function waitFor(
  what: string,
  check: () => Promise<boolean>,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  fail(`${what} ne répond pas après ${timeoutMs / 1000} s`);
}

async function whisperAnswers(url: string): Promise<boolean> {
  try {
    return (await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

/**
 * Démarre Whisper s'il est configuré dans backend/.env et ne répond pas. Un échec n'arrête pas la
 * démonstration : seule la transcription manque. Renvoie null si elle n'est pas configurée.
 */
async function startWhisper(): Promise<boolean | null> {
  const envFile = join(backendDir, '.env');
  const env = {
    ...(existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}),
    ...process.env,
  };
  if (env.ASSIST_TRANSCRIPTION_PROVIDER !== 'whisper') {
    log('transcription non configurée');
    return null;
  }
  const url = (env.ASSIST_WHISPER_URL ?? '').replace(/\/+$/, '');
  if (await whisperAnswers(url)) {
    log('Whisper répond déjà');
    return true;
  }
  const command = 'docker compose -f deploy/docker-compose.dev.yml --profile whisper up -d whisper';
  log(`> ${command}`);
  if (spawnSync(command, { cwd: rootDir, stdio: 'inherit', shell: true }).status !== 0) {
    console.warn('[demo-en-ligne] ATTENTION : Whisper non démarré. Ouvrez Docker Desktop, puis relancez.');
    return false;
  }
  const deadline = Date.now() + WHISPER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await whisperAnswers(url)) {
      log('Whisper répond');
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.warn(`[demo-en-ligne] ATTENTION : Whisper ne répond pas après ${WHISPER_TIMEOUT_MS / 1000} s.`);
  return false;
}

function findCloudflared(): string {
  const candidates = [
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
  ];
  const found = candidates.find((path) => existsSync(path));
  if (found) return found;
  const probe = spawnSync('cloudflared', ['--version'], { stdio: 'ignore', shell: true });
  if (probe.status === 0) return 'cloudflared';
  fail('cloudflared introuvable. Installez-le : winget install --id Cloudflare.cloudflared -e');
}

/** Lance le tunnel et renvoie son adresse publique (lue dans le journal de cloudflared). */
function startTunnel(binary: string): Promise<string> {
  return new Promise((resolve) => {
    const child = start('tunnel', binary, [
      'tunnel',
      '--no-autoupdate',
      '--url',
      `http://127.0.0.1:${PREVIEW_PORT}`,
    ]);
    const timer = setTimeout(() => fail('adresse du tunnel non reçue après 60 s'), 60_000);
    const onData = (chunk: Buffer): void => {
      const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(chunk.toString());
      if (!match) return;
      clearTimeout(timer);
      child.stderr?.off('data', onData);
      resolve(match[0]);
    };
    child.stderr?.on('data', onData);
  });
}

async function main(): Promise<void> {
  process.on('SIGINT', () => {
    log('arrêt...');
    stopAll();
    process.exit(0);
  });

  const cloudflared = findCloudflared();
  if (await portOpen(API_PORT))
    fail(`le port ${API_PORT} est déjà utilisé : arrêtez l'API (start.bat) avant la démonstration`);
  if (await portOpen(PREVIEW_PORT)) fail(`le port ${PREVIEW_PORT} est déjà utilisé`);

  log('1/6 base de données locale');
  if (await portOpen(DB_PORT)) log(`PostgreSQL répond déjà sur le port ${DB_PORT}`);
  else {
    start('postgres', 'npm', ['run', '-w', 'backend', 'db:dev'], {
      shell: true,
      env: { DEV_DB_PORT: String(DB_PORT) },
    });
    await waitFor('PostgreSQL', () => portOpen(DB_PORT), 60_000);
  }
  await run('npm run -w backend prisma:deploy', 5);

  log('2/6 transcription vocale');
  const whisper = await startWhisper();

  log("3/6 construction de l'API et de l'interface");
  await run('npm run -w backend build');
  await run('npm run -w frontend build');

  log('4/6 tunnel Cloudflare');
  const url = await startTunnel(cloudflared);
  log(`adresse publique : ${url}`);

  log('5/6 API (origine autorisée = adresse du tunnel)');
  start('api', process.execPath, ['dist/main.js'], {
    cwd: backendDir,
    env: { APP_ORIGIN: url, PORT: String(API_PORT), COOKIE_SECURE: 'true' },
  });
  await waitFor(
    "l'API",
    async () => {
      try {
        return (await fetch(`http://127.0.0.1:${API_PORT}/api/health`)).ok;
      } catch {
        return false;
      }
    },
    60_000,
  );

  log('6/6 interface (vite preview)');
  start(
    'web',
    'npm',
    [
      'run',
      '-w',
      'frontend',
      'preview',
      '--',
      '--port',
      String(PREVIEW_PORT),
      '--strictPort',
      '--host',
      '127.0.0.1',
    ],
    {
      shell: true,
      env: { API_URL: `http://localhost:${API_PORT}` },
    },
  );
  await waitFor("l'interface", () => portOpen(PREVIEW_PORT), 60_000);

  console.log(
    `\n  Application en ligne : ${url}\n  À scanner avec le téléphone ou la tablette :\n`,
  );
  console.log(await QRCode.toString(url, { type: 'terminal', small: true }));
  if (whisper === false) {
    console.log('  ATTENTION : transcription vocale indisponible (voir ci-dessus).');
  }
  console.log('  Ctrl+C pour tout arrêter.\n');
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
