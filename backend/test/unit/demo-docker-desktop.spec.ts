import {
  DESKTOP_START_TIMEOUT_S,
  ENGINE_WAIT_MS,
  ensureDockerEngine,
  type DockerDesktopDeps,
} from '../../scripts/docker-desktop';

/** Démonstration en ligne : Docker Desktop est démarré s'il ne tourne pas, pour lancer Whisper. */

interface Scenario {
  /** Codes de sortie successifs de `docker info` (le dernier se répète). */
  info: (number | null)[];
  /** Code de sortie de `docker desktop start`. */
  desktopStart?: number | null;
}

function fakeDeps({ info, desktopStart = 0 }: Scenario) {
  let clock = 0;
  let infoCalls = 0;
  const calls: string[] = [];
  const log = jest.fn<void, [string]>();
  const warn = jest.fn<void, [string]>();
  const deps: DockerDesktopDeps = {
    exec: (command, args) => {
      calls.push([command, ...args].join(' '));
      if (args[0] === 'info') return info[Math.min(infoCalls++, info.length - 1)] ?? null;
      if (args[0] === 'desktop') return desktopStart;
      throw new Error(`commande inattendue : ${command} ${args.join(' ')}`);
    },
    sleep: (ms) => {
      clock += ms;
      return Promise.resolve();
    },
    now: () => clock,
    log,
    warn,
  };
  return { deps, calls, log, warn };
}

describe('ensureDockerEngine (demo:en-ligne)', () => {
  it('ne démarre pas Docker Desktop si le moteur répond déjà', async () => {
    const { deps, calls, warn } = fakeDeps({ info: [0] });

    await expect(ensureDockerEngine(deps)).resolves.toBe(true);

    expect(calls).toEqual(['docker info']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('démarre Docker Desktop puis attend que le moteur réponde', async () => {
    const { deps, calls, log, warn } = fakeDeps({ info: [1, 1, 1, 0] });

    await expect(ensureDockerEngine(deps)).resolves.toBe(true);

    expect(calls).toContain(`docker desktop start --timeout ${DESKTOP_START_TIMEOUT_S}`);
    expect(calls.filter((call) => call === 'docker info')).toHaveLength(4);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('démarrage de Docker Desktop'));
    expect(warn).not.toHaveBeenCalled();
  });

  it('renonce si Docker Desktop ne démarre pas (absent ou trop ancien)', async () => {
    const { deps, calls, warn } = fakeDeps({ info: [1], desktopStart: 1 });

    await expect(ensureDockerEngine(deps)).resolves.toBe(false);

    expect(calls).toEqual(['docker info', `docker desktop start --timeout ${DESKTOP_START_TIMEOUT_S}`]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Ouvrez Docker Desktop'));
  });

  it('renonce si la commande docker est introuvable', async () => {
    const { deps, warn } = fakeDeps({ info: [null], desktopStart: null });

    await expect(ensureDockerEngine(deps)).resolves.toBe(false);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Ouvrez Docker Desktop'));
  });

  it('renonce si le moteur ne répond toujours pas après le délai', async () => {
    const { deps, warn } = fakeDeps({ info: [1] });

    await expect(ensureDockerEngine(deps)).resolves.toBe(false);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`${ENGINE_WAIT_MS / 1000} s`),
    );
  });
});
