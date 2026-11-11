/**
 * Aides de la démonstration en ligne (demo-en-ligne.ts) liées au tunnel Cloudflare.
 *
 * L'API n'accepte les requêtes modifiantes que depuis APP_ORIGIN = adresse du tunnel et
 * APP_LOCAL_ORIGINS = interface locale (OriginGuard, protection CSRF). L'adresse d'un ancien tunnel
 * cloudflared resté actif, qui publie encore le même port local, fait donc échouer la connexion en
 * 403 sans que rien ne l'explique.
 */
import { spawnSync } from 'node:child_process';

/** APP_LOCAL_ORIGINS de l'API : l'interface locale (vite preview), par 127.0.0.1 ou localhost. */
export function demoLocalOrigins(previewPort: number): string {
  return `http://127.0.0.1:${previewPort},http://localhost:${previewPort}`;
}

/** Lignes affichées une fois la démonstration prête. */
export function onlineDemoNotice(url: string, previewPort: number): string[] {
  return [
    `  Application en ligne : ${url}`,
    `  Sur ce poste : http://127.0.0.1:${previewPort} (le micro du téléphone exige l'adresse en ligne).`,
  ];
}

/** PID lus dans la sortie de `tasklist /FO CSV /NH` (Windows) ou de `pgrep` (un PID par ligne). */
export function parseCloudflaredPids(output: string): number[] {
  const pids: number[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    const pid = /^\d+$/.test(line) ? line : /^"cloudflared(?:\.exe)?","(\d+)"/i.exec(line)?.[1];
    if (pid) pids.push(Number(pid));
  }
  return pids;
}

export interface CloudflaredProbeDeps {
  /** Sortie de la commande listant les processus cloudflared, ou null si elle a échoué. */
  listProcesses(): string | null;
  warn(message: string): void;
  isWindows: boolean;
}

export const nodeCloudflaredDeps: Pick<CloudflaredProbeDeps, 'listProcesses' | 'isWindows'> = {
  isWindows: process.platform === 'win32',
  listProcesses: () => {
    const result =
      process.platform === 'win32'
        ? spawnSync('tasklist', ['/FI', 'IMAGENAME eq cloudflared.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' })
        : spawnSync('pgrep', ['-x', 'cloudflared'], { encoding: 'utf8' });
    return result.error ? null : result.stdout;
  },
};

/**
 * À appeler avant de lancer le tunnel. Un cloudflared déjà actif n'empêche pas la démonstration
 * (ce peut être un tunnel légitime, sans rapport) : on avertit, sans bloquer. Renvoie les PID trouvés.
 */
export function warnIfCloudflaredRunning(deps: CloudflaredProbeDeps): number[] {
  const output = deps.listProcesses();
  const pids = output === null ? [] : parseCloudflaredPids(output);
  if (pids.length === 0) return pids;

  deps.warn(
    `ATTENTION : cloudflared tourne déjà (PID ${pids.join(', ')}). S'il s'agit d'un ancien tunnel de ` +
      "démonstration, son adresse mène toujours à cette démonstration, mais la connexion y échoue (403) : " +
      "seule la nouvelle adresse est autorisée.",
  );
  for (const pid of pids) {
    deps.warn(`  Pour l'arrêter : ${deps.isWindows ? `taskkill /PID ${pid} /F` : `kill ${pid}`}`);
  }
  return pids;
}
