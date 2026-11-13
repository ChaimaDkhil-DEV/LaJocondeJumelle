import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import type { Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { AlarmClock, Siren } from 'lucide-react';
import { Link as RouterLink } from 'react-router';
import { visuallyHidden } from '../../components/a11y';
import { Badge } from '../../components/Badge';
import { PriorityBadge } from '../../components/PriorityBadge';
import { RelativeTime } from '../../components/RelativeTime';
import { STATUS_LABELS } from '../../components/StatusBadge';
import { font, fontSize, icon, tokensOf } from '../../design/tokens';
import { isPlural, t } from '../../i18n';
import { isLate, primaryAction, rowLevel, sortRequests, splitSections, type PrimaryAction, type RowLevel } from './requestListView';
import type { RequestSummary } from './types';

/**
 * « Mes demandes » : liste à une ligne par demande, en deux sections (« Prioritaires », « Autres »). Le détail
 * (destinataire, catégorie, message vocal, statut complet) reste sur la page de la demande.
 * Écrite à part de RequestRows, que « Suivi de mes demandes » continue d'utiliser.
 */

const ACTION_LABELS: Record<PrimaryAction, string> = {
  validate: t('Valider'),
  correct: t('Corriger'),
  open: t('Ouvrir'),
};

/** Rouge plein, texte blanc (contraste 6,5:1) dans les deux thèmes ; l'icône et le libellé disent aussi « urgente ». */
function UrgentBadge() {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        height: 24,
        px: 1.25,
        borderRadius: '999px',
        bgcolor: '#b91c1c',
        color: '#fff',
        fontSize: fontSize.xs,
        fontWeight: font.medium,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <Siren size={icon.sm - 2} strokeWidth={2} aria-hidden="true" data-testid="priority-urgent-icon" />
      {t('Urgente')}
    </Box>
  );
}

function rowBackground(level: RowLevel) {
  return (theme: Theme) => {
    const tokens = tokensOf(theme);
    if (level === 'urgent') return tokens.error.soft;
    if (level === 'late') return tokens.warning.soft;
    return theme.palette.background.paper;
  };
}

function RequestLine({ request, tabKey, level, late }: { request: RequestSummary; tabKey: string; level: RowLevel; late: boolean }) {
  const to = request.status === 'DRAFT' ? `/demandes/${request.id}/brouillon` : `/demandes/${request.id}`;
  const action = primaryAction(tabKey, request.status);
  const unread = request.unreadCount;
  const showStatus = request.status === 'REJECTED' || request.status === 'CLOSED';

  return (
    <Box
      sx={(theme) => ({
        display: 'grid',
        // Mobile : titre, puis badges et action. À partir de « sm » : tout sur une ligne.
        gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', sm: 'minmax(0, 1fr) auto auto' },
        gridTemplateAreas: { xs: '"title title" "meta action"', sm: '"title meta action"' },
        alignItems: 'center',
        columnGap: 2,
        rowGap: 0.5,
        px: { xs: 2, sm: 2.5 },
        py: 1,
        bgcolor: rowBackground(level)(theme),
      })}
    >
      <Box sx={{ gridArea: 'title', minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography
          component="h3"
          variant="body1"
          title={request.title}
          sx={{
            minWidth: 0,
            py: 1,
            fontWeight: font.medium,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {request.title}
        </Typography>
        {unread > 0 && (
          <Box
            component="span"
            sx={(theme) => ({
              flex: 'none',
              minWidth: 20,
              height: 20,
              px: 0.75,
              borderRadius: 10,
              bgcolor: tokensOf(theme).accent.main,
              color: tokensOf(theme).accent.contrastText,
              fontSize: fontSize.xs,
              fontWeight: font.medium,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            {unread}
            <Box component="span" sx={visuallyHidden}>
              {` ${t(isPlural(unread) ? 'notifications non lues' : 'notification non lue')}`}
            </Box>
          </Box>
        )}
      </Box>

      <Box sx={{ gridArea: 'meta', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <Typography component="span" variant="body2" color="text.secondary">
          <RelativeTime value={request.createdAt} />
        </Typography>
        {request.priority === 'URGENT' ? <UrgentBadge /> : <PriorityBadge priority={request.priority} />}
        {late && (
          <Badge tone="warning" icon={AlarmClock}>
            {t('En retard')}
          </Badge>
        )}
        {showStatus && (
          <Typography component="span" variant="body2" color="text.secondary">
            {STATUS_LABELS[request.status]}
          </Typography>
        )}
      </Box>

      <Button
        component={RouterLink}
        to={to}
        variant={action === 'open' ? 'outlined' : 'contained'}
        size="small"
        aria-label={`${ACTION_LABELS[action]} : ${request.title}`}
        sx={{ gridArea: 'action', minWidth: 88, minHeight: 40, justifySelf: 'end' }}
      >
        {ACTION_LABELS[action]}
      </Button>
    </Box>
  );
}

function Section({ title, requests, tabKey, now }: { title: string; requests: RequestSummary[]; tabKey: string; now: number }) {
  if (requests.length === 0) return null;
  return (
    <Box component="section" aria-label={title} sx={{ mb: 3 }}>
      <Typography component="h2" variant="overline" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: font.medium }}>
        {title}
      </Typography>
      <Box
        component="ul"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          border: 1,
          borderColor: 'divider',
          borderRadius: 1.5,
          overflow: 'hidden',
          '& > li + li': { borderTop: 1, borderColor: 'divider' },
        }}
      >
        {requests.map((r) => (
          <li key={r.id}>
            <RequestLine request={r} tabKey={tabKey} level={rowLevel(r, now)} late={isLate(r, now)} />
          </li>
        ))}
      </Box>
    </Box>
  );
}

export function PrioritizedRequestList({
  requests,
  tabKey,
  now,
  hasNextPage,
  loadingMore,
  onMore,
}: {
  requests: RequestSummary[];
  tabKey: string;
  /** Heure du serveur (ms) : en retard ou non se juge à cet instant. */
  now: number;
  hasNextPage: boolean;
  loadingMore: boolean;
  onMore: () => void;
}) {
  const { priority, others } = splitSections(sortRequests(requests, now), now);
  return (
    <>
      <Section title={t('Prioritaires')} requests={priority} tabKey={tabKey} now={now} />
      <Section title={t('Autres')} requests={others} tabKey={tabKey} now={now} />
      {hasNextPage && (
        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Button variant="outlined" onClick={onMore} loading={loadingMore}>
            {t('Afficher plus de demandes')}
          </Button>
        </Box>
      )}
    </>
  );
}
