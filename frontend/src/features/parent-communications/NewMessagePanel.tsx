import Box from '@mui/material/Box';
import { useRef, useState } from 'react';
import { useClientSettings } from '../../api/settings';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { useToast } from '../../components/Toast';
import { t } from '../../i18n';
import {
  useConversations,
  useStartConversation,
  useTeacherStudents,
  type ConversationSummary,
  type StudentRef,
} from './api';
import { ChatHeader, MessageComposer, MessageScroller } from './ChatParts';
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

/** Nouveau message de l'enseignant à l'administration, dans le panneau droit de « Communications ». */
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
  const field = useRef<HTMLTextAreaElement | null>(null);

  function choose(next: StudentRef | null) {
    setStudent(next);
    // L'élève choisi, on passe directement au message.
    if (next) requestAnimationFrame(() => field.current?.focus());
  }

  return (
    <>
      <ChatHeader backTo={backTo} title={t('Nouveau message')} subtitle={t('Administration')} />
      <MessageScroller count={0}>
        <Box sx={{ p: { xs: 1.5, sm: 2.5 } }}>
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
              onChange={choose}
              focusOnOpen={focusOnOpen}
            />
          )}
        </Box>
      </MessageScroller>
      <MessageComposer
        fieldRef={field}
        placeholder={t('Écrire votre message…')}
        requireContent
        ready={Boolean(student)}
        hint={t(
          'Le message part directement à l’administration. Un vocal suffit ; durée maximale : {duration}.',
          {
            duration: `${Math.floor(voiceMaxSeconds / 60)}:${String(voiceMaxSeconds % 60).padStart(2, '0')}`,
          },
        )}
        onSend={async (input) => {
          if (!student) throw new Error(t('Choisissez l’élève concerné.'));
          try {
            const created = await start.mutateAsync({ ...input, studentId: student.id });
            onCreated(created.id);
          } catch (e) {
            toast.error(t('Le message n’a pas pu être envoyé.'));
            throw e;
          }
        }}
      />
    </>
  );
}
