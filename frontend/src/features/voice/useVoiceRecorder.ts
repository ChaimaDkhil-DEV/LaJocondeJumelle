import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDuration, isRecordingSupported, pickRecorderFormat } from './recorderFormat';

export interface VoiceRecording {
  blob: Blob;
  url: string;
  mimeType: string;
  durationSeconds: number;
}

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'denied' | 'unsupported' | 'error';

/** Durée minimale d'un vocal, alignée sur le serveur. */
export const MIN_SECONDS = 1;
const TICK_MS = 200;
const WARN_RATIO = 0.8;

interface Options {
  maxSeconds: number;
  onRecorded: (recording: VoiceRecording) => void;
}

/**
 * Enregistrement avec MediaRecorder : avertissement à 80 % de la durée maximale,
 * arrêt automatique à 100 %, refus des enregistrements de moins d'une seconde.
 */
export function useVoiceRecorder({ maxSeconds, onRecorded }: Options) {
  const [state, setState] = useState<RecorderState>(() =>
    isRecordingSupported() && pickRecorderFormat() ? 'idle' : 'unsupported',
  );
  const [elapsedMs, setElapsedMs] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onRecordedRef = useRef(onRecorded);
  useEffect(() => {
    onRecordedRef.current = onRecorded;
  });

  const releaseMedia = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(
    (reason: 'user' | 'max' = 'user') => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') return;
      const durationMs = Math.min(Date.now() - startedAtRef.current, maxSeconds * 1000);
      const durationSeconds = Math.round(durationMs / 100) / 10;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event: BlobEvent | { data: Blob }) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        releaseMedia();
        recorderRef.current = null;
        setState('idle');
        setElapsedMs(0);
        if (durationSeconds < MIN_SECONDS) {
          setError('Le message est trop court (1 seconde minimum). Réessayez.');
          setNotice('');
          return;
        }
        const mimeType = recorder.mimeType || pickRecorderFormat() || 'audio/webm';
        const blob = new Blob(chunks, { type: mimeType });
        setNotice(
          reason === 'max'
            ? `Durée maximale atteinte : enregistrement arrêté (durée ${formatDuration(durationSeconds)}).`
            : `Enregistrement terminé (durée ${formatDuration(durationSeconds)}). Vous pouvez l’écouter avant l’envoi.`,
        );
        onRecordedRef.current({ blob, url: URL.createObjectURL(blob), mimeType, durationSeconds });
      };
      recorder.stop();
    },
    [maxSeconds, releaseMedia],
  );

  const start = useCallback(async () => {
    const format = pickRecorderFormat();
    if (!format) {
      setState('unsupported');
      return;
    }
    setError(null);
    setState('requesting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      setState(denied ? 'denied' : 'error');
      return;
    }
    streamRef.current = stream;
    const recorder = new MediaRecorder(stream, { mimeType: format });
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setNotice('Enregistrement en cours…');
    setState('recording');
    recorder.start();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      setElapsedMs(elapsed);
      if (elapsed >= maxSeconds * 1000) stop('max');
    }, TICK_MS);
  }, [maxSeconds, stop]);

  const clearError = useCallback(() => setError(null), []);

  useEffect(
    () => () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      releaseMedia();
    },
    [releaseMedia],
  );

  const elapsedSeconds = elapsedMs / 1000;
  const remainingSeconds = Math.max(0, Math.ceil(maxSeconds - elapsedSeconds));
  return {
    state,
    elapsedSeconds,
    remainingSeconds,
    nearLimit: state === 'recording' && elapsedSeconds >= maxSeconds * WARN_RATIO,
    notice,
    error,
    start,
    stop: () => stop('user'),
    clearError,
  };
}
