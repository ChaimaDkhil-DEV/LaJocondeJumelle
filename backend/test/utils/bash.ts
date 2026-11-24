import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, writeFileSync } from 'node:fs';

export const posix = (path: string): string => path.replace(/\\/g, '/');

/** bash : celui du système sous Linux, celui de Git for Windows sous Windows. */
export function bash(): string {
  if (process.platform !== 'win32') return 'bash';
  const gitCore = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
  const path = posix(gitCore).replace(/\/mingw64\/libexec\/git-core$/, '/bin/bash.exe');
  if (!existsSync(path)) throw new Error(`bash introuvable (attendu : ${path}) : installez Git for Windows.`);
  return path;
}

/** Remplace une commande par un script bash, dans un dossier à placer en tête du PATH. */
export function fakeCommand(path: string, body: string): void {
  writeFileSync(path, `#!/bin/bash\n${body}\n`);
  chmodSync(path, 0o755);
}
