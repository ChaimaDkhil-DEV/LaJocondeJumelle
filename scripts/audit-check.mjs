#!/usr/bin/env node
/**
 * Audit des dépendances (CI, étape « Audit des dépendances ») : comme `npm audit --audit-level=high`, échoue sur
 * toute faille haute ou critique, SAUF une alerte inscrite dans `audit-exceptions.json` à la racine. Une exception
 * n'est admise que pour une alerte sans version corrigée, qui n'atteint pas la production : elle porte un motif et
 * une date de revue. Une exception échue ou devenue inutile (alerte disparue) fait échouer, pour être revue ou
 * retirée. Aucune dépendance : lit la sortie JSON de `npm audit`.
 *
 * Usage : node scripts/audit-check.mjs
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BLOCKING = new Set(['high', 'critical']);
const GHSA = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i;

/** Identifiant de l'alerte : le GHSA de son adresse, à défaut le numéro npm. */
function advisoryId(via) {
  return (typeof via.url === 'string' && via.url.match(GHSA)?.[0]) || String(via.source);
}

/**
 * Décision, sans effet de bord (testée par audit-check.test.mjs).
 * `report` : sortie de `npm audit --json` ; `exceptions` : contenu de audit-exceptions.json ; `today` : AAAA-MM-JJ.
 */
export function evaluate(report, exceptions, today) {
  // Les alertes elles-mêmes (objets de `via`) ; un paquet qui dépend d'un paquet vulnérable n'en ajoute pas.
  const advisories = new Map();
  for (const [pkg, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via !== 'object' || !BLOCKING.has(via.severity)) continue;
      const id = advisoryId(via);
      if (!advisories.has(id))
        advisories.set(id, {
          id,
          package: via.name ?? pkg,
          severity: via.severity,
          title: via.title,
          url: via.url,
        });
    }
  }

  const problems = [];
  const valid = new Map();
  for (const e of exceptions) {
    if (!e.id || !e.reason || !/^\d{4}-\d{2}-\d{2}$/.test(e.review ?? '')) {
      problems.push(
        `Exception ${e.id ?? '(sans identifiant)'} incomplète : identifiant, motif et date de revue (AAAA-MM-JJ) sont obligatoires.`,
      );
    } else if (e.review < today) {
      problems.push(
        `Exception ${e.id} échue depuis le ${e.review} : vérifiez si une version corrigée existe, puis mettez à jour la dépendance ou repoussez la date de revue.`,
      );
    } else {
      valid.set(e.id.toUpperCase(), e);
    }
    if (
      e.id &&
      !advisories.has(e.id) &&
      ![...advisories.keys()].some((id) => id.toUpperCase() === e.id.toUpperCase())
    ) {
      problems.push(
        `Exception ${e.id} inutile : l'alerte n'apparaît plus dans l'audit, retirez-la de audit-exceptions.json.`,
      );
    }
  }

  const blocking = [];
  const excepted = [];
  for (const a of advisories.values())
    (valid.has(a.id.toUpperCase()) ? excepted : blocking).push(a);
  return { ok: blocking.length === 0 && problems.length === 0, blocking, excepted, problems };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const exceptions = JSON.parse(readFileSync(join(root, 'audit-exceptions.json'), 'utf8'));
  let output;
  try {
    // Commande fixe, sans argument venu de l'extérieur ; passe par le shell pour trouver npm sous Windows aussi.
    output = execSync('npm audit --json', {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // `npm audit` sort en erreur dès qu'il trouve une faille : le rapport est quand même sur la sortie standard.
    output = error.stdout;
  }
  const report = JSON.parse(output);
  if (report.error)
    throw new Error(`npm audit a échoué : ${report.error.summary ?? JSON.stringify(report.error)}`);
  const today = new Date().toISOString().slice(0, 10);
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
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
