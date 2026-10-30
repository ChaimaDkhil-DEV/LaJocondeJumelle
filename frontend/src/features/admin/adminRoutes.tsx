import { Navigate, useLocation, type RouteObject } from 'react-router';
import { ClassesAdminPage } from '../coverage/ClassesAdminPage';
import { CoverageDashboardPage } from '../coverage/CoverageDashboardPage';
import { FloorsAdminPage } from '../coverage/FloorsAdminPage';
import { GroupsAdminPage } from '../coverage/GroupsAdminPage';
import { StudentsAdminPage } from '../students/StudentsAdminPage';
import { AdminLayout } from './AdminLayout';
import { AuditLogPage } from './AuditLogPage';
import { CategoriesAdminPage } from './CategoriesAdminPage';
import { GuidelinesAdminPage } from './GuidelinesAdminPage';
import { SettingsAdminPage } from './SettingsAdminPage';
import { UsersAdminPage } from './UsersAdminPage';

/** Ancienne adresse du tableau de bord, devenu la page d'accueil : la vue choisie (`?vue=`) est conservée. */
function DashboardMoved() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/', search }} replace />;
}

/** Routes /admin/* (super administrateur uniquement). */
export const adminRoutes: RouteObject[] = [
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <Navigate to="comptes" replace /> },
      { path: 'tableau-de-bord', element: <DashboardMoved /> },
      { path: 'comptes', element: <UsersAdminPage /> },
      { path: 'categories', element: <CategoriesAdminPage /> },
      { path: 'consignes', element: <GuidelinesAdminPage /> },
      { path: 'reglages', element: <SettingsAdminPage /> },
      { path: 'journal', element: <AuditLogPage /> },
      // Affectations : suivi et données de référence (groupes, étages, classes).
      { path: 'suivi', element: <CoverageDashboardPage /> },
      { path: 'groupes', element: <GroupsAdminPage /> },
      { path: 'etages', element: <FloorsAdminPage /> },
      { path: 'classes', element: <ClassesAdminPage /> },
      { path: 'eleves', element: <StudentsAdminPage /> },
    ],
  },
];
