import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Mic, Send, Square, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { font, tokensOf } from '../../design/tokens';
import { t } from '../../i18n';
import { useClientSettings } from '../../api/settings';
import { formatDuration } from '../voice/recorderFormat';
import { useVoiceRecorder, type VoiceRecording } from '../voice/useVoiceRecorder';
import { DENIED_MESSAGE, ERROR_MESSAGE, UNSUPPORTED_MESSAGE } from '../voice/recorderMessages';
import { VoicePlayer } from '../voice/VoicePlayer';

const MESSAGE_MAX = 2000;
const TARGET = 44;

/**
 * Zone de saisie d'une conversation ouverte : champ texte, micro et envoi sur une seule ligne, collée en
 * bas de l'écran. Pendant l'enregistrement, le micro devient « Arrêter » et le minuteur (0:00 / durée
 * maximale) apparaît au-dessus ; un vocal enregistré se réécoute et se supprime avant l'envoi.
 * `onSend` renvoie une promesse : la saisie est vidée si elle réussit.
 */
export function ChatComposer({
  onSend,
  submitLabel = t('Envoyer'),
  placeholder,
  requireContent = false,
}: {
  onSend: (input: { text: string; recording: VoiceRecording | null }) => Promise<void>;
  submitLabel?: string;
  placeholder?: string;
  /** « Envoyer » reste désactivé tant qu'il n'y a ni texte ni vocal. */
  requireContent?: boolean;
}) {
  const { voiceMaxSeconds } = useClientSettings();
  const [text, setText] = useState('');
  const [recording, setRecording] = useState<VoiceRecording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const recorder = useVoiceRecorder({ maxSeconds: voiceMaxSeconds, onRecorded: setRecording });
  const recordingNow = recorder.state === 'recording';

  const empty = !text.trim() && !recording;
  const blocked = recordingNow || (requireContent && empty);

  function discard(): void {
    if (recording) URL.revokeObjectURL(recording.url);
    setRecording(null);
  }

  async function submit(): Promise<void> {
    if (busy || recordingNow) return;
    const trimmed = text.trim();
    if (!trimmed && !recording) {
      setError(t('Écrivez un message ou enregistrez un message vocal avant d’envoyer.'));
      field.current?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSend({ text: trimmed, recording });
      setText('');
      setRecording(null);
    } catch (e) {
      setError(
        e instanceof Error && e.message ? e.message : t('Le message n’a pas pu être envoyé.'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box
      component="form"
      aria-label={submitLabel}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      sx={(theme) => ({
        display: 'grid',
        gap: 1,
        px: 1.25,
        pt: 1,
        pb: 'calc(8px + env(safe-area-inset-bottom))',
        bgcolor: tokensOf(theme).surface,
        borderTop: `1px solid ${tokensOf(theme).border}`,
      })}
    >
      {recorder.state === 'unsupported' && <Alert severity="info">{UNSUPPORTED_MESSAGE}</Alert>}
      {recorder.state === 'denied' && <Alert severity="warning">{DENIED_MESSAGE}</Alert>}
      {recorder.state === 'error' && <Alert severity="warning">{ERROR_MESSAGE}</Alert>}
      {recorder.error && <Alert severity="error">{recorder.error}</Alert>}

      {recordingNow && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            aria-hidden="true"
            sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'error.main' }}
          />
          <Typography
            aria-hidden="true"
            sx={(theme) => ({
              fontWeight: font.medium,
              color: tokensOf(theme).error.text,
              fontVariantNumeric: 'tabular-nums',
            })}
          >
            {formatDuration(recorder.elapsedSeconds)} / {formatDuration(voiceMaxSeconds)}
          </Typography>
          {recorder.nearLimit && (
            <Typography
              variant="body2"
              sx={(theme) => ({ color: tokensOf(theme).warning.text, fontWeight: font.medium })}
            >
              {t('Plus que {n} secondes', { n: recorder.remainingSeconds })}
            </Typography>
          )}
        </Box>
      )}
      {recording && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <VoicePlayer key={recording.url} src={recording.url} durationSeconds={recording.durationSeconds} />
          </Box>
          <IconButton
            aria-label={t('Supprimer le message vocal')}
            onClick={discard}
            disabled={busy}
            sx={{ width: TARGET, height: TARGET }}
          >
            <Trash2 size={20} aria-hidden="true" />
          </IconButton>
        </Box>
      )}
      <Typography role="status" aria-live="polite" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {recorder.notice}
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
        <TextField
          inputRef={field}
          placeholder={placeholder ?? t('Votre message')}
          multiline
          minRows={1}
          maxRows={5}
          size="small"
          value={text}
          disabled={busy}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            // Ctrl+Entrée (Cmd+Entrée sur Mac) envoie le message.
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          slotProps={{ htmlInput: { 'aria-label': t('Votre message'), maxLength: MESSAGE_MAX } }}
          sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: '22px', minHeight: TARGET } }}
        />
        {recordingNow ? (
          <IconButton
            aria-label={t('Arrêter l’enregistrement')}
            onClick={recorder.stop}
            sx={{ width: TARGET, height: TARGET, bgcolor: 'error.main', color: 'error.contrastText', '&:hover': { bgcolor: 'error.dark' } }}
          >
            <Square size={18} fill="currentColor" aria-hidden="true" />
          </IconButton>
        ) : (
          <IconButton
            aria-label={t('Enregistrer un message vocal')}
            disabled={busy || Boolean(recording) || recorder.state === 'unsupported'}
            onClick={() => {
              recorder.clearError();
              void recorder.start();
            }}
            sx={(theme) => ({ width: TARGET, height: TARGET, color: tokensOf(theme).accent.main })}
          >
            <Mic size={22} aria-hidden="true" />
          </IconButton>
        )}
        <IconButton
          type="submit"
          aria-label={submitLabel}
          disabled={blocked || busy}
          sx={(theme) => ({
            width: TARGET,
            height: TARGET,
            bgcolor: tokensOf(theme).accent.main,
            color: tokensOf(theme).accent.contrastText,
            '&:hover': { bgcolor: tokensOf(theme).accent.hover },
            '&.Mui-disabled': { bgcolor: tokensOf(theme).surfaceMuted, color: tokensOf(theme).textMuted },
          })}
        >
          <Send size={20} aria-hidden="true" />
        </IconButton>
      </Box>
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
    </Box>
  );
}
