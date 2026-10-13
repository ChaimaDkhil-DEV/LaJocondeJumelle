import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Slider from '@mui/material/Slider';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Pause, Play } from 'lucide-react';
import { useRef, useState } from 'react';
import { icon, tokensOf } from '../../design/tokens';
import { formatDuration } from './recorderFormat';

interface VoicePlayerProps {
  src: string;
  /** Durée connue (les WebM de MediaRecorder n'en déclarent pas toujours). */
  durationSeconds?: number;
}

/**
 * Lecteur audio accessible : élément <audio> natif piloté par des contrôles MUI
 * (lecture/pause, curseur utilisable au clavier, durée affichée).
 * Pour changer de fichier, l'appelant change la `key` du composant (état réinitialisé).
 */
export function VoicePlayer({ src, durationSeconds }: VoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [metadataDuration, setMetadataDuration] = useState(0);
  const [playError, setPlayError] = useState<string | null>(null);
  const duration = durationSeconds ?? metadataDuration;

  function toggle(): void {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      setPlayError(null);
      setPlaying(true);
      audio.play().catch(() => {
        setPlaying(false);
        setPlayError(
          'Lecture impossible sur cet appareil. Vérifiez votre connexion ou essayez depuis un autre navigateur.',
        );
      });
    }
  }

  function seek(value: number): void {
    const audio = audioRef.current;
    if (audio) audio.currentTime = value;
    setPosition(value);
  }

  const valueText = (value: number) => `${formatDuration(value)} sur ${formatDuration(duration)}`;
  const Icon = playing ? Pause : Play;

  return (
    <Box sx={{ maxWidth: 480 }}>
      <Box
        sx={(theme) => ({
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          minWidth: 0,
          py: 0.75,
          pl: 0.75,
          pr: 2,
          borderRadius: 1,
          border: `1px solid ${tokensOf(theme).border}`,
          bgcolor: tokensOf(theme).surfaceMuted,
        })}
      >
        {/* Vocaux produits par les utilisateurs : pas de sous-titres dans ce lot, déclaration de
          conformité partielle WCAG (spec FR-044) ; le titre de la demande en donne l'objet. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const value = e.currentTarget.duration;
            if (Number.isFinite(value) && value > 0) setMetadataDuration(value);
          }}
          onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
          onEnded={() => {
            setPlaying(false);
            setPosition(0);
          }}
          onPause={() => setPlaying(false)}
        />
        <Tooltip title={playing ? 'Pause' : 'Lire'}>
          <IconButton
            onClick={toggle}
            aria-label={playing ? 'Mettre en pause le message vocal' : 'Lire le message vocal'}
            sx={(theme) => ({
              flex: 'none',
              borderRadius: '50%',
              bgcolor: tokensOf(theme).accent.main,
              color: tokensOf(theme).accent.contrastText,
              '&:hover': { bgcolor: tokensOf(theme).accent.hover, color: tokensOf(theme).accent.contrastText },
            })}
          >
            <Icon size={icon.md} aria-hidden="true" />
          </IconButton>
        </Tooltip>
        <Slider
          size="small"
          min={0}
          max={Math.max(duration, 0.1)}
          step={0.1}
          value={Math.min(position, duration)}
          onChange={(_e, value) => seek(value as number)}
          aria-label="Position dans le message vocal"
          getAriaValueText={valueText}
          sx={{ flexGrow: 1, minWidth: 60 }}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
          aria-hidden="true"
        >
          {formatDuration(position)} / {formatDuration(duration)}
        </Typography>
      </Box>
      {playError && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {playError}
        </Alert>
      )}
    </Box>
  );
}
