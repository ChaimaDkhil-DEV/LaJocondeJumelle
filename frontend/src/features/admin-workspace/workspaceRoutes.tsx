import type { RouteObject } from 'react-router';
import { CollaborationPage } from './CollaborationPage';
import { CommonQueuePage } from './CommonQueuePage';
import { OwnedRequestsPage } from './OwnedRequestsPage';
import { OwnershipHistoryPage } from './OwnershipHistoryPage';
import { WorkspaceDashboardPage } from './WorkspaceDashboardPage';
import { WorkspaceLayout } from './WorkspaceLayout';

/**
 * Routes /espace/* : espace de travail de l'administrateur (018). WorkspaceLayout refuse les autres
 * rôles ; le serveur vérifie chaque route /api/admin/requests et /api/admin/assignments.
 */
export const workspaceRoutes: RouteObject[] = [
  {
    path: '/espace',
    element: <WorkspaceLayout />,
    children: [
      { index: true, element: <WorkspaceDashboardPage /> },
      { path: 'file', element: <CommonQueuePage /> },
      { path: 'mes-demandes', element: <OwnedRequestsPage key="all" scope="all" /> },
      { path: 'en-cours', element: <OwnedRequestsPage key="active" scope="active" /> },
      { path: 'terminees', element: <OwnedRequestsPage key="finished" scope="finished" /> },
      { path: 'collaboration', element: <CollaborationPage /> },
      { path: 'historique', element: <OwnershipHistoryPage /> },
    ],
  },
];
