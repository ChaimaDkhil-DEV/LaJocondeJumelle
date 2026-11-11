import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import { MessageSquarePlus } from 'lucide-react';
import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { UserAvatar } from '../../components/UserAvatar';
import { icon } from '../../design/tokens';
import { t } from '../../i18n';
import {
  fullName,
  useConversation,
  useConversations,
  useParentChildren,
  useStartConversation,
} from './api';
import { ChatShell, ConversationLink, MessageComposer } from './ChatParts';
import { ConversationView, counterpart } from './ConversationView';

const BASE = '/messages-ecole';

/** Nouvelle conversation : l'enfant concerné d'abord, puis un vocal ou un texte (US4, FR-016). */
function NewConversation() {
  const navigate = useNavigate();
  const children = useParentChildren();
  const start = useStartConversation('parent');
  const [studentId, setStudentId] = useState('');
  if (children.isPending) return <LoadingState />;
  if (children.isError)
    return (
      <ErrorState
        message={t('Vos enfants n’ont pas pu être chargés.')}
        onAction={() => void children.refetch()}
      />
    );
  return (
    <Paper variant="outlined" sx={{ display: 'grid', gap: 2, p: { xs: 1.5, sm: 2.5 } }}>
      <FormControl>
        <FormLabel id="parent-child">{t('Votre enfant concerné')}</FormLabel>
        <RadioGroup
          aria-labelledby="parent-child"
          value={studentId}
          onChange={(e) => {
            setStudentId(e.target.value);
          }}
        >
          {children.data.map((child) => (
            <FormControlLabel
              key={child.id}
              value={child.id}
              control={<Radio />}
              label={`${fullName(child)} — ${child.class.name}`}
            />
          ))}
        </RadioGroup>
      </FormControl>
      <MessageComposer
        hint={t(
          'Votre message part directement à l’école. Un vocal suffit ; vous pouvez ajouter un texte.',
        )}
        onSend={async (input) => {
          if (!studentId) {
            throw new Error(t('Choisissez l’enfant concerné.'));
          }
          const created = await start.mutateAsync({ ...input, studentId });
          navigate(`${BASE}/conversations/${created.id}`);
        }}
      />
    </Paper>
  );
}

function OpenConversation({ id }: { id: string }) {
  const conversation = useConversation('parent', id);
  if (conversation.isPending) return <LoadingState variant="detail" />;
  if (conversation.isError)
    return <ErrorState message={t('Cette conversation est introuvable.')} />;
  return <ConversationView space="parent" conversation={conversation.data} backTo={BASE} />;
}

/**
 * « Messages de l'école » (015, 017) : seul espace d'un compte parent, aussi sa page d'accueil. Le parent
 * échange avec l'école (jamais avec un enseignant) au sujet de ses enfants.
 */
export function ParentMessagesPage({ mode }: { mode?: 'new' }) {
  const { id } = useParams();
  const list = useConversations('parent');
  const newButton = (
    <Button
      component={RouterLink}
      to={`${BASE}/nouvelle`}
      variant="contained"
      startIcon={<MessageSquarePlus size={icon.sm} aria-hidden="true" />}
    >
      {t('Nouvelle conversation')}
    </Button>
  );
  if (mode === 'new') {
    return (
      <>
        <PageHeader
          title={t('Nouvelle conversation')}
          back={{ to: BASE, label: t('Messages de l’école') }}
        />
        <NewConversation />
      </>
    );
  }
  const listNode = list.isPending ? (
    <LoadingState />
  ) : list.isError ? (
    <ErrorState
      message={t('Vos messages n’ont pas pu être chargés.')}
      onAction={() => void list.refetch()}
    />
  ) : list.data.length === 0 ? (
    <EmptyState
      compact
      title={t('Aucun message pour le moment')}
      description={t('Les messages de l’école apparaîtront ici.')}
    />
  ) : (
    <Box
      component="ul"
      aria-label={t('Conversations')}
      sx={{
        listStyle: 'none',
        m: 0,
        p: 0.75,
        display: 'grid',
        gap: 0.25,
        alignContent: 'start',
        overflowY: 'auto',
      }}
    >
      {list.data.map((c) => (
        <ConversationLink
          key={c.id}
          to={`${BASE}/conversations/${c.id}`}
          avatar={<UserAvatar name={fullName(c.student)} id={c.student.id} size="lg" />}
          title={fullName(c.student)}
          subtitle={`${counterpart('parent', c)} · ${c.student.class.name}`}
          preview={c.lastMessage?.excerpt ?? (c.lastMessage?.hasVoice ? t('Message vocal') : '')}
          when={c.lastMessage?.at ?? c.lastMessageAt}
          unread={c.unread}
          selected={c.id === id}
        />
      ))}
    </Box>
  );
  return (
    <>
      <PageHeader title={t('Messages de l’école')} actions={newButton} />
      <ChatShell
        list={listNode}
        detailOpen={Boolean(id)}
        detail={
          id ? (
            <OpenConversation id={id} />
          ) : (
            <EmptyState title={t('Choisissez une conversation')} />
          )
        }
      />
    </>
  );
}
