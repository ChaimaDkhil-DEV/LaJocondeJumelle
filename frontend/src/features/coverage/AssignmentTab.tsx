import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { UserPlus } from 'lucide-react';
import { Link as RouterLink } from 'react-router';
import { SectionHeader } from '../../components/SectionHeader';
import { t } from '../../i18n';
import { ManagedCoverageTab, MergeProposalsTab, TeamTab } from './ManagerViews';

/**
 * « Affectation des surveillants » (012, research R2) : ce qu'il faut assigner (anciens onglets « En attente »,
 * « Doublons », « Équipe »), dans un seul onglet. Chaque partie a un titre (h2) et un identifiant
 * (`a-assigner`, `doublons`, `equipe`) pour qu'un lien puisse y mener ; les composants sont inchangés.
 */
export function AssignmentTab() {
  return (
    <Box sx={{ display: 'grid', gap: 4 }}>
      <Box component="section" aria-labelledby="a-assigner">
        <SectionHeader
          id="a-assigner"
          title={t('À assigner')}
          action={
            <Button component={RouterLink} to="/gardes/nouvelle" variant="contained" startIcon={<UserPlus aria-hidden="true" />}>
              {t('Nouvelle affectation')}
            </Button>
          }
        />
        <ManagedCoverageTab scope="pending" />
      </Box>
      <Box component="section" aria-labelledby="doublons">
        <SectionHeader id="doublons" title={t('Doublons possibles')} />
        <MergeProposalsTab />
      </Box>
      <Box component="section" aria-labelledby="equipe">
        <SectionHeader id="equipe" title={t('Équipe')} />
        <TeamTab />
      </Box>
    </Box>
  );
}
