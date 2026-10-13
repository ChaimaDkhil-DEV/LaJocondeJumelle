import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import { Mic, RotateCcw, Square, Trash2 } from 'lucide-react';
import { font, icon, tokensOf } from '../../design/tokens';
import { formatDuration } from './recorderFormat';
import { useVoiceRecorder, type VoiceRecording } from './useVoiceRecorder';
import { VoicePlayer } from './VoicePlayer';

export type { VoiceRecording } from './useVoiceRecorder';

interface VoiceRecorderProps {
  maxSeconds: number;
  value: VoiceRecording | null;
  onChange: (recording: VoiceRecording | null) => void;
}

const DENIED_MESSAGE =
  'L’accès au micro a été refusé. Autorisez le micro pour ce site dans les réglages de votre navigateur, ' +
  'ou écrivez votre demande dans la description écrite.';
const UNSUPPORTED_MESSAGE =
  'Votre navigateur ne permet pas d’enregistrer un message vocal. Écrivez votre demande dans la description.';
const ERROR_MESSAGE =
  'Impossible d’accéder au micro. Vérifiez qu’il est branché et disponible, ou écrivez votre demande dans la description.';

/** Pastille rouge « enregistrement en cours » (immobile si l'utilisateur réduit les animations). */
const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
`;

/** Enregistrer, réécouter, refaire ou supprimer un message vocal avant l'envoi. */
export function VoiceRecorder({ maxSeconds, value, onChange }: VoiceRecorderProps) {
  const recorder = useVoiceRecorder({ maxSeconds, onRecorded: onChange });

  function discard(): void {
    if (value) URL.revokeObjectURL(value.url);
    onChange(null);
  }

  if (recorder.state === 'unsupported') {
    return <Alert severity="info">{UNSUPPORTED_MESSAGE}</Alert>;
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      {recorder.state === 'denied' && <Alert severity="warning">{DENIED_MESSAGE}</Alert>}
      {recorder.state === 'error' && <Alert severity="warning">{ERROR_MESSAGE}</Alert>}
      {recorder.error && <Alert severity="error">{recorder.error}</Alert>}

      {value ? (
        <>
          <VoicePlayer key={value.url} src={value.url} durationSeconds={value.durationSeconds} />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button variant="outlined" startIcon={<RotateCcw size={icon.sm} aria-hidden="true" />} onClick={discard}>
              Refaire l’enregistrement
            </Button>
            <Button color="error" startIcon={<Trash2 size={icon.sm} aria-hidden="true" />} onClick={discard}>
              Supprimer le message vocal
            </Button>
          </Box>
        </>
      ) : recorder.state === 'recording' ? (
        <Box
          sx={(theme) => ({
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 2,
            p: 1.5,
            borderRadius: 1,
            border: `1px solid ${tokensOf(theme).error.border}`,
            bgcolor: tokensOf(theme).error.soft,
          })}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: '1 1 160px' }}>
            <Box
              aria-hidden="true"
              sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'error.main', animation: `${pulse} 1.2s ease-in-out infinite` }}
            />
            <Typography
              aria-hidden="true"
              sx={(theme) => ({ fontWeight: font.medium, color: tokensOf(theme).error.text, fontVariantNumeric: 'tabular-nums' })}
            >
              {formatDuration(recorder.elapsedSeconds)} / {formatDuration(maxSeconds)}
            </Typography>
            {recorder.nearLimit && (
              <Typography variant="body2" sx={(theme) => ({ color: tokensOf(theme).warning.text, fontWeight: font.medium })}>
                Plus que {recorder.remainingSeconds} secondes
              </Typography>
            )}
          </Box>
          <Button
            variant="contained"
            color="error"
            size="large"
            startIcon={<Square size={icon.sm} fill="currentColor" aria-hidden="true" />}
            onClick={recorder.stop}
          >
            Arrêter l’enregistrement
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
          <Button
            variant="outlined"
            size="large"
            startIcon={<Mic size={icon.md} aria-hidden="true" />}
            onClick={() => {
              recorder.clearError();
              void recorder.start();
            }}
            loading={recorder.state === 'requesting'}
            sx={(theme) => ({
              color: tokensOf(theme).accent.text,
              borderColor: tokensOf(theme).accent.border,
              bgcolor: tokensOf(theme).accent.soft,
              '&:hover': { bgcolor: tokensOf(theme).accent.soft, borderColor: tokensOf(theme).accent.main },
            })}
          >
            Enregistrer un message vocal
          </Button>
          <Typography variant="body2" color="text.secondary">
            Durée maximale : {formatDuration(maxSeconds)}
          </Typography>
        </Box>
      )}

      <Typography role="status" aria-live="polite" variant="body2" color="text.secondary">
        {recorder.notice}
      </Typography>
    </Box>
  );
}
