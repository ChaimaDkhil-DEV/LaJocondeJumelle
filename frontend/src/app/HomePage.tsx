import Typography from '@mui/material/Typography';
import { useCurrentUser } from '../features/auth/useCurrentUser';

/** Page d'accueil provisoire ; remplacée par la liste des demandes en Phase 3 (US1, T046). */
export function HomePage() {
  const me = useCurrentUser();
  return (
    <>
      <Typography component="h1" variant="h4" gutterBottom>
        Bonjour{me.data ? `, ${me.data.displayName}` : ''}
      </Typography>
      <Typography>Vos demandes de travail apparaîtront ici.</Typography>
    </>
  );
}
