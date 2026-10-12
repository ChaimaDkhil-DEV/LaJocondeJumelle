/**
 * Choix du format d'enregistrement (research R2) : WebM/Opus (Chrome, Firefox, Edge),
 * puis MP4/AAC (Safari, iOS), puis Ogg/Opus. Le serveur convertit tout en AAC/MP4.
 */
export const PREFERRED_FORMATS = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'] as const;

export function isRecordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

export function pickRecorderFormat(): string | null {
  if (!isRecordingSupported()) return null;
  return PREFERRED_FORMATS.find((format) => MediaRecorder.isTypeSupported(format)) ?? null;
}

/** Extension de fichier correspondant au format, pour le téléversement. */
export function extensionFor(mimeType: string): string {
  if (mimeType.startsWith('audio/mp4')) return 'm4a';
  if (mimeType.startsWith('audio/ogg')) return 'ogg';
  return 'webm';
}

/** « 0:05 », « 2:30 ». */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
