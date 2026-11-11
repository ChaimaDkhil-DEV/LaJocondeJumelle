import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import { Badge } from '../../components/Badge';
import { UserAvatar } from '../../components/UserAvatar';
import { t } from '../../i18n';
import {
  TYPE_LABELS,
  fullName,
  usePostMessage,
  type ConversationDetail,
  type ConversationSummary,
  type Space,
} from './api';
import {
  ChatHeader,
  ConversationBubble,
  DayList,
  MessageComposer,
  MessageScroller,
} from './ChatParts';

/** Interlocuteur affiché selon l'espace : l'école pour le parent, l'administration pour l'enseignant. */
export function counterpart(space: Space, c: ConversationSummary): string {
  if (space === 'parent')
    return c.type === 'LEGACY_TEACHER_PARENT'
      ? (c.lastMessage?.authorLabel ?? t('Archive'))
      : t('L’école');
  if (space === 'teacher') return t('Administration');
  if (c.type === 'INTERNAL') return c.teacher?.displayName ?? t('Enseignant');
  if (c.guardian) return fullName(c.guardian);
  return c.teacher?.displayName ?? '';
}

const HINTS: Record<Space, string> = {
  teacher: t(
    'Votre message part directement à l’administration. Un vocal suffit ; vous pouvez ajouter un texte.',
  ),
  parent: t(
    'Votre message part directement à l’école. Un vocal suffit ; vous pouvez ajouter un texte.',
  ),
  admin: t('Un vocal, un texte, ou les deux.'),
};

/** Raison pour laquelle on ne peut plus écrire, dite clairement (FR-006, D3). */
function readOnlyNotice(c: ConversationDetail): string {
  if (c.type === 'LEGACY_TEACHER_PARENT')
    return t(
      'Archive en lecture seule : ces échanges datent d’avant la nouvelle messagerie. Commencez une nouvelle conversation pour écrire.',
    );
  if (c.status === 'CLOSED')
    return t('Conversation clôturée par l’administration. Elle reste consultable.');
  return t(
    'Vous ne pouvez plus écrire dans cette conversation : l’élève ne vous est plus rattaché.',
  );
}

/**
 * Conversation ouverte, commune aux trois espaces : en-tête (élève, classe, interlocuteur, type), bulles
 * par jour, lecteur audio intégré, saisie quand l'écriture est permise.
 */
export function ConversationView({
  space,
  conversation: c,
  backTo,
  actions,
  submitLabel,
}: {
  space: Space;
  conversation: ConversationDetail;
  backTo: string;
  /** Actions de l'administration (prise en charge, clôture, « Contacter le parent »). */
  actions?: ReactNode;
  /** Libellé du bouton d'envoi (« Envoyer pour validation » vers un parent sans envoi direct). */
  submitLabel?: string;
}) {
  const post = usePostMessage(space, c.id);
  const other = counterpart(space, c);
  return (
    <>
      <ChatHeader
        backTo={backTo}
        avatar={<UserAvatar name={fullName(c.student)} id={c.student.id} size="md" />}
        title={fullName(c.student)}
        subtitle={
          <Box
            component="span"
            sx={{ display: 'inline-flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}
          >
            <span>
              {c.student.class.name} · {other}
            </span>
            {space !== 'parent' && (
              <Badge
                tone={c.type === 'INTERNAL' ? 'info' : c.type === 'PARENT' ? 'success' : 'neutral'}
              >
                {TYPE_LABELS[c.type]}
              </Badge>
            )}
            {c.status === 'CLOSED' && c.type !== 'LEGACY_TEACHER_PARENT' && (
              <Badge tone="neutral">{t('Clôturée')}</Badge>
            )}
          </Box>
        }
        aside={actions}
      />
      <MessageScroller count={c.messages.length}>
        <DayList
          items={c.messages}
          dateOf={(m) => m.createdAt}
          label={t('Messages')}
          render={(m) => (
            <ConversationBubble message={m} showStatus={m.mine || space === 'admin'} />
          )}
        />
      </MessageScroller>
      {c.canPost ? (
        <MessageComposer
          hint={HINTS[space]}
          submitLabel={submitLabel}
          onSend={async (input) => {
            await post.mutateAsync(input);
          }}
        />
      ) : (
        <Alert severity="info" sx={{ m: { xs: 1.25, sm: 2 } }}>
          {readOnlyNotice(c)}
        </Alert>
      )}
    </>
  );
}
