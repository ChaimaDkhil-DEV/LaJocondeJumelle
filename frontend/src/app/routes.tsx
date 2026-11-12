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
import { TrackingListPage } from '../features/home/TrackingListPage';
import { TeacherRequestPage } from '../features/coverage/TeacherRequestPage';
import { QrEntryPage } from '../features/attendance/QrEntryPage';
import { CreateRequestPage } from '../features/requests/CreateRequestPage';
import { RequestDetailPage } from '../features/requests/RequestDetailPage';
import { DraftPage } from '../features/requests/DraftPage';
import { RequestListPage } from '../features/requests/RequestListPage';
import { MealServicesPage } from '../features/students/MealServicesPage';
import { CommunicationsPage } from '../features/parent-communications/CommunicationsPage';
import {
  CommunicationsLegacyRedirect,
  ParentMessageRedirect,
  TeacherLegacyRedirect,
  ValidationLegacyRedirect,
} from '../features/parent-communications/LegacyRedirects';
import { ParentMessagesPage } from '../features/parent-communications/ParentMessagesPage';
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
      // « Suivi de mes demandes » (016) : en attente, validées / traitées, archives.
      { path: 'demandes/suivi/:groupe', element: <TrackingListPage /> },
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
      // Communications (017) : enseignants et administration ; droits vérifiés par l'API.
      { path: 'communications', element: <CommunicationsPage /> },
      // Anciennes pages de l'administration → la page unique `/communications?vue=…`.
      { path: 'communications/nouveau', element: <CommunicationsLegacyRedirect to="nouveau" /> },
      {
        path: 'communications/conversations/:id?',
        element: <CommunicationsLegacyRedirect to="conversations" />,
      },
      { path: 'communications/boite/:id?', element: <CommunicationsLegacyRedirect to="boite" /> },
      {
        path: 'communications/a-valider/:id?',
        element: <CommunicationsLegacyRedirect to="valider" />,
      },
      // « Messages de l'école » : espace du parent.
      { path: 'messages-ecole', element: <ParentMessagesPage /> },
      { path: 'messages-ecole/nouvelle', element: <ParentMessagesPage mode="new" /> },
      { path: 'messages-ecole/conversations/:id', element: <ParentMessagesPage /> },
      // Anciennes adresses 015 (favoris, notifications déjà reçues).
      { path: 'communications-parents/*', element: <TeacherLegacyRedirect /> },
      { path: 'communications-parents', element: <TeacherLegacyRedirect /> },
      { path: 'communications-a-valider/:id?', element: <ValidationLegacyRedirect /> },
      {
        path: 'messages-ecole/conversation/:teacherId/:studentId',
        element: <ParentMessagesPage />,
      },
      { path: 'messages-ecole/:id', element: <ParentMessageRedirect /> },
      ...adminRoutes,
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
