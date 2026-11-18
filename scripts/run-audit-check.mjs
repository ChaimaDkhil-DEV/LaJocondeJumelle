#!/usr/bin/env node
/**
 * Lance l'audit des dépendances (règles : audit-check.mjs). Toujours exécuté quand on l'appelle : aucune condition
 * sur le chemin du fichier, qui pourrait faire sauter la vérification et sortir en succès.
 *
 * Usage : node scripts/run-audit-check.mjs   (ou npm run audit:check, qui lance aussi les tests)
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, localDate, parseAuditOutput, parseExceptions } from './audit-check.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  const exceptions = parseExceptions(readFileSync(join(root, 'audit-exceptions.json'), 'utf8'));
  // Commande fixe, sans argument venu de l'extérieur ; le shell permet de trouver npm sous Windows aussi.
  const run = spawnSync('npm audit --json', {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error) throw new Error(`npm audit n'a pas pu être lancé : ${run.error.message}`);
  const report = parseAuditOutput(run);
  // Date du jour de l'équipe (fuseau de l'école), pour que l'échéance d'une exception tombe le bon jour.
  const today = localDate(new Date(), process.env.SCHOOL_TIMEZONE || 'Europe/Paris');
  const result = evaluate(report, exceptions, today);

  for (const a of result.excepted)
    console.log(`Exception admise : ${a.id} (${a.package}, ${a.severity}) — ${a.title ?? ''}`);
  for (const a of result.blocking)
    console.error(
      `Faille ${a.severity} : ${a.id} (${a.package}) — ${a.title ?? ''} ${a.url ?? ''}`,
    );
  for (const p of result.problems) console.error(p);
  if (!result.ok) {
    console.error('Audit des dépendances : échec.');
    process.exit(1);
  }
  console.log('Audit des dépendances : aucune faille haute ou critique hors exception.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error('Audit des dépendances : échec.');
  process.exit(1);
}
