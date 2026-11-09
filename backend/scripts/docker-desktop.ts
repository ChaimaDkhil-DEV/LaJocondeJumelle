/**
 * Démarre Docker Desktop s'il ne tourne pas (utilisé par demo-en-ligne.ts pour lancer Whisper).
 * S'appuie sur `docker desktop start` (Docker Desktop 4.37 et suivants), qui trouve l'application
 * quel que soit son dossier d'installation (Program Files ou AppData pour une installation par
 * utilisateur).
 */
import { spawnSync } from 'node:child_process';

/** Délai laissé à `docker desktop start` (un démarrage à froid avec WSL 2 prend 30 à 90 s). */
export const DESKTOP_START_TIMEOUT_S = 180;
/** Délai d'attente du moteur après le démarrage de Docker Desktop. */
export const ENGINE_WAIT_MS = 60_000;
const ENGINE_POLL_MS = 2_000;
const DOCKER_INFO_TIMEOUT_MS = 15_000;

export interface DockerDesktopDeps {
  /** Lance une commande et renvoie son code de sortie (null : introuvable ou interrompue). */
  exec(
    command: string,
    args: readonly string[],
    options: { timeoutMs: number; quiet: boolean },
  ): number | null;
  sleep(ms: number): Promise<void>;
  now(): number;
  log(message: string): void;
  warn(message: string): void;
}

export const nodeDockerDeps: Pick<DockerDesktopDeps, 'exec' | 'sleep' | 'now'> = {
  exec: (command, args, { timeoutMs, quiet }) =>
    spawnSync(command, args, { stdio: quiet ? 'ignore' : 'inherit', timeout: timeoutMs }).status,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

function engineAnswers(deps: DockerDesktopDeps): boolean {
  return deps.exec('docker', ['info'], { timeoutMs: DOCKER_INFO_TIMEOUT_MS, quiet: true }) === 0;
}

/** Renvoie true quand le moteur Docker répond, en démarrant Docker Desktop si besoin. */
export async function ensureDockerEngine(deps: DockerDesktopDeps): Promise<boolean> {
  if (engineAnswers(deps)) return true;

  deps.log(
    `Docker ne répond pas : démarrage de Docker Desktop (jusqu'à ${DESKTOP_START_TIMEOUT_S / 60} min)...`,
  );
  const started = deps.exec(
    'docker',
    ['desktop', 'start', '--timeout', String(DESKTOP_START_TIMEOUT_S)],
    { timeoutMs: (DESKTOP_START_TIMEOUT_S + 10) * 1000, quiet: false },
  );
  if (started !== 0) {
    deps.warn("ATTENTION : Docker Desktop n'a pas pu être démarré. Ouvrez Docker Desktop, puis relancez.");
    return false;
  }

  const deadline = deps.now() + ENGINE_WAIT_MS;
  for (;;) {
    if (engineAnswers(deps)) {
      deps.log('Docker Desktop démarré');
      return true;
    }
    if (deps.now() >= deadline) break;
    await deps.sleep(ENGINE_POLL_MS);
  }
  deps.warn(
    `ATTENTION : Docker ne répond pas ${ENGINE_WAIT_MS / 1000} s après le démarrage de Docker Desktop. ` +
      'Ouvrez Docker Desktop, puis relancez.',
  );
  return false;
}
