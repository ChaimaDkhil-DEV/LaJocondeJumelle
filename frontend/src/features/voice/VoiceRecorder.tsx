import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import { Mic, RotateCcw, Square, Trash2 } from 'lucide-react';
import { font, icon, tokensOf } from '../../design/tokens';
import { formatDuration } from './recorderFormat';
import { useVoiceRecorder, type VoiceRecording } from './useVoiceRecorder';
import { useId } from 'react';
import { VoicePlayer } from './VoicePlayer';
import { DENIED_MESSAGE, ERROR_MESSAGE, UNSUPPORTED_MESSAGE } from './recorderMessages';
import { t } from '../../i18n';

export type { VoiceRecording } from './useVoiceRecorder';

interface VoiceRecorderProps {
  maxSeconds: number;
  value: VoiceRecording | null;
  onChange: (recording: VoiceRecording | null) => void;
  /** Demande en lecture seule : aucun enregistrement possible. */
  disabled?: boolean;
  /**
   * `hero` : un grand bouton rond au centre (« Appuyez pour parler ») ; le minuteur n'apparaît que
   * pendant l'enregistrement.
   */
  variant?: 'default' | 'hero';
}

/** Pastille rouge « enregistrement en cours » (immobile si l'utilisateur réduit les animations). */
const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
`;

/** Enregistrer, réécouter, refaire ou supprimer un message vocal avant l'envoi. */
export function VoiceRecorder({ maxSeconds, value, onChange, disabled = false, variant = 'default' }: VoiceRecorderProps) {
  const recorder = useVoiceRecorder({ maxSeconds, onRecorded: onChange });
  const captionId = useId();

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
            <Button variant="outlined" startIcon={<RotateCcw size={icon.sm} aria-hidden="true" />} disabled={disabled} onClick={discard}>
              {t('Refaire l’enregistrement')}
            </Button>
            <Button color="error" startIcon={<Trash2 size={icon.sm} aria-hidden="true" />} disabled={disabled} onClick={discard}>
              {t('Supprimer le message vocal')}
            </Button>
          </Box>
        </>
      ) : variant === 'hero' ? (
        <Box sx={{ display: 'grid', justifyItems: 'center', gap: 1, py: 1 }}>
          <ButtonBase
            aria-labelledby={captionId}
            aria-busy={recorder.state === 'requesting' || undefined}
            disabled={disabled || recorder.state === 'requesting'}
            onClick={() => {
              if (recorder.state === 'recording') {
                recorder.stop();
              } else {
                recorder.clearError();
                void recorder.start();
              }
            }}
            sx={(theme) => {
              const tk = tokensOf(theme);
              const recording = recorder.state === 'recording';
              return {
                width: 96,
                height: 96,
                borderRadius: '50%',
                color: '#fff',
                bgcolor: recording ? tk.error.main : tk.accent.main,
                boxShadow: recording ? `0 0 0 8px ${tk.error.soft}` : `0 0 0 8px ${tk.accent.soft}`,
                transition: 'background .15s, box-shadow .15s',
                '&:hover': { bgcolor: recording ? tk.error.text : tk.accent.hover },
                '&.Mui-disabled': { opacity: 0.5, color: '#fff' },
                '&.Mui-focusVisible': { outline: `3px solid ${tk.focus}`, outlineOffset: 4 },
              };
            }}
          >
            {recorder.state === 'recording' ? (
              <Square size={32} fill="currentColor" aria-hidden="true" />
            ) : (
              <Mic size={40} aria-hidden="true" />
            )}
          </ButtonBase>
          {recorder.state === 'recording' ? (
            <Typography
              id={captionId}
              sx={(theme) => ({ fontWeight: font.medium, color: tokensOf(theme).error.text, fontVariantNumeric: 'tabular-nums' })}
            >
              <Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                {t('Arrêter l’enregistrement')}{' '}
              </Box>
              <span aria-hidden="true">
                {formatDuration(recorder.elapsedSeconds)} / {formatDuration(maxSeconds)}
              </span>
              {recorder.nearLimit && (
                <Box component="span" sx={(theme) => ({ ml: 1, color: tokensOf(theme).warning.text })}>
                  {t('Plus que {n} secondes', { n: recorder.remainingSeconds })}
                </Box>
              )}
            </Typography>
          ) : (
            <Typography id={captionId} color="text.secondary" sx={{ fontWeight: font.medium }}>
              {t('Appuyez pour parler')}
            </Typography>
          )}
        </Box>
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
                {t('Plus que {n} secondes', { n: recorder.remainingSeconds })}
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
            {t('Arrêter l’enregistrement')}
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
            disabled={disabled}
            loading={recorder.state === 'requesting'}
            sx={(theme) => ({
              color: tokensOf(theme).accent.text,
              borderColor: tokensOf(theme).accent.border,
              bgcolor: tokensOf(theme).accent.soft,
              '&:hover': { bgcolor: tokensOf(theme).accent.soft, borderColor: tokensOf(theme).accent.main },
            })}
          >
            {t('Enregistrer un message vocal')}
          </Button>
          <Typography variant="body2" color="text.secondary">
            {t('Durée maximale : {duration}', { duration: formatDuration(maxSeconds) })}
          </Typography>
        </Box>
      )}

      <Typography role="status" aria-live="polite" variant="body2" color="text.secondary">
        {recorder.notice}
      </Typography>
    </Box>
  );
}
