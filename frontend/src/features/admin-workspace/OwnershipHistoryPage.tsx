import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { History } from 'lucide-react';
import { Link as RouterLink } from 'react-router';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { LoadingState } from '../../components/LoadingState';
import { font } from '../../design/tokens';
import { t } from '../../i18n';
import { useMyAssignments } from './api';
import { OPERATION_LABELS } from './labels';
import type { AssignmentView } from './types';

/** Qui a fait quoi, en une phrase : « par Mme Admin », et le changement de responsable s'il y en a un. */
function detail(row: AssignmentView): string {
  const by = t('par {name}', { name: row.actor.displayName });
  if (row.operation === 'RELEASED') return `${t('{name} n’a plus la demande à sa charge', { name: row.admin.displayName })}, ${by}`;
  if (row.previousAdmin) return `${t('de {from} à {to}', { from: row.previousAdmin.displayName, to: row.admin.displayName })}, ${by}`;
  return by;
}

/**
 * « Mon historique » (018, FR-007) : les opérations qui ont fait de l'administrateur connecté un
 * responsable ou mis fin à sa responsabilité, les plus récentes d'abord. Consultation seule.
 */
export function OwnershipHistoryPage() {
  const history = useMyAssignments();

  return (
    <Box component="section" aria-labelledby="titre-mon-historique">
      <Typography id="titre-mon-historique" component="h2" variant="h6" sx={{ mb: 0.5 }}>
        {t('Mon historique')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('Vos prises en charge et les transferts qui vous concernent, du plus récent au plus ancien.')}
      </Typography>

      {history.isPending && <LoadingState label={t('Chargement de l’historique')} />}
      {history.error && (
        <ErrorState message={t('Impossible de charger votre historique.')} actionLabel={t('Réessayer')} onAction={() => void history.refetch()} />
      )}
      {history.data && history.data.items.length === 0 && (
        <EmptyState icon={History} title={t('Aucune opération pour le moment')} description={t('Vos prises en charge apparaîtront ici.')} />
      )}
      {history.data && history.data.items.length > 0 && (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
          {history.data.items.map((row) => (
            <Paper key={row.id} component="li" variant="outlined" sx={{ p: 2, display: 'grid', gap: 0.75, minWidth: 0 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                <Badge tone={row.operation === 'CLAIMED' ? 'accent' : 'info'}>{OPERATION_LABELS[row.operation]}</Badge>
                <Typography component="time" dateTime={row.createdAt} variant="body2" color="text.secondary">
                  {formatDateTime(row.createdAt)}
                </Typography>
              </Box>
              <Link component={RouterLink} to={`/demandes/${row.request.id}`} sx={{ fontWeight: font.medium, overflowWrap: 'anywhere' }}>
                {row.request.title}
              </Link>
              <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                {detail(row)}
              </Typography>
              {row.reason && (
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  {t('Motif : {reason}', { reason: row.reason })}
                </Typography>
              )}
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
