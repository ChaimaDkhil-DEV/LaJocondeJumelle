import { createBrowserRouter, type RouteObject } from 'react-router';
import { ChangePasswordPage } from '../features/auth/ChangePasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireAuth } from '../features/auth/RequireAuth';
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
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
