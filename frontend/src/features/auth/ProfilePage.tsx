import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { KeyRound } from 'lucide-react';
import { Link as RouterLink, useLocation } from 'react-router';
import type { Me } from '../../api/types';
import { PageHeader } from '../../components/PageHeader';
import { SectionCard } from '../../components/SectionCard';
import { font, icon } from '../../design/tokens';
import { ROLE_LABELS } from '../admin/labels';
import { useCurrentUser } from './useCurrentUser';

/** Groupes d'affectation (groupes à clé système) dont le compte est membre. */
function assignmentGroups(me: Me): string {
  const groups = [me.isSupervisor && 'Surveillants', me.isTeacher && 'Enseignants'].filter(Boolean);
  return groups.length > 0 ? groups.join(', ') : 'Aucun';
}

/**
 * « Mon profil » (spec 005) : informations du compte connecté, en lecture seule, et accès au
 * changement de mot de passe. Chargement et erreur : assurés par RequireAuth, qui ne rend la
 * page qu'une fois le compte chargé.
 */
export function ProfilePage() {
  const me = useCurrentUser();
  const location = useLocation();
  const passwordChanged = (location.state as { passwordChanged?: boolean } | null)?.passwordChanged === true;
  if (!me.data) return null;

  const rows: Array<[string, string]> = [
    ['Nom', me.data.displayName],
    ['Identifiant de connexion', me.data.username],
    ['Fonction', me.data.jobTitle ?? 'Non renseignée'],
    ['Rôle', ROLE_LABELS[me.data.role]],
    ['Groupes d’affectation', assignmentGroups(me.data)],
  ];

  return (
    <>
      <PageHeader title="Mon profil" />
      <Box sx={{ display: 'grid', gap: 2 }}>
        {passwordChanged && (
          <Alert severity="success" role="status">
            Mot de passe modifié. Vos autres sessions ont été fermées.
          </Alert>
        )}
        <SectionCard>
          <Box
            component="dl"
            sx={{
              m: 0,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'minmax(12rem, max-content) 1fr' },
              columnGap: 3,
              rowGap: { xs: 0.25, sm: 1.5 },
            }}
          >
            {rows.map(([term, value]) => (
              <Box key={term} sx={{ display: 'contents' }}>
                <Typography component="dt" variant="body2" color="text.secondary" sx={{ mt: { xs: 1.25, sm: 0 } }}>
                  {term}
                </Typography>
                <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: font.medium, overflowWrap: 'anywhere' }}>
                  {value}
                </Typography>
              </Box>
            ))}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Pour modifier ces informations, adressez-vous à l’administration.
          </Typography>
        </SectionCard>
        {/* Libellé identique au message de refus du serveur (users.service.ts, FR-013). */}
        <Box>
          <Button
            component={RouterLink}
            to="/mot-de-passe"
            variant="outlined"
            startIcon={<KeyRound size={icon.sm} aria-hidden="true" />}
          >
            Changer mon mot de passe
          </Button>
        </Box>
      </Box>
    </>
  );
}
