import Alert from '@mui/material/Alert';
import type { ReactNode } from 'react';
import { UserAvatar } from '../../components/UserAvatar';
import { t } from '../../i18n';
import { useCurrentUser } from '../auth/useCurrentUser';
import {
  fullName,
  usePostMessage,
  type ConversationDetail,
  type ConversationSummary,
  type Message,
  type Space,
} from './api';
import { ChatHeader, ConversationBubble, DayList, MessageScroller, dayLabel } from './ChatParts';
import { ChatComposer } from './ChatComposer';

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

/** Nom seul de l'expéditeur d'un message reçu : « Administration » (sans le prénom) côté enseignant. */
function senderName(space: Space, m: Message): string {
  return space === 'teacher' && m.authorKind === 'ADMIN' ? t('Administration') : m.authorLabel;
}

/** Deux messages se suivent du même auteur, le même jour : ils forment un groupe (un seul avatar, un seul nom). */
function sameGroup(a: Message, b: Message): boolean {
  return (
    a.mine === b.mine &&
    a.authorKind === b.authorKind &&
    a.authorLabel === b.authorLabel &&
    dayLabel(a.createdAt) === dayLabel(b.createdAt)
  );
}

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
  placeholder,
}: {
  space: Space;
  conversation: ConversationDetail;
  backTo: string;
  /** Actions de l'administration (prise en charge, clôture, « Contacter le parent »). */
  actions?: ReactNode;
  /** Libellé du bouton d'envoi (« Envoyer pour validation » vers un parent sans envoi direct). */
  submitLabel?: string;
  placeholder?: string;
}) {
  const post = usePostMessage(space, c.id);
  const other = counterpart(space, c);
  const me = useCurrentUser().data;
  return (
    <>
      <ChatHeader backTo={backTo} title={other} aside={actions} />
      <MessageScroller count={c.messages.length}>
        <DayList
          items={c.messages}
          dateOf={(m) => m.createdAt}
          label={t('Messages')}
          render={(m, i) => {
            const prev = c.messages[i - 1];
            const next = c.messages[i + 1];
            const first = !prev || !sameGroup(prev, m);
            const last = !next || !sameGroup(m, next);
            const name = m.mine ? (me?.displayName ?? '') : senderName(space, m);
            return (
              <ConversationBubble
                message={m}
                showStatus={m.mine || space === 'admin'}
                senderName={first ? name : undefined}
                avatar={
                  last ? (
                    <UserAvatar name={name} id={m.mine ? me?.id : undefined} size={28} />
                  ) : null
                }
              />
            );
          }}
        />
      </MessageScroller>
      {c.canPost ? (
        <ChatComposer
          submitLabel={submitLabel}
          placeholder={placeholder}
          requireContent={space === 'teacher'}
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
