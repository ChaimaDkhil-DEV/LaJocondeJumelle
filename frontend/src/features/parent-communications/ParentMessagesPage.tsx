import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { MessageSquarePlus, MessagesSquare, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';
import { ApiError, loadErrorMessage } from '../../api/client';
import { uploadFile } from '../../api/uploads';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { UserAvatar } from '../../components/UserAvatar';
import { font, icon, motion, radius, tokensOf } from '../../design/tokens';
import { t } from '../../i18n';
import {
  fullName,
  useParentChildren,
  useParentConversation,
  useParentConversations,
  useParentMessageMutations,
  type ConversationMessage,
  type ParentChild,
  type ParentConversation,
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
 * « Messages de l'école » (015) : le parent retrouve ses conversations (une par enseignant et par
 * enfant), en démarre une avec un enseignant de la classe de son enfant, et écrit. Chaque message
 * est relu par l'administration avant d'être transmis ; les messages reçus sont déjà validés.
 */

const HOME = '/messages-ecole';
const NEW = '/messages-ecole/nouvelle';
export const parentConversationPath = (teacherId: string, studentId: string) =>
  `/messages-ecole/conversation/${teacherId}/${studentId}`;

/** `mode="new"` : route « /messages-ecole/nouvelle » (choix de l'enfant et de l'enseignant). */
export function ParentMessagesPage({ mode }: { mode?: 'new' }) {
  const { teacherId, studentId } = useParams();
  const choosing = mode === 'new';
  const open = Boolean(teacherId && studentId);
  return (
    <Box>
      <PageHeader
        title={t('Messages de l’école')}
        description={t(
          'Échangez avec les enseignants de vos enfants. Chaque message est relu par l’administration avant d’être transmis.',
        )}
        breadcrumb={false}
      />
      <ChatShell
        detailOpen={open || choosing}
        list={<ParentConversationList selectedKey={open ? `${teacherId}.${studentId}` : null} />}
        detail={
          open ? (
            <ParentThread teacherId={teacherId!} studentId={studentId!} />
          ) : choosing ? (
            <NewConversation />
          ) : (
            <Box sx={{ m: 'auto', px: 2 }}>
              <EmptyState
                icon={MessagesSquare}
                title={t('Sélectionnez une conversation')}
                description={t(
                  'Choisissez une conversation à gauche, ou écrivez à un enseignant de votre enfant.',
                )}
              />
            </Box>
          )
        }
      />
    </Box>
  );
}

// ------------------------------------------------------------------ Conversations

function ParentConversationList({ selectedKey }: { selectedKey: string | null }) {
  const list = useParentConversations();
  return (
    <>
      <Box sx={{ p: 2, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Button
          component={RouterLink}
          to={NEW}
          variant="contained"
          fullWidth
          startIcon={<MessageSquarePlus size={icon.sm} aria-hidden="true" />}
        >
          {t('Nouvelle conversation')}
        </Button>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {list.isPending ? (
          <LoadingState label={t('Chargement des conversations')} />
        ) : list.error ? (
          <Box sx={{ p: 2 }}>
            <ErrorState
              message={loadErrorMessage(list.error, t('les conversations'))}
              actionLabel={t('Réessayer')}
              onAction={() => void list.refetch()}
            />
          </Box>
        ) : list.data.length === 0 ? (
          <EmptyState
            compact
            icon={MessagesSquare}
            title={t('Aucune conversation')}
            description={t('Aucun message de l’école pour le moment.')}
          />
        ) : (
          <Box
            component="ul"
            aria-label={t('Conversations')}
            sx={{ listStyle: 'none', m: 0, p: 0.75, display: 'grid', gap: 0.25 }}
          >
            {list.data.map((c) => (
              <ConversationLink
                key={c.key}
                to={parentConversationPath(c.teacher.id, c.student.id)}
                avatar={<UserAvatar user={c.teacher} size="lg" />}
                title={c.teacher.displayName}
                subtitle={`${fullName(c.student)} · ${c.student.class.name}`}
                preview={`${c.lastMessage.author === 'PARENT' ? t('Vous : ') : ''}${c.lastMessage.preview}`}
                when={c.lastMessage.sentAt}
                unread={c.unread}
                selected={selectedKey === `${c.teacher.id}.${c.student.id}`}
              />
            ))}
          </Box>
        )}
      </Box>
    </>
  );
}

// ------------------------------------------------------------------ Nouvelle conversation

/** Choix de l'enfant, puis d'un enseignant réellement affecté à sa classe. */
function NewConversation() {
  const children = useParentChildren();
  const navigate = useNavigate();
  const [chosen, setChosen] = useState<string | null>(null);
  if (children.isPending)
    return (
      <Box sx={{ m: 'auto' }}>
        <LoadingState label={t('Chargement de vos enfants')} />
      </Box>
    );
  if (children.error)
    return (
      <Box sx={{ m: 'auto', p: 2 }}>
        <ErrorState
          message={loadErrorMessage(children.error, t('vos enfants'))}
          actionLabel={t('Réessayer')}
          onAction={() => void children.refetch()}
        />
      </Box>
    );
  const list = children.data;
  const child: ParentChild | undefined =
    list.find((c) => c.id === chosen) ?? (list.length === 1 ? list[0] : undefined);

  return (
    <>
      <ChatHeader
        backTo={HOME}
        title={t('Nouvelle conversation')}
        subtitle={t('Choisissez votre enfant, puis l’enseignant à qui écrire.')}
      />
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          p: { xs: 1.5, sm: 3 },
          display: 'grid',
          gap: 3,
          alignContent: 'start',
        }}
      >
        {list.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t('Aucun enfant rattaché')}
            description={t('Contactez l’administration pour rattacher vos enfants à votre compte.')}
          />
        ) : (
          <Box component="section" aria-labelledby="pm-enfant" sx={{ display: 'grid', gap: 1.25 }}>
            <Typography id="pm-enfant" variant="subtitle2" component="h3">
              {t('Votre enfant')}
            </Typography>
            <Box
              role="group"
              aria-labelledby="pm-enfant"
              sx={{
                display: 'grid',
                gap: 1,
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              }}
            >
              {list.map((c) => (
                <Choice
                  key={c.id}
                  pressed={child?.id === c.id}
                  onClick={() => setChosen(c.id)}
                  avatar={<UserAvatar name={fullName(c)} id={c.id} size="lg" neutral />}
                  title={fullName(c)}
                  subtitle={c.class.name}
                />
              ))}
            </Box>
          </Box>
        )}
        {child && (
          <Box
            component="section"
            aria-labelledby="pm-enseignant"
            sx={{ display: 'grid', gap: 1.25 }}
          >
            <Typography id="pm-enseignant" variant="subtitle2" component="h3">
              {t('Enseignants de {name}', { name: child.firstName })}
            </Typography>
            {child.teachers.length === 0 ? (
              <Typography color="text.secondary">
                {t('Aucun enseignant n’est encore affecté à la classe {className}.', {
                  className: child.class.name,
                })}
              </Typography>
            ) : (
              <Box
                component="ul"
                aria-labelledby="pm-enseignant"
                sx={{
                  listStyle: 'none',
                  m: 0,
                  p: 0,
                  display: 'grid',
                  gap: 1,
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                }}
              >
                {child.teachers.map((teacher) => (
                  <li key={teacher.id}>
                    <Choice
                      onClick={() => navigate(parentConversationPath(teacher.id, child.id))}
                      avatar={<UserAvatar user={teacher} size="lg" />}
                      title={teacher.displayName}
                      subtitle={teacher.jobTitle ?? t('Enseignant')}
                    />
                  </li>
                ))}
              </Box>
            )}
          </Box>
        )}
      </Box>
    </>
  );
}

function Choice({
  avatar,
  title,
  subtitle,
  pressed,
  onClick,
}: {
  avatar: ReactNode;
  title: string;
  subtitle: string;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-pressed={pressed}
      sx={(theme) => {
        const tk = tokensOf(theme);
        return {
          width: '100%',
          justifyContent: 'flex-start',
          textAlign: 'left',
          gap: 1.25,
          p: 1.25,
          borderRadius: `${radius.control}px`,
          border: `1px solid ${pressed ? tk.accent.border : tk.border}`,
          bgcolor: pressed ? tk.accent.soft : tk.surface,
          transition: `background-color ${motion.fast}ms ${motion.easing}`,
          '&:hover': { bgcolor: pressed ? tk.accent.soft : tk.surfaceMuted },
          '&.Mui-focusVisible': { outline: `2px solid ${tk.focus}`, outlineOffset: 2 },
        };
      }}
    >
      {avatar}
      <Box sx={{ minWidth: 0 }}>
        <Typography component="span" sx={{ display: 'block', fontWeight: font.semibold }} noWrap>
          {title}
        </Typography>
        <Typography
          component="span"
          variant="body2"
          color="text.secondary"
          sx={{ display: 'block' }}
          noWrap
        >
          {subtitle}
        </Typography>
      </Box>
    </ButtonBase>
  );
}

// ------------------------------------------------------------------ Conversation

function ParentThread({ teacherId, studentId }: { teacherId: string; studentId: string }) {
  const conversation = useParentConversation(teacherId, studentId);
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

const HINT = t(
  'Votre message est relu par l’administration avant d’être transmis à l’enseignant. Le vocal est facultatif.',
);

function Thread({ conversation: c }: { conversation: ParentConversation }) {
  const toast = useToast();
  const { send, resubmit, cancel } = useParentMessageMutations(c.teacher.id, c.student.id);
  const [editing, setEditing] = useState<ConversationMessage | null>(null);
  const [abandon, setAbandon] = useState<ConversationMessage | null>(null);

  async function upload(recording: { blob: Blob } | null): Promise<string | null> {
    return recording ? (await uploadFile('VOICE', recording.blob, 'message-vocal.webm')).id : null;
  }

  return (
    <>
      <ChatHeader
        backTo={HOME}
        avatar={<UserAvatar user={c.teacher} size="lg" />}
        title={c.teacher.displayName}
        subtitle={t('Au sujet de {name} · {className}', {
          name: fullName(c.student),
          className: c.student.class.name,
        })}
      />
      <MessageScroller count={c.messages.length}>
        {c.messages.length === 0 ? (
          <EmptyState
            compact
            icon={MessagesSquare}
            title={t('Nouvelle conversation')}
            description={t('Écrivez votre premier message à {name}.', {
              name: c.teacher.displayName,
            })}
          />
        ) : (
          <DayList
            items={c.messages}
            label={t('Messages de la conversation')}
            dateOf={(m) => m.sentAt}
            render={(m) => (
              <ConversationBubble
                message={m}
                authorLabel={m.own ? t('Vous') : c.teacher.displayName}
                actions={
                  m.own && m.status === 'RETURNED_FOR_CORRECTION' && c.canSend ? (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                      <Button size="small" variant="outlined" onClick={() => setEditing(m)}>
                        {t('Corriger')}
                      </Button>
                      <Button size="small" color="inherit" onClick={() => setAbandon(m)}>
                        {t('Abandonner')}
                      </Button>
                    </Box>
                  ) : undefined
                }
              />
            )}
          />
        )}
      </MessageScroller>
      {c.canSend ? (
        editing ? (
          <MessageComposer
            key={editing.id}
            initialText={editing.text ?? ''}
            submitLabel={t('Renvoyer pour validation')}
            hint={t('Le message corrigé est de nouveau relu par l’administration.')}
            onCancel={() => setEditing(null)}
            onSend={async ({ text, recording }) => {
              await resubmit.mutateAsync({
                id: editing.id,
                version: editing.version ?? 0,
                text,
                // Sans nouvel enregistrement, le vocal de la version retournée est conservé.
                voiceFileId: recording ? await upload(recording) : editing.voiceFileId,
              });
              setEditing(null);
              toast.success(t('Message corrigé, renvoyé à l’administration.'));
            }}
          />
        ) : (
          <MessageComposer
            hint={HINT}
            onSend={async ({ text, recording }) => {
              await send.mutateAsync({ text, voiceFileId: await upload(recording) });
              toast.success(t('Message envoyé à l’administration pour validation.'));
            }}
          />
        )
      ) : (
        <Typography
          color="text.secondary"
          variant="body2"
          sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}
        >
          {t(
            'Cet enseignant n’est plus affecté à la classe de votre enfant : la conversation est en lecture seule.',
          )}
        </Typography>
      )}
      <ConfirmDialog
        open={abandon !== null}
        title={t('Abandonner ce message ?')}
        confirmLabel={t('Abandonner')}
        cancelLabel={t('Garder')}
        pending={cancel.isPending}
        onConfirm={() => {
          if (!abandon) return;
          cancel.mutate(
            { id: abandon.id, version: abandon.version ?? 0 },
            {
              onSuccess: () => toast.success(t('Message abandonné.')),
              onError: (e) =>
                toast.error(e instanceof ApiError ? e.message : t('L’action a échoué.')),
              onSettled: () => setAbandon(null),
            },
          );
        }}
        onClose={() => setAbandon(null)}
      >
        {t('Il ne sera jamais transmis à l’enseignant.')}
      </ConfirmDialog>
    </>
  );
}
