import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ApiError } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { useCurrentUser } from './useCurrentUser';

/**
 * Protège une route : sans session (401) → connexion ;
 * mot de passe à changer → page de changement ; sinon affiche le contenu.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const me = useCurrentUser();

  if (me.isPending) {
    return (
      <Box sx={{ maxWidth: 1120, mx: 'auto', p: { xs: 2, md: 4 } }}>
        <LoadingState label="Chargement de votre espace" variant="detail" />
      </Box>
    );
  }

  if (me.error) {
    if (me.error instanceof ApiError && me.error.status === 401) {
      // La recherche est conservée : le lien d'un QR code de classe (?c=…) doit survivre à la connexion.
      return <Navigate to="/connexion" replace state={{ from: location.pathname + location.search }} />;
    }
    if (me.error instanceof ApiError && me.error.code === 'PASSWORD_CHANGE_REQUIRED') {
      return <Navigate to="/mot-de-passe" replace />;
    }
    return (
      <Box sx={{ maxWidth: 640, mx: 'auto', p: 2 }}>
        <ErrorState
        message={me.error instanceof ApiError ? me.error.message : 'Impossible de charger votre profil.'}
        actionLabel="Réessayer"
          onAction={() => void me.refetch()}
        />
      </Box>
    );
  }

  if (me.data.mustChangePassword) return <Navigate to="/mot-de-passe" replace />;

  return <>{children}</>;
}
