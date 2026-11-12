import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useSearchParams } from 'react-router';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { t } from '../../i18n';
import { useConversation } from './api';
import { ChatShell } from './ChatParts';
import { TeacherConversationList } from './ConversationList';
import { ConversationView } from './ConversationView';
import { NewMessagePanel } from './NewMessagePanel';

const ROOT = '/communications';
const NEW = 'nouveau';
const href = (id: string) => `${ROOT}?conversation=${encodeURIComponent(id)}`;

function OpenConversation({ id }: { id: string }) {
  const conversation = useConversation('teacher', id);
  if (conversation.isPending) return <LoadingState variant="detail" />;
  if (conversation.isError)
    return (
      <ErrorState
        message={t('Cette conversation est introuvable ou ne vous est pas accessible.')}
      />
    );
  return (
    <ConversationView
      space="teacher"
      conversation={conversation.data}
      backTo={ROOT}
      placeholder={t('Répondre à l’administration…')}
    />
  );
}

/**
 * « Communications » de l'enseignant : une seule page à deux panneaux. À gauche les conversations ;
 * à droite la conversation choisie (`?conversation=<id>`) ou, par défaut, le nouveau message, prêt
 * à écrire. Sous 900 px, un seul panneau à la fois : la liste d'abord.
 */
export function TeacherCommunications() {
  const [params, setParams] = useSearchParams();
  const conversationId = params.get('conversation');
  const composing = params.has(NEW);
  const desktop = useMediaQuery(useTheme().breakpoints.up('md'));

  return (
    <ChatShell
      listWidth={340}
      height={780}
      detailOpen={Boolean(conversationId) || composing}
      detailLabel={conversationId ? t('Conversation') : t('Nouveau message')}
      list={
        <TeacherConversationList
          selectedId={conversationId}
          hrefOf={href}
          onNew={() => setParams({ [NEW]: '' })}
        />
      }
      detail={
        conversationId ? (
          <OpenConversation key={conversationId} id={conversationId} />
        ) : (
          <NewMessagePanel
            // Un nouveau formulaire, vide, à chaque « Nouveau message ».
            key={composing ? 'new' : 'default'}
            backTo={ROOT}
            focusOnOpen={desktop || composing}
            onCreated={(id) => setParams({ conversation: id })}
          />
        )
      }
    />
  );
}
