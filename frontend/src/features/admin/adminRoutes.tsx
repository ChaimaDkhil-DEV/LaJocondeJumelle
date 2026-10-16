import { lazy, Suspense } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import { LoadingState } from '../../components/LoadingState';
import { ClassesAdminPage } from '../coverage/ClassesAdminPage';
import { CoverageDashboardPage } from '../coverage/CoverageDashboardPage';
import { GroupsAdminPage } from '../coverage/GroupsAdminPage';
import { AdminLayout } from './AdminLayout';
import { AuditLogPage } from './AuditLogPage';
import { CategoriesAdminPage } from './CategoriesAdminPage';
import { SettingsAdminPage } from './SettingsAdminPage';
import { UsersAdminPage } from './UsersAdminPage';

// Chargée à la demande : les graphiques (Recharts) ne pèsent que sur cet écran ; le menu de
// l'administration s'affiche pendant le chargement.
const DashboardPage = lazy(() => import('./DashboardPage').then((m) => ({ default: m.DashboardPage })));

/** Routes /admin/* (super administrateur uniquement). */
export const adminRoutes: RouteObject[] = [
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <Navigate to="comptes" replace /> },
      {
        path: 'tableau-de-bord',
        element: (
          <Suspense fallback={<LoadingState label="Chargement du tableau de bord" />}>
            <DashboardPage />
          </Suspense>
        ),
      },
      { path: 'comptes', element: <UsersAdminPage /> },
      { path: 'categories', element: <CategoriesAdminPage /> },
      { path: 'reglages', element: <SettingsAdminPage /> },
      { path: 'journal', element: <AuditLogPage /> },
      // Couverture de classe : suivi des employés et données de référence.
      { path: 'suivi', element: <CoverageDashboardPage /> },
      { path: 'groupes', element: <GroupsAdminPage /> },
      { path: 'classes', element: <ClassesAdminPage /> },
    ],
  },
];
