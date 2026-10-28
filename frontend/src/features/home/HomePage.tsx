import { lazy, Suspense } from 'react';
import { LoadingState } from '../../components/LoadingState';
import { useCurrentUser } from '../auth/useCurrentUser';
import { RequestListPage } from '../requests/RequestListPage';

// Chargée à la demande : les graphiques (Recharts) ne pèsent que sur le tableau de bord.
const DashboardPage = lazy(() => import('../admin/DashboardPage').then((m) => ({ default: m.DashboardPage })));

/**
 * Page d'accueil (`/`) : le tableau de bord de supervision pour le super administrateur (seul rôle
 * autorisé par `/api/admin/dashboard`), « Mes demandes » pour tous les autres rôles.
 */
export function HomePage() {
  const me = useCurrentUser();
  if (me.isPending) return <LoadingState />;
  if (me.data?.role !== 'SUPER_ADMIN') return <RequestListPage />;
  return (
    <Suspense fallback={<LoadingState label="Chargement du tableau de bord" />}>
      <DashboardPage />
    </Suspense>
  );
}
