#!/usr/bin/env node
// Hook Claude Code : applique les migrations Prisma en attente sur la base de DÉVELOPPEMENT.
//
//   PostToolUse (Edit|Write|MultiEdit) : seulement si le fichier modifié est
//     backend/prisma/migrations/**/*.sql
//   SessionStart (--session-start)     : à chaque ouverture de session.
//
// Garde-fou : ne s'exécute que si la base cible est locale (localhost, port 5433) et hors
// production. Sinon il ne fait rien et le signale. Échec de `prisma:deploy` : erreur sur
// stderr et code de sortie 2.
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const LOCAL_PORT = '5433';
const MIGRATION_SQL = /^backend\/prisma\/migrations\/.+\.sql$/i;

/** DATABASE_URL telle que Prisma la verra : variable d'environnement, sinon backend/.env. */
function effectiveDatabaseUrl() {
  if (process.env.DATABASE_URL) return { url: process.env.DATABASE_URL, source: 'environnement' };
  const envFile = path.join(PROJECT_DIR, 'backend', '.env');
  if (!fs.existsSync(envFile)) return { url: null, source: 'backend/.env absent' };
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*DATABASE_URL\s*=\s*(.*)\s*$/.exec(line);
    if (match) return { url: match[1].replace(/^(['"])(.*)\1$/, '$2'), source: 'backend/.env' };
  }
  return { url: null, source: 'DATABASE_URL absente de backend/.env' };
}

/** Raison du refus, ou null si la base est bien la base locale de développement. */
function refusalReason() {
  if (process.env.NODE_ENV === 'production') return 'NODE_ENV=production';
  const { url, source } = effectiveDatabaseUrl();
  if (!url) return `DATABASE_URL introuvable (${source})`;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return `DATABASE_URL illisible (${source})`;
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) return `protocole ${parsed.protocol} non PostgreSQL (${source})`;
  if (!LOCAL_HOSTS.has(parsed.hostname)) return `hôte ${parsed.hostname} non local (${source})`;
  if (parsed.port !== LOCAL_PORT) return `port ${parsed.port || '(défaut)'} au lieu de ${LOCAL_PORT} (${source})`;
  return null;
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/** Chemin du fichier modifié, relatif au projet, en séparateurs « / ». */
function editedFile(payload) {
  const input = payload.tool_input || {};
  const response = payload.tool_response || {};
  const file = input.file_path || response.filePath;
  if (typeof file !== 'string' || !file) return null;
  return path.relative(PROJECT_DIR, path.resolve(PROJECT_DIR, file)).split(path.sep).join('/');
}

function say(message) {
  process.stdout.write(JSON.stringify({ systemMessage: message }) + '\n');
}

function deploy() {
  // Commande constante (aucune donnée extérieure) : l'interpréteur résout npm / npm.cmd.
  const result = spawnSync('npm run -w backend prisma:deploy', { cwd: PROJECT_DIR, encoding: 'utf8', shell: true });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (result.error || result.status !== 0) {
    process.stderr.write(
      `Migrations Prisma : échec de \`npm run -w backend prisma:deploy\` (code ${result.status ?? 'inconnu'}).\n` +
        `${result.error ? String(result.error) + '\n' : ''}${output}\n`,
    );
    process.exit(2);
  }
  const applied = /All migrations have been successfully applied|No pending migrations to apply/i.exec(output);
  say(`Migrations Prisma (base locale ${LOCAL_PORT}) : ${applied ? applied[0] : 'à jour'}.`);
}

function main() {
  const sessionStart = process.argv.includes('--session-start');
  if (!sessionStart) {
    let payload = {};
    try {
      payload = JSON.parse(readStdin() || '{}');
    } catch {
      return; // Entrée illisible : rien à faire, ne pas gêner l'outil.
    }
    const file = editedFile(payload);
    if (!file || !MIGRATION_SQL.test(file)) return;
  }
  const reason = refusalReason();
  if (reason) {
    say(`Migrations Prisma NON appliquées : la base ciblée n'est pas la base locale de développement (${reason}).`);
    return;
  }
  deploy();
}

main();
