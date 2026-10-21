/**
 * Vidéos de démonstration du super administrateur, une par scénario.
 *
 *   npx tsx demo/run.ts all --env=test          tous les scénarios + vidéo compilée
 *   npx tsx demo/run.ts S12 --env=test          un scénario (ou plusieurs : S01 S05)
 *   npx tsx demo/run.ts all --env=test --no-compile
 *
 * Chaque scénario repart d'une base propre (remise à zéro + seed fictif). Sortie : demo/videos/,
 * fichiers intermédiaires : demo/tmp/. Refus si l'environnement n'est pas explicitement dev ou test.
 */
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { session } from './lib/api';
import { compileAll } from './lib/compile';
import { burnSubtitles, Demo, DEMO_DIR, ffmpegPath, VIDEOS_DIR, type Scenario } from './lib/demo';
import { assertDemoEnvironment } from './lib/env';
import { startDemoStack } from './lib/stack';
import { SCENARIOS } from './scenarios';

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

function select(args: readonly string[]): Scenario[] {
  const wanted = args.filter((a) => !a.startsWith('--')).map((a) => a.toUpperCase());
  if (wanted.length === 0 || wanted.includes('ALL')) return SCENARIOS;
  const unknown = wanted.filter((w) => !SCENARIOS.some((s) => s.id === w));
  if (unknown.length > 0) throw new Error(`Scénario inconnu : ${unknown.join(', ')} (disponibles : ${SCENARIOS.map((s) => s.id).join(', ')})`);
  return SCENARIOS.filter((s) => wanted.includes(s.id));
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
    log(`Compilée : ${await compileAll(browser, done)}`);
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

const USAGE = `Usage : npx tsx demo/run.ts <all | S01 [S02 …]> --env=test [--no-compile | --compile-only | --reburn]
Scénarios : ${SCENARIOS.map((s) => `${s.id} ${s.title}`).join(' · ')}`;

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
    if (scenarios.length > 1) await compileExisting(SCENARIOS);
    return;
  }
  const compile = scenarios.length > 1 && !args.includes('--no-compile');
  log(`Environnement : ${env}. Scénarios : ${scenarios.map((s) => s.id).join(', ')}`);
  prepareTools();

  const stack = await startDemoStack(log);
  const done: Array<{ scenario: Scenario; file: string }> = [];
  const failed: Array<{ id: string; error: string }> = [];
  try {
    const browser = await chromium.launch({
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${FAKE_VOICE}`],
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
        log(`Compilée : ${await compileAll(browser, done)}`);
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
