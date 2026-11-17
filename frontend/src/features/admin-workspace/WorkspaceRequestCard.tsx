import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Hand } from 'lucide-react';
import { useId } from 'react';
import { Link as RouterLink } from 'react-router';
import { Countdown } from '../../components/Countdown';
import { formatDateTime } from '../../components/format';
import { PriorityBadge } from '../../components/PriorityBadge';
import { StatusBadge } from '../../components/StatusBadge';
import { font, icon } from '../../design/tokens';
import { t } from '../../i18n';
import type { RequestSummary } from '../requests/types';

interface WorkspaceRequestCardProps {
  request: RequestSummary & { description?: string | null };
  /** Présent : bouton « Prendre en charge » (file commune). */
  onClaim?: () => void;
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography component="dt" variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>
        {children}
      </Typography>
    </Box>
  );
}

/**
 * Une demande dans l'espace de travail : titre, description, priorité, statut, demandeur, catégorie,
 * date de création, échéance. Sur téléphone, les actions passent sous le contenu, en pleine largeur.
 */
export function WorkspaceRequestCard({ request, onClaim }: WorkspaceRequestCardProps) {
  const titleId = useId();
  return (
    <Paper component="article" aria-labelledby={titleId} variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'grid', gap: 1.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <PriorityBadge priority={request.priority} />
        <StatusBadge status={request.status} />
        <Countdown stage={request.currentStage} dueAt={request.currentDueAt} warnAt={request.warnAt} overdueStage={request.overdueStage} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography id={titleId} component="h3" variant="subtitle1" sx={{ fontWeight: font.semibold, overflowWrap: 'anywhere' }}>
          {request.title}
        </Typography>
        {request.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {request.description}
          </Typography>
        )}
      </Box>
      <Box component="dl" sx={{ m: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(3, minmax(0, 1fr))' } }}>
        <Meta label={t('Demandeur')}>{request.requester.displayName}</Meta>
        <Meta label={t('Catégorie')}>{request.category.name}</Meta>
        <Meta label={t('Créée le')}>
          <time dateTime={request.createdAt}>{formatDateTime(request.createdAt)}</time>
        </Meta>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: { sm: 'flex-end' } }}>
        <Button
          component={RouterLink}
          to={`/demandes/${request.id}`}
          variant="outlined"
          aria-label={`${t('Ouvrir')} : ${request.title}`}
          sx={{ minHeight: 44, flex: { xs: '1 1 140px', sm: 'none' } }}
        >
          {t('Ouvrir')}
        </Button>
        {onClaim && (
          <Button
            variant="contained"
            startIcon={<Hand size={icon.sm} aria-hidden="true" />}
            onClick={onClaim}
            aria-label={`${t('Prendre en charge')} : ${request.title}`}
            sx={{ minHeight: 44, flex: { xs: '1 1 180px', sm: 'none' } }}
          >
            {t('Prendre en charge')}
          </Button>
        )}
      </Box>
    </Paper>
  );
}
