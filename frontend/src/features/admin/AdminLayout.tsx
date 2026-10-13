import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { NavLink, Outlet } from 'react-router';
import { LoadingState } from '../../components/LoadingState';
import { useCurrentUser } from '../auth/useCurrentUser';

const SECTIONS = [
  { to: '/admin/comptes', label: 'Comptes' },
  { to: '/admin/categories', label: 'Catégories' },
  { to: '/admin/reglages', label: 'Réglages' },
  { to: '/admin/journal', label: 'Journal d’audit' },
];

/** Administration (US8) : réservée au super administrateur ; le serveur refuse aussi tout autre rôle. */
export function AdminLayout() {
  const me = useCurrentUser();
  if (me.isPending) return <LoadingState />;
  if (me.data?.role !== 'SUPER_ADMIN') {
    return (
      <Alert severity="error" role="alert" sx={{ my: 2 }}>
        Accès réservé au super administrateur.
      </Alert>
    );
  }

  return (
    <Box>
      <Typography component="h1" variant="h5" gutterBottom>
        Administration
      </Typography>
      <Box
        component="nav"
        aria-label="Sections de l’administration"
        sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}
      >
        {SECTIONS.map((section) => (
          <Button
            key={section.to}
            component={NavLink}
            to={section.to}
            variant="outlined"
            sx={{ '&.active': { bgcolor: 'primary.main', color: 'primary.contrastText' } }}
          >
            {section.label}
          </Button>
        ))}
      </Box>
      <Outlet />
    </Box>
  );
}
