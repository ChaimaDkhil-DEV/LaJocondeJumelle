import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router';
import { apiFetch } from '../../api/client';
import { LoadingState } from '../../components/LoadingState';

/**
 * Anciennes adresses 015 (favoris, notifications déjà reçues) : redirigées vers les écrans 017 (R11).
 */

/** « Communication avec les parents » de l'enseignant → ses conversations avec l'administration. */
export function TeacherLegacyRedirect() {
  return <Navigate to="/communications/conversations" replace />;
}

/** « Communications à valider » → « À valider ». */
export function ValidationLegacyRedirect() {
  const { id } = useParams();
  return (
    <Navigate to={id ? `/communications/a-valider/${id}` : '/communications/a-valider'} replace />
  );
}

/** Ancien lien d'un message (/messages-ecole/:id) → la conversation qui le porte, si le parent la lit. */
export function ParentMessageRedirect() {
  const { id } = useParams();
  const target = useQuery({
    queryKey: ['communications', 'by-message', id],
    queryFn: () => apiFetch<{ conversationId: string }>(`/api/parent/messages/by-message/${id}`),
    retry: false,
  });
  if (target.isPending) return <LoadingState />;
  return (
    <Navigate
      to={
        target.data
          ? `/messages-ecole/conversations/${target.data.conversationId}`
          : '/messages-ecole'
      }
      replace
    />
  );
}
