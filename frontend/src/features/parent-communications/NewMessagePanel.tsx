import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useClientSettings } from '../../api/settings';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { useToast } from '../../components/Toast';
import { tokensOf } from '../../design/tokens';
import { t } from '../../i18n';
import { VoiceRecorder, type VoiceRecording } from '../voice/VoiceRecorder';
import {
  useConversations,
  useStartConversation,
  useTeacherStudents,
  type ConversationSummary,
  type StudentRef,
} from './api';
import { ChatHeader } from './ChatParts';
import { StudentCombobox } from './StudentCombobox';

/** Les 3 derniers élèves contactés, d'après les conversations (les plus récentes d'abord). */
function recentStudents(conversations: ConversationSummary[] | undefined): StudentRef[] {
  const seen = new Map<string, StudentRef>();
  for (const c of [...(conversations ?? [])].sort((a, b) =>
    b.lastMessageAt.localeCompare(a.lastMessageAt),
  )) {
    if (!seen.has(c.student.id)) seen.set(c.student.id, c.student);
    if (seen.size === 3) break;
  }
  return [...seen.values()];
}

/**
 * Nouveau message de l'enseignant à l'administration : un seul écran. L'élève, un grand bouton micro
 * (« Appuyez pour parler »), un texte facultatif, puis « Envoyer » fixé en bas : actif dès qu'il y a
 * un vocal ou un texte.
 */
export function NewMessagePanel({
  backTo,
  focusOnOpen,
  onCreated,
}: {
  backTo: string;
  focusOnOpen: boolean;
  onCreated: (conversationId: string) => void;
}) {
  const students = useTeacherStudents();
  const conversations = useConversations('teacher');
  const start = useStartConversation('teacher');
  const toast = useToast();
  const { voiceMaxSeconds } = useClientSettings();
  const [student, setStudent] = useState<StudentRef | null>(null);
  const [recording, setRecording] = useState<VoiceRecording | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmed = text.trim();
  const canSend = Boolean(student) && (Boolean(trimmed) || Boolean(recording)) && !busy;

  async function submit(): Promise<void> {
    if (!student || (!trimmed && !recording) || busy) return;
    setError(null);
    setBusy(true);
    try {
      const created = await start.mutateAsync({ text: trimmed, recording, studentId: student.id });
      onCreated(created.id);
    } catch (e) {
      toast.error(t('Le message n’a pas pu être envoyé.'));
      setError(e instanceof Error && e.message ? e.message : t('Le message n’a pas pu être envoyé.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ChatHeader backTo={backTo} title={t('Nouveau message')} subtitle={t('Administration')} />
      <Box
        component="form"
        aria-label={t('Nouveau message')}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gap: 2.5, alignContent: 'start', p: { xs: 2, sm: 3 } }}>
          <Typography variant="body2" color="text.secondary">
            {t('Envoyé directement à l’administration')}
          </Typography>
          {students.isPending ? (
            <LoadingState />
          ) : students.isError ? (
            <ErrorState
              message={t('Les élèves n’ont pas pu être chargés.')}
              onAction={() => void students.refetch()}
            />
          ) : (
            <StudentCombobox
              students={students.data}
              recent={recentStudents(conversations.data)}
              value={student}
              onChange={setStudent}
              focusOnOpen={focusOnOpen}
            />
          )}
          <VoiceRecorder
            variant="hero"
            maxSeconds={voiceMaxSeconds}
            value={recording}
            onChange={setRecording}
            disabled={busy}
          />
          <TextField
            multiline
            minRows={2}
            maxRows={6}
            label={t('Votre message (facultatif)')}
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
            slotProps={{ htmlInput: { maxLength: 2000, 'aria-label': t('Votre message') } }}
          />
          {error && (
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          )}
        </Box>
        <Box
          sx={(theme) => ({
            p: 1.5,
            pb: 'calc(12px + env(safe-area-inset-bottom))',
            borderTop: `1px solid ${tokensOf(theme).border}`,
            bgcolor: tokensOf(theme).surface,
          })}
        >
          <Button
            type="submit"
            variant="contained"
            fullWidth
            loading={busy}
            disabled={!canSend}
            sx={{ minHeight: 48 }}
          >
            {t('Envoyer')}
          </Button>
        </Box>
      </Box>
    </>
  );
}
