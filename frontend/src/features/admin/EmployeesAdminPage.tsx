import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Ban, CircleCheck, Contact } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { SectionHeader } from '../../components/SectionHeader';
import { Person } from '../../components/UserAvatar';
import { font, fontSize, tokensOf } from '../../design/tokens';
import { t } from '../../i18n';
import { useEmployees } from './api';
import { ROLE_LABELS } from './labels';

const COLUMNS = { md: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1.6fr) minmax(0, 1fr) 120px' };
const NONE = '—';

/**
 * Liste des employés en lecture seule pour l'admin (011, US3, contracts/ui.md) : nom, fonction, rôle, groupes,
 * étage et statut. Aucune action sur les comptes, gérés par le super administrateur (« Comptes »).
 * Colonnes sur grand écran, une fiche par employé en dessous ; chaque information porte son libellé.
 */
export function EmployeesAdminPage() {
  const employees = useEmployees();

  return (
    <Box component="section" aria-labelledby="titre-employes">
      <SectionHeader
        id="titre-employes"
        title={t('Employés')}
        description={t('Qui travaille dans l’établissement : rôle, groupes, étage et statut de chaque compte. Les comptes sont gérés par le super administrateur.')}
      />
      {employees.isPending ? (
        <LoadingState label={t('Chargement des employés')} />
      ) : employees.error ? (
        <ErrorState message={t('Impossible de charger les employés.')} actionLabel={t('Réessayer')} onAction={() => void employees.refetch()} />
      ) : employees.data.length === 0 ? (
        <Paper variant="outlined">
          <EmptyState icon={Contact} title={t('Aucun employé.')} />
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box
            aria-hidden="true"
            sx={(theme) => ({
              display: { xs: 'none', md: 'grid' },
              gridTemplateColumns: COLUMNS.md,
              gap: 2,
              px: 2.5,
              py: 1.25,
              bgcolor: tokensOf(theme).surfaceMuted,
              borderBottom: 1,
              borderColor: 'divider',
              color: tokensOf(theme).textSecondary,
              fontSize: fontSize.xs,
              fontWeight: font.medium,
            })}
          >
            <span>{t('Employé')}</span>
            <span>{t('Rôle')}</span>
            <span>{t('Groupes')}</span>
            <span>{t('Étage')}</span>
            <span>{t('Statut')}</span>
          </Box>
          <Box
            component="ul"
            aria-label={t('Liste des employés')}
            sx={{ listStyle: 'none', m: 0, p: 0, '& > li + li': { borderTop: 1, borderColor: 'divider' } }}
          >
            {employees.data.map((employee) => (
              <Box
                component="li"
                key={employee.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', md: COLUMNS.md },
                  alignItems: 'center',
                  gap: { xs: 0.75, md: 2 },
                  px: { xs: 2, md: 2.5 },
                  py: 1.75,
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Person name={employee.displayName} id={employee.id} size={32} secondary={employee.jobTitle ?? undefined} />
                </Box>
                <Typography variant="body2" sx={{ gridRow: { xs: 2, md: 'auto' } }}>
                  {ROLE_LABELS[employee.role]}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, overflowWrap: 'anywhere' }}>
                  {t('Groupes : {groups}', { groups: employee.groups.map((g) => g.name).join(', ') || NONE })}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, overflowWrap: 'anywhere' }}>
                  {t('Étage : {floor}', { floor: employee.floor?.name ?? NONE })}
                </Typography>
                <Box sx={{ gridRow: { xs: 1, md: 'auto' }, gridColumn: { xs: 2, md: 'auto' }, justifySelf: { xs: 'end', md: 'start' } }}>
                  {employee.active ? (
                    <Badge tone="success" icon={CircleCheck}>
                      {t('Actif')}
                    </Badge>
                  ) : (
                    <Badge tone="neutral" icon={Ban}>
                      {t('Inactif')}
                    </Badge>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        </Paper>
      )}
    </Box>
  );
}
