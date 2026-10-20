import { createBrowserRouter, type RouteObject } from 'react-router';
import { adminRoutes } from '../features/admin/adminRoutes';
import { ChangePasswordPage } from '../features/auth/ChangePasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { CoverageDetailPage } from '../features/coverage/CoverageDetailPage';
import { CoveragePage } from '../features/coverage/CoveragePage';
import { TeacherRequestPage } from '../features/coverage/TeacherRequestPage';
import { PresencePage } from '../features/coverage/PresencePage';
import { CreateRequestPage } from '../features/requests/CreateRequestPage';
import { RequestDetailPage } from '../features/requests/RequestDetailPage';
import { RequestListPage } from '../features/requests/RequestListPage';
import { AppLayout } from './AppLayout';

export const routes: RouteObject[] = [
  { path: '/connexion', element: <LoginPage /> },
  { path: '/mot-de-passe', element: <ChangePasswordPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <RequestListPage /> },
      { path: 'demandes/nouvelle', element: <CreateRequestPage /> },
      { path: 'demandes/:id', element: <RequestDetailPage /> },
      // Couverture de classe (garde / remplacement).
      { path: 'gardes', element: <CoveragePage /> },
      { path: 'gardes/signaler', element: <TeacherRequestPage /> },
      { path: 'gardes/signalements/:id', element: <TeacherRequestPage /> },
      // Lien encodé dans le QR code de la classe : n'enregistre rien sans confirmation explicite.
      { path: 'gardes/presence', element: <PresencePage /> },
      { path: 'gardes/:id', element: <CoverageDetailPage /> },
      ...adminRoutes,
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
