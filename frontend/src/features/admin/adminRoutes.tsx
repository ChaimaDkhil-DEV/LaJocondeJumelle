import { Navigate, type RouteObject } from 'react-router';
import { ClassesAdminPage } from '../coverage/ClassesAdminPage';
import { CoverageDashboardPage } from '../coverage/CoverageDashboardPage';
import { GroupsAdminPage } from '../coverage/GroupsAdminPage';
import { AdminLayout } from './AdminLayout';
import { AuditLogPage } from './AuditLogPage';
import { CategoriesAdminPage } from './CategoriesAdminPage';
import { SettingsAdminPage } from './SettingsAdminPage';
import { UsersAdminPage } from './UsersAdminPage';

/** Routes /admin/* (super administrateur uniquement). */
export const adminRoutes: RouteObject[] = [
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <Navigate to="comptes" replace /> },
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
