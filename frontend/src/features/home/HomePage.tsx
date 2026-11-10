import { lazy, Suspense } from 'react';
import { LoadingState } from '../../components/LoadingState';
import { t } from '../../i18n';
import { useCurrentUser } from '../auth/useCurrentUser';
import { ParentMessagesPage } from '../parent-communications/ParentMessagesPage';
import { RequestListPage } from '../requests/RequestListPage';
import { hasTeacherHome } from './access';
import { TeacherHomePage } from './TeacherHomePage';

// Chargée à la demande : les graphiques (Recharts) ne pèsent que sur le tableau de bord.
const DashboardPage = lazy(() => import('../admin/DashboardPage').then((m) => ({ default: m.DashboardPage })));

/**
 * Page d'accueil (`/`) : le tableau de bord de supervision pour le super administrateur (seul rôle
 * autorisé par `/api/admin/dashboard`), l'accueil de l'enseignant (016 : scan, demandes rapides, suivi),
 * « Mes demandes » pour tous les autres rôles.
 */
export function HomePage() {
  const me = useCurrentUser();
  if (me.isPending) return <LoadingState />;
  // Compte parent (015) : son seul espace est « Messages de l'école ».
  if (me.data?.role === 'PARENT') return <ParentMessagesPage />;
  if (hasTeacherHome(me.data)) return <TeacherHomePage />;
  if (me.data?.role !== 'SUPER_ADMIN') return <RequestListPage />;
  return (
    <Suspense fallback={<LoadingState label={t('Chargement du tableau de bord')} />}>
      <DashboardPage />
    </Suspense>
  );
}
