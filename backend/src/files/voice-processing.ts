import { execFile } from 'node:child_process';
import { rm, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { AppException } from '../common/errors';

const execFileAsync = promisify(execFile);

/** Durée minimale d'un vocal, en secondes. */
export const VOICE_MIN_SECONDS = 1;
/** Tolérance au-delà de voiceMaxSeconds (arrêt automatique côté navigateur légèrement tardif). */
export const VOICE_TOLERANCE_SECONDS = 2;

const TOOL_TIMEOUT_MS = 60_000;

export interface VoiceProcessingOptions {
  ffmpegPath: string;
  ffprobePath: string;
  maxSeconds: number;
}

export interface ProcessedVoice {
  path: string;
  mimeType: 'audio/mp4';
  durationSeconds: number;
  sizeBytes: number;
}

interface ProbeResult {
  streams?: Array<{ codec_type?: string }>;
  format?: { duration?: string };
}

async function probe(ffprobePath: string, path: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync(
    ffprobePath,
    ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', path],
    { timeout: TOOL_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
  );
  return JSON.parse(stdout) as ProbeResult;
}

/**
 * Vérifie qu'un vocal téléversé est bien de l'audio, le convertit en AAC mono 64 kbit/s dans un
 * conteneur MP4 (lu par tous les navigateurs cibles, research R2) et contrôle sa durée réelle.
 * La durée est mesurée sur le fichier converti : les WebM de MediaRecorder n'en déclarent souvent pas.
 * Le fichier d'origine est toujours supprimé ; en cas d'erreur, aucun fichier ne subsiste.
 */
export async function processVoice(inputPath: string, options: VoiceProcessingOptions): Promise<ProcessedVoice> {
  const outputPath = `${inputPath}.m4a`;
  try {
    let input: ProbeResult;
    try {
      input = await probe(options.ffprobePath, inputPath);
    } catch {
      throw new AppException('FILE_TYPE_NOT_ALLOWED');
    }
    if (!input.streams?.some((s) => s.codec_type === 'audio')) {
      throw new AppException('FILE_TYPE_NOT_ALLOWED');
    }

    try {
      await execFileAsync(
        options.ffmpegPath,
        [
          '-hide_banner', '-loglevel', 'error', '-y',
          '-i', inputPath,
          '-vn', '-ac', '1', '-c:a', 'aac', '-b:a', '64k',
          '-movflags', '+faststart', '-f', 'mp4',
          outputPath,
        ],
        { timeout: TOOL_TIMEOUT_MS },
      );
    } catch {
      throw new AppException('FILE_TYPE_NOT_ALLOWED');
    }

    const output = await probe(options.ffprobePath, outputPath);
    const durationSeconds = Number(output.format?.duration);
    if (!Number.isFinite(durationSeconds) || durationSeconds < VOICE_MIN_SECONDS) {
      throw new AppException('VOICE_TOO_SHORT');
    }
    if (durationSeconds > options.maxSeconds + VOICE_TOLERANCE_SECONDS) {
      throw new AppException('VOICE_TOO_LONG', { maxSeconds: options.maxSeconds });
    }

    const { size } = await stat(outputPath);
    return {
      path: outputPath,
      mimeType: 'audio/mp4',
      durationSeconds: Math.round(durationSeconds * 100) / 100,
      sizeBytes: size,
    };
  } catch (error) {
    await rm(outputPath, { force: true });
    throw error;
  } finally {
    await rm(inputPath, { force: true });
  }
}
