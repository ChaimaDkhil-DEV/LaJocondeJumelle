import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppException } from '../../src/common/errors';
import { processVoice } from '../../src/files/voice-processing';

/** T031 — vérification par ffprobe et conversion systématique en AAC mono / MP4 (research R2). */
describe('processVoice', () => {
  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
  const fixtures = join(__dirname, '..', 'fixtures', 'audio');
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'ljj-voice-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  function input(name: string): string {
    const path = join(workDir, `upload-${name}`);
    copyFileSync(join(fixtures, name), path);
    return path;
  }

  function probe(path: string): { codec: string; channels: number; format: string } {
    const out = JSON.parse(
      execFileSync(ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', path]).toString(),
    );
    return { codec: out.streams[0].codec_name, channels: out.streams[0].channels, format: out.format.format_name };
  }

  it.each(['sample.webm', 'sample.mp4', 'sample.ogg'])(
    'convertit %s en audio/mp4 AAC mono lisible, et supprime le fichier d’origine',
    async (name) => {
      const source = input(name);
      const result = await processVoice(source, { ffmpegPath, ffprobePath, maxSeconds: 180 });

      expect(result.mimeType).toBe('audio/mp4');
      expect(result.durationSeconds).toBeGreaterThan(1.8);
      expect(result.durationSeconds).toBeLessThan(2.3);
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(probe(result.path)).toMatchObject({ codec: 'aac', channels: 1 });
      expect(probe(result.path).format).toContain('mp4');
      expect(existsSync(source)).toBe(false);
    },
  );

  it('refuse un vocal de moins d’une seconde (VOICE_TOO_SHORT) et nettoie les fichiers', async () => {
    const source = input('silence-0.5s.webm');
    await expect(processVoice(source, { ffmpegPath, ffprobePath, maxSeconds: 180 })).rejects.toMatchObject({
      code: 'VOICE_TOO_SHORT',
    });
    expect(readdirSync(workDir)).toEqual([]);
  });

  it('refuse un vocal dépassant voiceMaxSeconds + 2 s de tolérance (VOICE_TOO_LONG)', async () => {
    const source = input('too-long.webm');
    await expect(processVoice(source, { ffmpegPath, ffprobePath, maxSeconds: 180 })).rejects.toMatchObject({
      code: 'VOICE_TOO_LONG',
    });
    expect(readdirSync(workDir)).toEqual([]);
  });

  it('accepte un vocal dans la tolérance de 2 s', async () => {
    const source = input('sample.webm');
    await expect(processVoice(source, { ffmpegPath, ffprobePath, maxSeconds: 1 })).resolves.toMatchObject({
      mimeType: 'audio/mp4',
    });
  });

  it('refuse un fichier qui n’est pas de l’audio (FILE_TYPE_NOT_ALLOWED)', async () => {
    const source = input('not-audio.webm');
    const error = await processVoice(source, { ffmpegPath, ffprobePath, maxSeconds: 180 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect(error).toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED' });
    expect(readdirSync(workDir)).toEqual([]);
  });
});
