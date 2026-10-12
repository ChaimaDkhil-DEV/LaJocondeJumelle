/**
 * Génère les fichiers audio de test (fixtures) avec ffmpeg.
 * Usage : npm run -w backend fixtures:generate   (FFMPEG_PATH lu dans backend/.env)
 * Les fichiers produits sont versionnés : ce script ne sert qu'à les reproduire.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvFile } from '../src/config/load-env-file';
import { SETTING_DEFAULTS } from '../src/settings/settings.service';

loadEnvFile(join(__dirname, '..'));
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const audioDir = join(__dirname, '..', 'test', 'fixtures', 'audio');
const e2eAudioDir = join(__dirname, '..', '..', 'e2e', 'fixtures', 'audio');
mkdirSync(audioDir, { recursive: true });
mkdirSync(e2eAudioDir, { recursive: true });

function run(args: string[]): void {
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
}

const tone = (seconds: number) => ['-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${seconds}`];

run([...tone(2), '-c:a', 'libopus', '-b:a', '32k', join(audioDir, 'sample.webm')]);
run([...tone(2), '-c:a', 'aac', '-b:a', '64k', '-f', 'mp4', join(audioDir, 'sample.mp4')]);
run([...tone(2), '-c:a', 'libopus', '-b:a', '32k', join(audioDir, 'sample.ogg')]);
run([...tone(0.5), '-c:a', 'libopus', '-b:a', '32k', join(audioDir, 'silence-0.5s.webm')]);
run([...tone(SETTING_DEFAULTS.voiceMaxSeconds + 5), '-c:a', 'libopus', '-b:a', '8k', join(audioDir, 'too-long.webm')]);

// Une image PNG renommée en .webm : doit être refusée comme fichier non audio.
const png = join(audioDir, 'not-audio.png');
run(['-f', 'lavfi', '-i', 'color=c=red:s=16x16', '-frames:v', '1', png]);
renameSync(png, join(audioDir, 'not-audio.webm'));

// Vocal AAC/MP4 utilisé par la simulation de MediaRecorder sur WebKit (e2e).
run([...tone(3), '-ac', '1', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', '-f', 'mp4', join(e2eAudioDir, 'sample.m4a')]);
copyFileSync(join(e2eAudioDir, 'sample.m4a'), join(audioDir, 'sample.m4a'));

console.log('Fixtures audio générées.');
