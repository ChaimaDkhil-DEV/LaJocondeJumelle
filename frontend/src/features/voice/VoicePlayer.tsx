import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import { useRef, useState } from 'react';
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

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
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
        <IconButton
          onClick={toggle}
          aria-label={playing ? 'Mettre en pause le message vocal' : 'Lire le message vocal'}
          color="primary"
        >
          {playing ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>
        <Slider
          size="small"
          min={0}
          max={Math.max(duration, 0.1)}
          step={0.1}
          value={Math.min(position, duration)}
          onChange={(_e, value) => seek(value as number)}
          aria-label="Position dans le message vocal"
          getAriaValueText={valueText}
          sx={{ flexGrow: 1, minWidth: 60, mx: 1 }}
        />
        <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }} aria-hidden="true">
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
