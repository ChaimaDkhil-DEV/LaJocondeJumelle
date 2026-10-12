import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import MicIcon from '@mui/icons-material/Mic';
import ReplayIcon from '@mui/icons-material/Replay';
import StopIcon from '@mui/icons-material/Stop';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
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
    <Stack spacing={1.5}>
      <Typography role="status" aria-live="polite" variant="body2" color="text.secondary">
        {recorder.notice}
      </Typography>

      {recorder.state === 'denied' && <Alert severity="warning">{DENIED_MESSAGE}</Alert>}
      {recorder.state === 'error' && <Alert severity="warning">{ERROR_MESSAGE}</Alert>}
      {recorder.error && <Alert severity="error">{recorder.error}</Alert>}

      {value ? (
        <>
          <VoicePlayer key={value.url} src={value.url} durationSeconds={value.durationSeconds} />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button variant="outlined" startIcon={<ReplayIcon aria-hidden="true" />} onClick={discard}>
              Refaire l’enregistrement
            </Button>
            <Button color="error" startIcon={<DeleteIcon aria-hidden="true" />} onClick={discard}>
              Supprimer le message vocal
            </Button>
          </Box>
        </>
      ) : recorder.state === 'recording' ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
          <Button
            variant="contained"
            color="error"
            size="large"
            startIcon={<StopIcon aria-hidden="true" />}
            onClick={recorder.stop}
          >
            Arrêter l’enregistrement
          </Button>
          <Typography aria-hidden="true">
            {formatDuration(recorder.elapsedSeconds)} / {formatDuration(maxSeconds)}
          </Typography>
          {recorder.nearLimit && (
            <Typography sx={{ color: 'warning.main', fontWeight: 600 }}>
              Plus que {recorder.remainingSeconds} secondes
            </Typography>
          )}
        </Box>
      ) : (
        <Box>
          <Button
            variant="contained"
            size="large"
            startIcon={<MicIcon aria-hidden="true" />}
            onClick={() => {
              recorder.clearError();
              void recorder.start();
            }}
            loading={recorder.state === 'requesting'}
          >
            Enregistrer un message vocal
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Durée maximale : {formatDuration(maxSeconds)}
          </Typography>
        </Box>
      )}
    </Stack>
  );
}
