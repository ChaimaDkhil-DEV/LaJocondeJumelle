import { createBrowserRouter, type RouteObject } from 'react-router';
import { adminRoutes } from '../features/admin/adminRoutes';
import { ChangePasswordPage } from '../features/auth/ChangePasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { ProfilePage } from '../features/auth/ProfilePage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { CoverageDetailPage } from '../features/coverage/CoverageDetailPage';
import { CoveragePage } from '../features/coverage/CoveragePage';
import { CoverageStatsPage } from '../features/coverage/CoverageStatsPage';
import { CreateCoveragePage } from '../features/coverage/CreateCoveragePage';
import { EmptyClassPage } from '../features/coverage/EmptyClassPage';
import { HomePage } from '../features/home/HomePage';
import { TeacherRequestPage } from '../features/coverage/TeacherRequestPage';
import { QrEntryPage } from '../features/attendance/QrEntryPage';
import { CreateRequestPage } from '../features/requests/CreateRequestPage';
import { RequestDetailPage } from '../features/requests/RequestDetailPage';
import { DraftPage } from '../features/requests/DraftPage';
import { RequestListPage } from '../features/requests/RequestListPage';
import { MealServicesPage } from '../features/students/MealServicesPage';
import { CommunicationEditorPage } from '../features/parent-communications/CommunicationEditorPage';
import { ParentMessagePage } from '../features/parent-communications/ParentMessagePage';
import { ParentMessagesPage } from '../features/parent-communications/ParentMessagesPage';
import { TeacherCommunicationsPage } from '../features/parent-communications/TeacherCommunicationsPage';
import { ValidationInboxPage } from '../features/parent-communications/ValidationInboxPage';
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
      // Accueil : tableau de bord (super administrateur) ou « Mes demandes » (autres rôles).
      { index: true, element: <HomePage /> },
      { path: 'demandes', element: <RequestListPage /> },
      { path: 'demandes/nouvelle', element: <CreateRequestPage /> },
      { path: 'demandes/:id/brouillon', element: <DraftPage /> },
      { path: 'demandes/:id', element: <RequestDetailPage /> },
      { path: 'profil', element: <ProfilePage /> },
      // Couverture de classe (garde / remplacement).
      { path: 'gardes', element: <CoveragePage /> },
      { path: 'gardes/signaler', element: <TeacherRequestPage /> },
      { path: 'gardes/classe-vide', element: <EmptyClassPage /> },
      { path: 'gardes/nouvelle', element: <CreateCoveragePage /> },
      { path: 'gardes/statistiques', element: <CoverageStatsPage /> },
      { path: 'gardes/signalements/:id', element: <TeacherRequestPage /> },
      // Lien encodé dans le QR code de la classe : n'enregistre rien sans confirmation explicite.
      { path: 'gardes/presence', element: <QrEntryPage /> },
      { path: 'gardes/:id', element: <CoverageDetailPage /> },
      // Service de restauration des élèves (rôles vérifiés par l'API).
      { path: 'restauration', element: <MealServicesPage /> },
      // Communication enseignant / parents (015) : droits vérifiés par l'API.
      { path: 'communications-parents', element: <TeacherCommunicationsPage /> },
      { path: 'communications-parents/nouvelle', element: <CommunicationEditorPage /> },
      { path: 'communications-parents/:id', element: <CommunicationEditorPage /> },
      // Messagerie : la liste des discussions et, avec un message désigné, sa discussion.
      { path: 'communications-a-valider/:id?', element: <ValidationInboxPage /> },
      { path: 'messages-ecole', element: <ParentMessagesPage /> },
      { path: 'messages-ecole/:id', element: <ParentMessagePage /> },
      ...adminRoutes,
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
