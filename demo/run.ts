/**
 * Vidéos de démonstration du super administrateur, une par scénario.
 *
 *   npx tsx demo/run.ts all --env=test          tous les scénarios + vidéo compilée
 *   npx tsx demo/run.ts S12 --env=test          un scénario (ou plusieurs : S01 S05)
 *   npx tsx demo/run.ts all --env=test --no-compile
 *   npx tsx demo/run.ts parcours --env=test   parcours d'une demande vocale (P01 à P05) + vidéo compilée
 *
 * Chaque scénario repart d'une base propre (remise à zéro + seed fictif). Sortie : demo/videos/,
 * fichiers intermédiaires : demo/tmp/. Refus si l'environnement n'est pas explicitement dev ou test.
 */
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { session } from './lib/api';
import { compileAll, PARCOURS_COMPILATION, SUPERADMIN_COMPILATION, type Compilation } from './lib/compile';
import { burnSubtitles, Demo, DEMO_DIR, ffmpegPath, VIDEOS_DIR, type Scenario } from './lib/demo';
import { assertDemoEnvironment } from './lib/env';
import { startDemoStack } from './lib/stack';
import { PARCOURS, SCENARIOS } from './scenarios';
import { VOICE_SENTENCE, type AssistMode } from './lib/config';

const log = (message: string) => console.log(`[démo] ${message}`);

/** Voix fictive du micro simulé (messages vocaux) : échantillon des tests e2e converti en WAV. */
const FAKE_VOICE = join(DEMO_DIR, 'tmp', 'voix-demo.wav');

function prepareTools(): void {
  if (spawnSync(ffmpegPath(), ['-version'], { stdio: 'ignore' }).status !== 0) {
    throw new Error('ffmpeg introuvable : renseignez FFMPEG_PATH et FFPROBE_PATH (voir demo/README.md).');
  }
  mkdirSync(join(DEMO_DIR, 'tmp'), { recursive: true });
  mkdirSync(VIDEOS_DIR, { recursive: true });
  if (!existsSync(FAKE_VOICE)) {
    const sample = join(DEMO_DIR, '..', 'e2e', 'fixtures', 'audio', 'sample.m4a');
    const result = spawnSync(ffmpegPath(), ['-v', 'error', '-y', '-i', sample, '-ac', '1', '-ar', '48000', FAKE_VOICE], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error('Préparation de la voix fictive impossible.');
  }
}

const ALL_SCENARIOS = [...SCENARIOS, ...PARCOURS];

/** Demande parlée de la série « parcours » : synthèse vocale française (Windows), 48 kHz mono. */
const SPOKEN_REQUEST = join(DEMO_DIR, 'tmp', 'voix-demande.wav');

/** Chemin dans une chaîne PowerShell entre apostrophes (une apostrophe s'y écrit doublée). */
const psQuoted = (path: string): string => `'${path.replace(/'/g, "''")}'`;

function prepareSpokenRequest(): void {
  const raw = join(DEMO_DIR, 'tmp', 'voix-demande-brute.wav');
  const text = join(DEMO_DIR, 'tmp', 'voix-demande.txt');
  // Le WAV n'est réutilisé que s'il a été produit à partir de la phrase actuelle (VOICE_SENTENCE).
  if (existsSync(SPOKEN_REQUEST) && existsSync(text) && readFileSync(text, 'utf8') === VOICE_SENTENCE) return;
  rmSync(SPOKEN_REQUEST, { force: true });
  writeFileSync(text, VOICE_SENTENCE, 'utf8');
  const script = [
    'Add-Type -AssemblyName System.Speech',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    "$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'fr-FR' } | Select-Object -First 1",
    "if (-not $v) { throw 'Aucune voix française installée.' }",
    '$s.SelectVoice($v.VoiceInfo.Name)',
    '$s.Rate = -1',
    `$s.SetOutputToWaveFile(${psQuoted(raw)})`,
    `$s.Speak([IO.File]::ReadAllText(${psQuoted(text)}, [Text.Encoding]::UTF8))`,
    '$s.Dispose()',
  ].join('; ');
  const tts = spawnSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'inherit' });
  if (tts.status !== 0) throw new Error('Synthèse vocale impossible (Windows et une voix française sont nécessaires).');
  // Une seconde de silence avant et après : la phrase entière tombe dans l'enregistrement.
  const result = spawnSync(ffmpegPath(), ['-v', 'error', '-y', '-i', raw, '-af', 'adelay=1000:all=1,apad=pad_dur=1', '-ac', '1', '-ar', '48000', SPOKEN_REQUEST], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Préparation de la voix de la demande impossible.');
}

/** Whisper (adresse de backend/.env) s'il répond, sinon fournisseurs locaux de démonstration. */
async function detectAssist(): Promise<{ assist: AssistMode; whisperUrl?: string }> {
  const env = join(DEMO_DIR, '..', 'backend', '.env');
  const url = existsSync(env)
    ? /^\s*ASSIST_WHISPER_URL\s*=\s*(.+)$/m
        .exec(readFileSync(env, 'utf8'))?.[1]
        ?.trim()
        .replace(/^(['"])(.*)\1$/, '$2')
    : undefined;
  if (url) {
    try {
      // Toute réponse HTTP (même 404 sur « / ») prouve que le serveur écoute ; 5xx : serveur en panne.
      if ((await fetch(url, { signal: AbortSignal.timeout(5000) })).status < 500) return { assist: 'whisper', whisperUrl: url };
    } catch {
      // Serveur absent : repli.
    }
  }
  return { assist: 'demo' };
}

function select(args: readonly string[]): Scenario[] {
  const wanted = args.filter((a) => !a.startsWith('--')).map((a) => a.toUpperCase());
  if (wanted.length === 0) return SCENARIOS;
  // « all » et « parcours » désignent une série entière : ils s'emploient seuls.
  if (wanted.length > 1 && wanted.some((w) => w === 'ALL' || w === 'PARCOURS')) {
    throw new Error(`« all » et « parcours » s'emploient seuls, sans autre scénario (reçu : ${wanted.join(' ')}).`);
  }
  if (wanted[0] === 'ALL') return SCENARIOS;
  if (wanted[0] === 'PARCOURS') return PARCOURS;
  const unknown = wanted.filter((w) => !ALL_SCENARIOS.some((s) => s.id === w));
  if (unknown.length > 0) throw new Error(`Scénario inconnu : ${unknown.join(', ')} (disponibles : ${ALL_SCENARIOS.map((s) => s.id).join(', ')})`);
  const chosen = ALL_SCENARIOS.filter((s) => wanted.includes(s.id));
  // La série P a besoin de la création vocale assistée, la série S la désactive : pas de mélange.
  const journey = chosen.filter((s) => PARCOURS.includes(s));
  if (journey.length > 0 && journey.length < chosen.length) {
    throw new Error('Séries S et P mélangées : lancez les scénarios S et P séparément.');
  }
  return chosen;
}

/** Série des scénarios choisis : parcours (P…) ou super administrateur (S…). */
function compilationOf(scenarios: readonly Scenario[]): { series: Scenario[]; compilation: Compilation } {
  return scenarios.every((s) => PARCOURS.includes(s))
    ? { series: PARCOURS, compilation: PARCOURS_COMPILATION }
    : { series: SCENARIOS, compilation: SUPERADMIN_COMPILATION };
}

/** --compile-only : vidéo compilée à partir des vidéos de scénario déjà produites, sans réenregistrer. */
async function compileExisting(scenarios: Scenario[]): Promise<void> {
  const done = scenarios
    .map((scenario) => ({ scenario, file: join(VIDEOS_DIR, `${scenario.id}-${scenario.slug}.mp4`) }))
    .filter(({ file }) => existsSync(file));
  const missing = scenarios.filter((s) => !done.some((d) => d.scenario.id === s.id)).map((s) => s.id);
  if (missing.length > 0) log(`Vidéos absentes, non compilées : ${missing.join(', ')}`);
  const browser = await chromium.launch();
  try {
    log(`Compilée : ${await compileAll(browser, done, compilationOf(scenarios).compilation)}`);
  } finally {
    await browser.close();
  }
}

/** --reburn : réincruste les sous-titres à partir des enregistrements et .srt de demo/tmp, sans réenregistrer. */
async function reburnExisting(scenarios: Scenario[]): Promise<void> {
  for (const scenario of scenarios) {
    const raw = join(DEMO_DIR, 'tmp', `${scenario.id}.webm`);
    if (!existsSync(raw)) {
      log(`${scenario.id} : enregistrement absent, ignoré`);
      continue;
    }
    const file = join(VIDEOS_DIR, `${scenario.id}-${scenario.slug}.mp4`);
    burnSubtitles(scenario, file);
    log(`${scenario.id} : ${file}`);
  }
}

const USAGE = `Usage : npx tsx demo/run.ts <all | parcours | S01 [S02 …] | P01 [P02 …]> --env=test [--no-compile | --compile-only | --reburn]
Scénarios : ${ALL_SCENARIOS.map((s) => `${s.id} ${s.title}`).join(' · ')}`;

/** Options connues : toute autre option est refusée (et --help n'enregistre rien). */
const KNOWN_FLAGS = ['--no-compile', '--compile-only', '--reburn'];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return;
  }
  const unknownFlags = args.filter((a) => a.startsWith('-') && !a.startsWith('--env=') && !KNOWN_FLAGS.includes(a));
  if (unknownFlags.length > 0) throw new Error(`Option inconnue : ${unknownFlags.join(', ')}\n${USAGE}`);
  const env = assertDemoEnvironment(args);
  const scenarios = select(args);
  if (args.includes('--compile-only')) {
    prepareTools();
    await compileExisting(scenarios);
    return;
  }
  if (args.includes('--reburn')) {
    prepareTools();
    await reburnExisting(scenarios);
    if (scenarios.length > 1) await compileExisting(compilationOf(scenarios).series);
    return;
  }
  const compile = scenarios.length > 1 && !args.includes('--no-compile');
  log(`Environnement : ${env}. Scénarios : ${scenarios.map((s) => s.id).join(', ')}`);
  prepareTools();

  // Série « parcours » : création vocale assistée, transcription réelle si Whisper répond.
  const journey = scenarios.every((s) => PARCOURS.includes(s));
  const assist = journey ? await detectAssist() : { assist: 'disabled' as const };
  if (journey) {
    prepareSpokenRequest();
    log(assist.assist === 'whisper' ? `Transcription réelle : Whisper (${assist.whisperUrl}).` : 'Whisper ne répond pas : transcription locale de démonstration.');
  }
  process.env.DEMO_ASSIST_MODE = assist.assist;
  const stack = await startDemoStack(log, assist);
  const done: Array<{ scenario: Scenario; file: string }> = [];
  const failed: Array<{ id: string; error: string }> = [];
  try {
    const browser = await chromium.launch({
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${journey ? SPOKEN_REQUEST : FAKE_VOICE}`],
    });
    try {
      for (const scenario of scenarios) {
        log(`${scenario.id} — ${scenario.title} : base propre…`);
        try {
          await stack.reset();
          await scenario.prepare?.({ prisma: stack.prisma, as: session, log });
          const demo = await Demo.open(browser, scenario);
          let error: unknown;
          try {
            await scenario.play(demo);
          } catch (e) {
            error = e;
          }
          await demo.finish(scenario);
          if (error) throw error;
          const file = join(VIDEOS_DIR, `${scenario.id}-${scenario.slug}.mp4`);
          burnSubtitles(scenario, file);
          done.push({ scenario, file });
          log(`${scenario.id} : ${file}`);
        } catch (e) {
          const message = e instanceof Error ? e.message.split('\n')[0] : String(e);
          failed.push({ id: scenario.id, error: message });
          log(`${scenario.id} ÉCHEC : ${message}`);
        }
      }
      if (compile && done.length > 1) {
        log('Vidéo compilée…');
        log(`Compilée : ${await compileAll(browser, done, compilationOf(scenarios).compilation)}`);
      }
    } finally {
      await browser.close();
    }
  } finally {
    log('Arrêt de la pile de démo…');
    await stack.stop();
  }
  log(`Terminé : ${done.length} réussi(s), ${failed.length} échec(s).`);
  for (const f of failed) log(`  ${f.id} : ${f.error}`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
