import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { CalendarClock } from 'lucide-react';
import { Link as RouterLink } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { formatDateTime } from '../../components/format';
import { useMyRequests } from './api';
import { CoverageStatusBadge, TYPE_LABELS, formatTime } from './labels';
import { t } from '../../i18n';

/** Onglet « Mes signalements » de l'enseignant : ses demandes, leur statut et le surveillant assigné (FR-014). */
export function MyRequestsTab() {
  const requests = useMyRequests();
  if (requests.isPending) return <LoadingState label={t('Chargement de vos signalements')} />;
  if (requests.error) {
    return <ErrorState message={t('Impossible de charger vos signalements.')} actionLabel={t('Réessayer')} onAction={() => void requests.refetch()} />;
  }
  if (requests.data.length === 0) {
    return (
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper' }}>
        <EmptyState
          icon={CalendarClock}
          title={t('Aucun signalement')}
          description={t('Signalez un retard ou une absence pour aujourd’hui ou demain : l’admin assignera un surveillant à votre classe.')}
        />
      </Box>
    );
  }
  return (
    <Box
      component="ul"
      aria-label={t('Mes signalements')}
      sx={{ listStyle: 'none', m: 0, p: 0, border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper', overflow: 'hidden' }}
    >
      {requests.data.map((r) => (
        <Box component="li" key={r.id} sx={{ borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
          <Box
            component={RouterLink}
            to={`/gardes/signalements/${r.id}`}
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 2,
              color: 'inherit',
              textDecoration: 'none',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Box sx={{ display: 'grid', gap: 0.25 }}>
              <Typography variant="subtitle2">
                {r.type ? t('{type} — {name}', { type: TYPE_LABELS[r.type], name: r.class.name }) : r.class.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatDateTime(r.startAt)}
                {r.plannedEndAt && ` – ${formatTime(r.plannedEndAt)}`}
                {r.assignee && ` · ${t('Surveillant : {name}', { name: r.assignee.displayName })}`}
              </Typography>
            </Box>
            <CoverageStatusBadge mainStatus={r.mainStatus} subState={r.subState} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}
