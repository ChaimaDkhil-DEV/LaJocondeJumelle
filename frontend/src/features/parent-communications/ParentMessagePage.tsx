import { Navigate, useParams } from 'react-router';
import { loadErrorMessage } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { t } from '../../i18n';
import { useMessageConversation } from './api';
import { parentConversationPath } from './ParentMessagesPage';

/**
 * Lien vers un message (notification, ancienne adresse « /messages-ecole/:id ») : ouvre sa
 * conversation, où il est lu (la lecture est notée par le serveur).
 */
export function ParentMessagePage() {
  const { id = '' } = useParams();
  const target = useMessageConversation<{ teacherId: string; studentId: string }>(
    id,
    (messageId) => `/api/parent/messages/${messageId}/conversation`,
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
    <Navigate to={parentConversationPath(target.data.teacherId, target.data.studentId)} replace />
  );
}
