import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * T034 — FR-016 : les énumérations du schéma Prisma et les types de l'interface, écrits à la main,
 * restent identiques (A17, research R10). Un statut ajouté côté serveur fait échouer ce test tant
 * que l'interface ne le connaît pas.
 */

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

const SCHEMA = read('../../../backend/prisma/schema.prisma');
const FRONTEND = ['../../src/api/types.ts', '../../src/features/requests/types.ts', '../../src/features/coverage/types.ts'].map(read).join('\n');

/**
 * Énumérations Prisma partagées par les deux domaines (demandes de travail, lot 1 ; couverture de
 * classe, lot 2) : l'interface les découpe en deux types, comparés ensemble.
 */
const SPLIT: Record<string, string[]> = {
  RequestStatus: ['RequestStatus', 'CoverageStatus'],
  DeadlineStage: ['DeadlineStage', 'CoverageStage'],
};

/** Le test doit au minimum comparer ces énumérations. */
const REQUIRED = ['Role', 'Priority', 'RequestStatus', 'AssignmentMode'];

function prismaEnums(): Map<string, Set<string>> {
  const enums = new Map<string, Set<string>>();
  for (const [, name, body] of SCHEMA.matchAll(/^enum (\w+) \{([^}]*)\}/gm)) {
    const values = body
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line));
    enums.set(name, new Set(values));
  }
  return enums;
}

const literals = (union: string) => [...union.matchAll(/'([^']+)'/g)].map(([, value]) => value);

/** `export type Nom = 'A' | 'B';`, et les unions en ligne d'une propriété (`assignmentMode?: 'A' | 'B';` → AssignmentMode). */
function frontendUnions(): Map<string, Set<string>> {
  const unions = new Map<string, Set<string>>();
  const add = (name: string, values: string[]) => unions.set(name, new Set([...(unions.get(name) ?? []), ...values]));
  for (const [, name, union] of FRONTEND.matchAll(/export type (\w+) =\s*((?:\|?\s*'[^']+'\s*)+);/g)) add(name, literals(union));
  for (const [, property, union] of FRONTEND.matchAll(/(\w+)\??:\s*((?:'[^']+'\s*\|\s*)+'[^']+')\s*;/g)) {
    add(property[0].toUpperCase() + property.slice(1), literals(union));
  }
  return unions;
}

describe('Énumérations serveur et interface', () => {
  const prisma = prismaEnums();
  const frontend = frontendUnions();
  const frontendValues = (name: string): Set<string> | null => {
    const parts = (SPLIT[name] ?? [name]).map((part) => frontend.get(part)).filter((v): v is Set<string> => v !== undefined);
    return parts.length === 0 ? null : new Set(parts.flatMap((part) => [...part]));
  };

  it.each(REQUIRED)('%s existe des deux côtés', (name) => {
    expect(prisma.has(name)).toBe(true);
    expect(frontendValues(name)).not.toBeNull();
  });

  it('chaque énumération présente des deux côtés a les mêmes valeurs', () => {
    const differences: string[] = [];
    for (const [name, values] of prisma) {
      const known = frontendValues(name);
      if (!known) continue;
      const missing = [...values].filter((v) => !known.has(v));
      const extra = [...known].filter((v) => !values.has(v));
      if (missing.length || extra.length) {
        differences.push(`${name} : manquant côté interface [${missing.join(', ')}] ; en trop côté interface [${extra.join(', ')}]`);
      }
    }
    expect(differences).toEqual([]);
  });
});
