import { useQuery } from '@tanstack/react-query';
import { Navigate, useLocation, useParams } from 'react-router';
import { apiFetch } from '../../api/client';
import { LoadingState } from '../../components/LoadingState';
import { legacyCommunicationsUrl, type LegacyTarget } from './communicationsView';

/**
 * Anciennes adresses 015 (favoris, notifications déjà reçues) : redirigées vers les écrans 017 (R11).
 */

/** « Communication avec les parents » de l'enseignant → sa page « Communications ». */
export function TeacherLegacyRedirect() {
  return <Navigate to="/communications" replace />;
}

/** « Communications à valider » → l'onglet « À valider » de la page unique. */
export function ValidationLegacyRedirect() {
  const { id } = useParams();
  return <Navigate to={legacyCommunicationsUrl('valider', id, '')} replace />;
}

/**
 * Anciennes pages de l'administration (`/communications/boite`, `/conversations/:id`, `/a-valider/:id`,
 * `/nouveau?…`) → la page unique `/communications?vue=…`. Les liens et notifications déjà émis
 * continuent d'ouvrir la bonne conversation.
 */
export function CommunicationsLegacyRedirect({ to }: { to: LegacyTarget }) {
  const { id } = useParams();
  const { search } = useLocation();
  return <Navigate to={legacyCommunicationsUrl(to, id, search)} replace />;
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
