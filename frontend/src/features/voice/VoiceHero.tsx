import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import { Mic, Pause, Play, RotateCcw, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { visuallyHidden } from '../../components/a11y';
import { font, fontSize, tokensOf } from '../../design/tokens';
import { formatDuration } from './recorderFormat';
import { useVoiceRecorder, type VoiceRecording } from './useVoiceRecorder';

const DENIED_MESSAGE =
  'L’accès au micro a été refusé. Autorisez le micro pour ce site dans les réglages de votre navigateur, ' +
  'ou écrivez votre demande dans la description écrite.';
const UNSUPPORTED_MESSAGE =
  'Votre navigateur ne permet pas d’enregistrer un message vocal. Écrivez votre demande dans la description.';
const ERROR_MESSAGE =
  'Impossible d’accéder au micro. Vérifiez qu’il est branché et disponible, ou écrivez votre demande dans la description.';

/** Nombre de barres de la forme d'onde (elles se partagent la largeur disponible). */
const BARS = 36;
const BIG = 64;
const ROUND = 48;

/** Barres pendant l'enregistrement (immobiles si l'utilisateur réduit les animations). */
const bounce = keyframes`
  0%, 100% { transform: scaleY(0.35); }
  50% { transform: scaleY(1); }
`;

/** Hauteurs pseudo-aléatoires stables : forme d'onde de repli, ou animation d'enregistrement. */
function fallbackPeaks(seed: number): number[] {
  let x = seed % 2147483647 || 1;
  return Array.from({ length: BARS }, () => {
    x = (x * 16807) % 2147483647;
    return 0.25 + ((x % 1000) / 1000) * 0.75;
  });
}

/**
 * Forme d'onde réelle du vocal (pics d'amplitude), décodée dans le navigateur ; repli sur une forme
 * stable si le décodage n'est pas possible (navigateur, format). Purement décorative.
 */
function useWaveform(blob: Blob): number[] {
  const fallback = useMemo(() => fallbackPeaks(blob.size), [blob]);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    blob
      .arrayBuffer()
      .then((buffer) => context.decodeAudioData(buffer))
      .then((audio) => {
        const data = audio.getChannelData(0);
        const step = Math.max(1, Math.floor(data.length / BARS));
        const raw = Array.from({ length: BARS }, (_, i) => {
          let max = 0;
          for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j++) max = Math.max(max, Math.abs(data[j]));
          return max;
        });
        const top = Math.max(...raw, 0.01);
        if (!cancelled) setPeaks(raw.map((v) => 0.15 + (v / top) * 0.85));
      })
      .catch(() => undefined)
      .finally(() => void context.close().catch(() => undefined));
    return () => {
      cancelled = true;
    };
  }, [blob]);
  return peaks ?? fallback;
}

function Bars({ peaks, progress, animated }: { peaks: number[]; progress?: number; animated?: boolean }) {
  return (
    <Box
      aria-hidden="true"
      sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: { xs: '1px', sm: '2px' }, height: 28, width: '100%', minWidth: 0, overflow: 'hidden' }}
    >
      {peaks.map((h, i) => (
        <Box
          key={i}
          sx={(theme) => {
            const t = tokensOf(theme);
            const played = progress !== undefined && i / peaks.length < progress;
            return {
              flex: '1 1 0',
              minWidth: '1px',
              maxWidth: 4,
              height: `${Math.round(h * 100)}%`,
              borderRadius: 2,
              bgcolor: animated ? t.error.main : played ? t.accent.main : t.accent.border,
              ...(animated && {
                animation: `${bounce} ${0.8 + (i % 5) * 0.12}s ease-in-out ${(i % 7) * 0.07}s infinite`,
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              }),
            };
          }}
        />
      ))}
    </Box>
  );
}

/** Lecture du vocal enregistré : forme d'onde avec progression, curseur au clavier, bouton rond. */
function usePlayback(recording: VoiceRecording, onDiscard: () => void): PlaybackParts {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [playError, setPlayError] = useState<string | null>(null);
  const peaks = useWaveform(recording.blob);
  const duration = recording.durationSeconds;

  function toggle(): void {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    setPlayError(null);
    setPlaying(true);
    audio.play().catch(() => {
      setPlaying(false);
      setPlayError('Lecture impossible sur cet appareil. Essayez depuis un autre navigateur.');
    });
  }

  function seek(value: number): void {
    const audio = audioRef.current;
    if (audio) audio.currentTime = value;
    setPosition(value);
  }

  return {
    center: (
      <>
        {/* Vocaux produits par les utilisateurs : pas de sous-titres (déclaration de conformité partielle, FR-044). */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          ref={audioRef}
          src={recording.url}
          preload="metadata"
          onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
          onEnded={() => {
            setPlaying(false);
            setPosition(0);
          }}
          onPause={() => setPlaying(false)}
        />
        <Box sx={{ position: 'relative', minWidth: 0 }}>
          <Bars peaks={peaks} progress={duration > 0 ? position / duration : 0} />
          {/* Curseur accessible posé sur la forme d'onde : seul son repère est visible. */}
          <Slider
            size="small"
            min={0}
            max={Math.max(duration, 0.1)}
            step={0.1}
            value={Math.min(position, duration)}
            onChange={(_e, value) => seek(value as number)}
            aria-label="Position dans le message vocal"
            getAriaValueText={(v) => `${formatDuration(v)} sur ${formatDuration(duration)}`}
            sx={{
              position: 'absolute',
              inset: 0,
              p: '0 !important',
              height: '100%',
              color: 'transparent',
              '& .MuiSlider-rail, & .MuiSlider-track': { opacity: 0 },
              '& .MuiSlider-thumb': { width: 12, height: 12, bgcolor: 'primary.main', boxShadow: 'none' },
            }}
          />
        </Box>
        {playError && (
          <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
            {playError}
          </Typography>
        )}
        <Button
          size="small"
          color="error"
          aria-label="Supprimer le message vocal"
          onClick={onDiscard}
          // Rouge foncé : contraste ≥ 4,5:1 sur le fond indigo clair du bloc.
          sx={(theme) => ({ alignSelf: 'flex-start', minHeight: 44, px: 0.5, ml: -0.5, fontWeight: font.medium, color: tokensOf(theme).error.text })}
        >
          Supprimer
        </Button>
      </>
    ),
    play: (
      <IconButton
        onClick={toggle}
        aria-label={playing ? 'Mettre en pause le message vocal' : 'Lire le message vocal'}
        sx={(theme) => ({
          flex: 'none',
          width: ROUND,
          height: ROUND,
          borderRadius: '50%',
          bgcolor: 'background.paper',
          color: tokensOf(theme).accent.main,
          border: `1px solid ${tokensOf(theme).accent.border}`,
          '&:hover': { bgcolor: 'background.paper', color: tokensOf(theme).accent.main, borderColor: tokensOf(theme).accent.main },
        })}
      >
        {playing ? <Pause size={22} aria-hidden="true" /> : <Play size={22} aria-hidden="true" style={{ marginLeft: 2 }} />}
      </IconButton>
    ),
  };
}

interface PlaybackParts {
  center: ReactNode;
  play: ReactNode;
}

/** Lecteur propre à un enregistrement (clé = son URL) : un nouveau vocal repart de zéro. */
function PlaybackSlots({ recording, onDiscard, children }: { recording: VoiceRecording; onDiscard: () => void; children: (parts: PlaybackParts) => ReactNode }) {
  return <>{children(usePlayback(recording, onDiscard))}</>;
}

interface VoiceHeroProps {
  maxSeconds: number;
  value: VoiceRecording | null;
  onChange: (recording: VoiceRecording | null) => void;
}

/**
 * Message vocal au premier plan (« Nouvelle demande », maquette « Voix d'abord ») : grand bouton
 * rond d'enregistrement, état et forme d'onde au centre, lecture/pause à droite. Mêmes règles que
 * VoiceRecorder (durée maximale, avertissement, minimum d'une seconde) ; les annonces passent par
 * une région `status`, sans message volumineux à l'écran.
 */
export function VoiceHero({ maxSeconds, value, onChange }: VoiceHeroProps) {
  const recorder = useVoiceRecorder({ maxSeconds, onRecorded: onChange });
  const recordingPeaks = useMemo(() => fallbackPeaks(7), []);

  function discard(): void {
    if (value) URL.revokeObjectURL(value.url);
    onChange(null);
  }

  if (recorder.state === 'unsupported') return <Alert severity="info">{UNSUPPORTED_MESSAGE}</Alert>;

  const recording = recorder.state === 'recording';
  const bigButton = (theme: Parameters<typeof tokensOf>[0]) => ({
    flex: 'none',
    width: BIG,
    height: BIG,
    borderRadius: '50%',
    boxShadow: `0 4px 14px ${recording ? 'rgba(220, 38, 38, 0.30)' : 'rgba(79, 70, 229, 0.30)'}`,
    bgcolor: recording ? tokensOf(theme).error.main : tokensOf(theme).accent.main,
    color: '#fff',
    '&:hover': { bgcolor: recording ? tokensOf(theme).error.text : tokensOf(theme).accent.hover, color: '#fff' },
    '&.Mui-disabled': { bgcolor: tokensOf(theme).accent.main, color: '#fff', opacity: 0.7 },
  });

  const left = recording ? (
    <IconButton aria-label="Arrêter l’enregistrement" onClick={() => recorder.stop()} sx={bigButton}>
      <Square size={24} fill="currentColor" aria-hidden="true" />
    </IconButton>
  ) : value ? (
    <IconButton
      aria-label="Refaire l’enregistrement"
      onClick={discard}
      sx={(theme) => ({
        flex: 'none',
        width: BIG,
        height: BIG,
        borderRadius: '50%',
        bgcolor: 'background.paper',
        color: tokensOf(theme).accent.main,
        border: `2px solid ${tokensOf(theme).accent.border}`,
        '&:hover': { bgcolor: 'background.paper', color: tokensOf(theme).accent.main, borderColor: tokensOf(theme).accent.main },
      })}
    >
      <RotateCcw size={24} aria-hidden="true" />
    </IconButton>
  ) : (
    <IconButton
      aria-label="Enregistrer un message vocal"
      disabled={recorder.state === 'requesting'}
      onClick={() => {
        recorder.clearError();
        void recorder.start();
      }}
      sx={bigButton}
    >
      {recorder.state === 'requesting' ? <CircularProgress size={24} sx={{ color: '#fff' }} aria-hidden="true" /> : <Mic size={28} aria-hidden="true" />}
    </IconButton>
  );

  const titleSx = { fontWeight: font.medium, fontSize: { xs: fontSize.sm, sm: fontSize.md }, lineHeight: 1.3 } as const;
  const center = (play?: PlaybackParts) =>
    recording ? (
      <>
        <Typography sx={(theme) => ({ ...titleSx, color: tokensOf(theme).error.text, fontVariantNumeric: 'tabular-nums' })}>
          Enregistrement · {formatDuration(recorder.elapsedSeconds)} / {formatDuration(maxSeconds)}
        </Typography>
        <Bars peaks={recordingPeaks} animated />
        {recorder.nearLimit && (
          <Typography variant="body2" sx={(theme) => ({ color: tokensOf(theme).warning.text, fontWeight: font.medium })}>
            Plus que {recorder.remainingSeconds} secondes
          </Typography>
        )}
      </>
    ) : value && play ? (
      <>
        <Typography sx={{ ...titleSx, fontVariantNumeric: 'tabular-nums' }}>Message vocal · {formatDuration(value.durationSeconds)}</Typography>
        {play.center}
      </>
    ) : (
      <>
        <Typography sx={titleSx}>Appuyez pour enregistrer</Typography>
        <Typography variant="body2" color="text.secondary">
          Durée maximale {formatDuration(maxSeconds)}
        </Typography>
      </>
    );

  const row = (play?: PlaybackParts) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 2 } }}>
      {left}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>{center(play)}</Box>
      {play?.play}
    </Box>
  );

  return (
    <Box
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: 1.5,
        p: { xs: 1.5, sm: 2.5 },
        borderRadius: '14px',
        bgcolor: tokensOf(theme).accent.soft,
        border: `1px solid ${tokensOf(theme).accent.border}`,
      })}
    >
      {recorder.state === 'denied' && <Alert severity="warning">{DENIED_MESSAGE}</Alert>}
      {recorder.state === 'error' && <Alert severity="warning">{ERROR_MESSAGE}</Alert>}
      {recorder.error && <Alert severity="error">{recorder.error}</Alert>}
      {value && !recording ? (
        <PlaybackSlots key={value.url} recording={value} onDiscard={discard}>
          {(slots) => row(slots)}
        </PlaybackSlots>
      ) : (
        row()
      )}
      {/* Annonces (début, fin, durée) pour les lecteurs d'écran : rien de volumineux à l'écran. */}
      <Typography role="status" aria-live="polite" sx={visuallyHidden}>
        {recorder.notice}
      </Typography>
    </Box>
  );
}
