import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { MessageSquarePlus, MessagesSquare } from 'lucide-react';
import { Link as RouterLink, Navigate, useParams } from 'react-router';
import { loadErrorMessage } from '../../api/client';
import { uploadFile } from '../../api/uploads';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { UserAvatar } from '../../components/UserAvatar';
import { icon } from '../../design/tokens';
import { t } from '../../i18n';
import {
  fullName,
  useMessageConversation,
  useTeacherConversation,
  useTeacherConversations,
  useTeacherReply,
  type GuardianRef,
  type TeacherConversation,
} from './api';
import {
  ChatHeader,
  ChatShell,
  ConversationBubble,
  ConversationLink,
  DayList,
  MessageComposer,
  MessageScroller,
} from './ChatParts';

/**
 * « Communication avec les parents » (015) : conversations de l'enseignant, une par élève et par
 * représentant. Ses messages affichent leur état de modération ; ceux des parents n'apparaissent
 * qu'une fois validés par l'administration. Chaque réponse est à nouveau validée avant d'être transmise.
 */

const HOME = '/communications-parents';
export const teacherConversationPath = (studentId: string, guardianId: string) =>
  `/communications-parents/conversation/${studentId}/${guardianId}`;

const guardianLabel = (g: GuardianRef) =>
  `${fullName(g)}${g.relationship ? ` (${g.relationship})` : ''}`;

export function TeacherCommunicationsPage() {
  const { studentId, guardianId } = useParams();
  const open = Boolean(studentId && guardianId);
  const create = (
    <Button
      component={RouterLink}
      to="/communications-parents/nouvelle"
      variant="contained"
      startIcon={<MessageSquarePlus size={icon.sm} aria-hidden="true" />}
    >
      {t('Nouvelle communication')}
    </Button>
  );
  return (
    <Box>
      <PageHeader
        title={t('Communication avec les parents')}
        description={t(
          'Échangez avec les parents de vos élèves. Chaque message, dans les deux sens, est validé par l’administration avant d’être transmis.',
        )}
        actions={create}
      />
      <ChatShell
        detailOpen={open}
        list={<TeacherConversationList selectedKey={open ? `${studentId}.${guardianId}` : null} />}
        detail={
          open ? (
            <TeacherThread studentId={studentId!} guardianId={guardianId!} />
          ) : (
            <Box sx={{ m: 'auto', px: 2 }}>
              <EmptyState
                icon={MessagesSquare}
                title={t('Sélectionnez une conversation')}
                description={t(
                  'Choisissez une conversation à gauche, ou créez une communication pour l’un de vos élèves.',
                )}
              />
            </Box>
          )
        }
      />
    </Box>
  );
}

function TeacherConversationList({ selectedKey }: { selectedKey: string | null }) {
  const list = useTeacherConversations();
  if (list.isPending) return <LoadingState label={t('Chargement des conversations')} />;
  if (list.error)
    return (
      <Box sx={{ p: 2 }}>
        <ErrorState
          message={loadErrorMessage(list.error, t('les conversations'))}
          actionLabel={t('Réessayer')}
          onAction={() => void list.refetch()}
        />
      </Box>
    );
  if (list.data.length === 0)
    return (
      <EmptyState
        compact
        icon={MessagesSquare}
        title={t('Aucune conversation')}
        description={t('Créez une communication pour l’un de vos élèves.')}
      />
    );
  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <Box
        component="ul"
        aria-label={t('Conversations')}
        sx={{ listStyle: 'none', m: 0, p: 0.75, display: 'grid', gap: 0.25 }}
      >
        {list.data.map((c) => (
          <ConversationLink
            key={c.key}
            to={teacherConversationPath(c.student.id, c.guardian.id)}
            avatar={<UserAvatar name={fullName(c.guardian)} id={c.guardian.id} size="lg" neutral />}
            title={guardianLabel(c.guardian)}
            subtitle={`${fullName(c.student)} · ${c.student.class.name}`}
            preview={`${c.lastMessage.author === 'TEACHER' ? t('Vous : ') : ''}${c.lastMessage.preview}`}
            when={c.lastMessage.sentAt}
            unread={c.unread}
            selected={selectedKey === `${c.student.id}.${c.guardian.id}`}
          />
        ))}
      </Box>
    </Box>
  );
}

function TeacherThread({ studentId, guardianId }: { studentId: string; guardianId: string }) {
  const conversation = useTeacherConversation(studentId, guardianId);
  if (conversation.isPending)
    return (
      <Box sx={{ m: 'auto' }}>
        <LoadingState label={t('Chargement de la conversation')} />
      </Box>
    );
  if (conversation.error)
    return (
      <Box sx={{ m: 'auto', p: 2 }}>
        <ErrorState
          message={loadErrorMessage(conversation.error, t('la conversation'))}
          actionLabel={t('Réessayer')}
          onAction={() => void conversation.refetch()}
        />
      </Box>
    );
  return <Thread key={conversation.data.key} conversation={conversation.data} />;
}

function Thread({ conversation: c }: { conversation: TeacherConversation }) {
  const toast = useToast();
  const reply = useTeacherReply(c.student.id, c.guardian.id);
  const parentName = guardianLabel(c.guardian);
  // Conversation commencée (un de ses messages déjà soumis, ou un message reçu) : vocal facultatif.
  const started = c.messages.some((m) => !m.own || m.revision !== null);
  return (
    <>
      <ChatHeader
        backTo={HOME}
        avatar={<UserAvatar name={fullName(c.guardian)} id={c.guardian.id} size="lg" neutral />}
        title={parentName}
        subtitle={t('Élève : {name} · {className}', {
          name: fullName(c.student),
          className: c.student.class.name,
        })}
      />
      <MessageScroller count={c.messages.length}>
        {c.messages.length === 0 ? (
          <EmptyState
            compact
            icon={MessagesSquare}
            title={t('Aucun message')}
            description={t('Écrivez votre premier message à {name}.', { name: parentName })}
          />
        ) : (
          <DayList
            items={c.messages}
            label={t('Messages de la conversation')}
            dateOf={(m) => m.sentAt}
            render={(m) => (
              <ConversationBubble
                message={m}
                authorLabel={m.own ? t('Vous') : parentName}
                actions={
                  m.own && (m.status === 'DRAFT' || m.status === 'RETURNED_FOR_CORRECTION') ? (
                    <Box>
                      <Button
                        size="small"
                        variant="outlined"
                        component={RouterLink}
                        to={`/communications-parents/${m.id}`}
                      >
                        {m.status === 'DRAFT' ? t('Continuer le brouillon') : t('Corriger')}
                      </Button>
                    </Box>
                  ) : undefined
                }
              />
            )}
          />
        )}
      </MessageScroller>
      <MessageComposer
        requireVoice={!started}
        hint={
          started
            ? t(
                'Le vocal est facultatif pour une réponse. Votre message est validé par l’administration avant d’être transmis au parent.',
              )
            : t(
                'Remarque écrite et message vocal obligatoires. Votre message est validé par l’administration avant d’être transmis au parent.',
              )
        }
        onSend={async ({ text, recording }) => {
          const voice = recording
            ? await uploadFile('VOICE', recording.blob, 'message-vocal.webm')
            : null;
          await reply.mutateAsync({ text, voiceFileId: voice?.id ?? null });
          toast.success(t('Message soumis à l’administration.'));
        }}
      />
    </>
  );
}

/** Lien vers un message (notification) : ouvre sa conversation. */
export function TeacherMessageRedirect() {
  const { id = '' } = useParams();
  const target = useMessageConversation<{ studentId: string; guardianId: string }>(
    id,
    (messageId) => `/api/parent-communications/messages/${messageId}/conversation`,
  );
  if (target.isPending) return <LoadingState label={t('Chargement du message')} />;
  if (target.error)
    return (
      <ErrorState
        message={loadErrorMessage(target.error, t('le message'))}
        actionLabel={t('Réessayer')}
        onAction={() => void target.refetch()}
      />
    );
  return (
    <Navigate to={teacherConversationPath(target.data.studentId, target.data.guardianId)} replace />
  );
}
