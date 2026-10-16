import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * T033 — FR-012, FR-013 : ordre des couches de backend/src (research R7). Un dossier ne dépend que
 * des dossiers placés avant lui ; les dossiers hors de la liste ne sont pas contrôlés.
 */
const LAYERS = ['config', 'common', 'audit', 'auth', 'files', 'requests', 'coverage', 'dashboard', 'scheduler'];

const SRC = resolve(__dirname, '../../src');
/** Imports et réexports relatifs, y compris `import type` et les imports sans liaison. */
const RELATIVE_IMPORT = /^\s*(?:import|export)\s(?:[^'"]*?\sfrom\s+)?'(\.[^']+)'/gm;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'generated' ? [] : sourceFiles(path);
    return name.endsWith('.ts') ? [path] : [];
  });
}

/** Dossier de premier niveau sous src, ou null pour un fichier à la racine ou hors de src. */
function layerOf(path: string): string | null {
  const parts = relative(SRC, path).split(sep);
  return parts.length > 1 && parts[0] !== '..' ? parts[0] : null;
}

describe('Ordre des couches de backend/src', () => {
  it('aucun dossier ne dépend d’un dossier placé après lui', () => {
    const violations: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const from = layerOf(file);
      if (from === null || !LAYERS.includes(from)) continue;
      for (const [, target] of readFileSync(file, 'utf8').matchAll(RELATIVE_IMPORT)) {
        const to = layerOf(resolve(dirname(file), target));
        if (to !== null && LAYERS.includes(to) && LAYERS.indexOf(to) > LAYERS.indexOf(from)) {
          violations.push(`${relative(SRC, file).split(sep).join('/')} → ${target} (${from} ne peut pas dépendre de ${to})`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
