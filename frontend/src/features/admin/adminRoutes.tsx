import type { ReactNode } from 'react';
import { Navigate, useLocation, type RouteObject } from 'react-router';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { t } from '../../i18n';
import { useCurrentUser } from '../auth/useCurrentUser';
import { ClassesAdminPage } from '../coverage/ClassesAdminPage';
import { CoverageDashboardPage } from '../coverage/CoverageDashboardPage';
import { FloorsAdminPage } from '../coverage/FloorsAdminPage';
import { GroupsAdminPage } from '../coverage/GroupsAdminPage';
import { LevelsAdminPage } from '../students/LevelsAdminPage';
import { StudentsAdminPage } from '../students/StudentsAdminPage';
import { isSuperAdmin } from './access';
import { AdminLayout } from './AdminLayout';
import { AuditLogPage } from './AuditLogPage';
import { CategoriesAdminPage } from './CategoriesAdminPage';
import { EmployeesAdminPage } from './EmployeesAdminPage';
import { GuidelinesAdminPage } from './GuidelinesAdminPage';
import { SettingsAdminPage } from './SettingsAdminPage';
import { UsersAdminPage } from './UsersAdminPage';

/** Ancienne adresse du tableau de bord, devenu la page d'accueil : la vue choisie (`?vue=`) est conservée. */
function DashboardMoved() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/', search }} replace />;
}

/** Section réservée au super administrateur : pour l'admin, message sans monter la page (aucun appel /api/admin). */
function SuperAdminOnly({ children }: { children: ReactNode }) {
  const me = useCurrentUser();
  if (me.isPending) return <LoadingState />;
  if (!isSuperAdmin(me.data)) return <ErrorState message={t('Accès réservé au super administrateur.')} />;
  return children;
}

/** Première section de l'espace : « Comptes » pour le super administrateur, « Étages » pour l'admin (011). */
function AdminIndex() {
  const me = useCurrentUser();
  return <Navigate to={isSuperAdmin(me.data) ? 'comptes' : 'etages'} replace />;
}

const reserved = (page: ReactNode) => <SuperAdminOnly>{page}</SuperAdminOnly>;

/**
 * Routes /admin/* : données de référence (étages, niveaux, classes, élèves) pour l'admin et le super
 * administrateur (011) ; les autres sections pour le super administrateur seulement. AdminLayout refuse
 * les autres rôles ; le serveur vérifie chaque route.
 */
export const adminRoutes: RouteObject[] = [
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <AdminIndex /> },
      { path: 'tableau-de-bord', element: reserved(<DashboardMoved />) },
      { path: 'comptes', element: reserved(<UsersAdminPage />) },
      { path: 'categories', element: reserved(<CategoriesAdminPage />) },
      { path: 'consignes', element: reserved(<GuidelinesAdminPage />) },
      { path: 'reglages', element: reserved(<SettingsAdminPage />) },
      { path: 'journal', element: reserved(<AuditLogPage />) },
      // Affectations : suivi et groupes (super administrateur), données de référence (étages, classes…).
      { path: 'suivi', element: reserved(<CoverageDashboardPage />) },
      { path: 'groupes', element: reserved(<GroupsAdminPage />) },
      { path: 'etages', element: <FloorsAdminPage /> },
      { path: 'niveaux', element: <LevelsAdminPage /> },
      { path: 'classes', element: <ClassesAdminPage /> },
      { path: 'eleves', element: <StudentsAdminPage /> },
      // Liste des employés en lecture seule (011) : admin ; le super administrateur garde « Comptes ».
      { path: 'employes', element: <EmployeesAdminPage /> },
    ],
  },
];
