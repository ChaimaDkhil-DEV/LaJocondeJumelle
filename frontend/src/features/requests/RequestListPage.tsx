import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { Hourglass, Inbox, Mic, Plus, SearchX, Send } from 'lucide-react';
import { Link as RouterLink, useSearchParams } from 'react-router';
import { visuallyHidden } from '../../components/a11y';
import { Countdown } from '../../components/Countdown';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { PriorityBadge } from '../../components/PriorityBadge';
import { RelativeTime } from '../../components/RelativeTime';
import { StatusBadge } from '../../components/StatusBadge';
import { UserAvatar } from '../../components/UserAvatar';
import { font, fontSize, icon, motion, tokensOf } from '../../design/tokens';
import { OutboxPanel } from '../outbox/OutboxPanel';
import { useCurrentUser } from '../auth/useCurrentUser';
import { useRequestList } from './api';
import { activeFilterCount, filtersToQuery, readFilters, writeFilters } from './filters';
import { RequestFilters } from './RequestFilters';
import type { RequestScope, RequestSummary } from './types';
import { isReadOnlyStatus } from './readOnly';

interface TabDefinition {
  key: string;
  label: string;
  scope: RequestScope;
  statuses?: string[];
  empty: string;
  managersOnly?: boolean;
}

const TABS: TabDefinition[] = [
  { key: 'recues', label: 'Reçues', scope: 'assigned', empty: 'Vous n’avez reçu aucune demande.' },
  { key: 'envoyees', label: 'Envoyées', scope: 'mine', empty: 'Vous n’avez envoyé aucune demande.' },
  {
    key: 'a-valider',
    label: 'À valider',
    scope: 'managed',
    statuses: ['PENDING_ADMIN_VALIDATION', 'PENDING_FINAL_VALIDATION'],
    empty: 'Aucune demande ne vous attend.',
    managersOnly: true,
  },
];

/** Avatar de l'interlocuteur, ou pastille « en attente » quand personne n'est encore affecté. */
function CounterpartAvatar({ person }: { person: { id: string; displayName: string } | null }) {
  if (person) return <UserAvatar name={person.displayName} id={person.id} size={32} />;
  return (
    <Box
      aria-hidden="true"
      sx={(theme) => ({
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: `1px dashed ${tokensOf(theme).borderStrong}`,
        color: tokensOf(theme).textMuted,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Hourglass size={icon.sm - 2} />
    </Box>
  );
}

/** Ligne de la liste : toute la ligne est un lien vers la demande. */
function RequestRow({ request, received }: { request: RequestSummary; received: boolean }) {
  const person = received ? request.requester : request.assignee;
  const counterpart = received
    ? `De : ${request.requester.displayName}`
    : request.assignee
      ? `Pour : ${request.assignee.displayName}`
      : 'En attente d’affectation';
  const unread = request.unreadCount;

  return (
    <Box
      component={RouterLink}
      to={`/demandes/${request.id}`}
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        columnGap: 1.5,
        px: { xs: 2, sm: 2.5 },
        py: 1.75,
        color: 'inherit',
        textDecoration: 'none',
        transition: `background-color ${motion.fast}ms`,
        '&:hover': { bgcolor: tokensOf(theme).surfaceMuted },
        '&:focus-visible': { outlineOffset: -2 },
      })}
    >
      <Box sx={{ pt: 0.25 }}>
        <CounterpartAvatar person={person} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Typography component="h2" variant="body1" sx={{ fontWeight: font.medium, flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
            {request.title}
          </Typography>
          {unread > 0 && (
            <Box
              component="span"
              sx={(theme) => ({
                flex: 'none',
                mt: 0.25,
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
                {` notification${unread > 1 ? 's' : ''} non lue${unread > 1 ? 's' : ''}`}
              </Box>
            </Box>
          )}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, overflowWrap: 'anywhere' }}>
          {counterpart} · {request.category.name} · <RelativeTime value={request.createdAt} />
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1 }}>
          <StatusBadge status={request.status} />
          <PriorityBadge priority={request.priority} />
          {!isReadOnlyStatus(request.status) && (
            <Countdown stage={request.currentStage} dueAt={request.currentDueAt} warnAt={request.warnAt} overdueStage={request.overdueStage} />
          )}
          {request.hasVoice && (
            <Typography
              component="span"
              variant="caption"
              color="text.secondary"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
            >
              <Mic size={icon.sm - 2} aria-hidden="true" /> Message vocal
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export function RequestListPage() {
  const [params, setParams] = useSearchParams();
  const me = useCurrentUser();
  const isManager = me.data?.role === 'MANAGER' || me.data?.role === 'SUPER_ADMIN';
  const tabs = TABS.filter((t) => !t.managersOnly || isManager);
  const tab = tabs.find((t) => t.key === params.get('onglet')) ?? tabs[0];
  const filters = readFilters(params);
  // Les statuts choisis dans les filtres remplacent ceux de l'onglet « À valider ».
  const list = useRequestList(
    tab.scope,
    filters.statuses.length > 0 ? [] : (tab.statuses ?? []),
    filtersToQuery(filters),
  );
  const filtered = activeFilterCount(filters) > 0;
  const requests = list.data?.pages.flatMap((p) => p.items) ?? [];
  const count = `${requests.length}${list.hasNextPage ? '+' : ''}`;

  return (
    <>
      <PageHeader
        title="Mes demandes"
        description="Les demandes que vous avez reçues, celles que vous avez envoyées et celles qui attendent votre validation."
        actions={
          <Button component={RouterLink} to="/demandes/nouvelle" variant="contained" startIcon={<Plus aria-hidden="true" />}>
            Nouvelle demande
          </Button>
        }
      />

      <OutboxPanel />

      <Tabs
        value={tab.key}
        onChange={(_e, key: string) => {
          const next = new URLSearchParams(params);
          next.set('onglet', key);
          setParams(next, { replace: true });
        }}
        aria-label="Type de demandes"
        variant="scrollable"
        scrollButtons={false}
        sx={{ mb: 2 }}
      >
        {tabs.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} id={`onglet-${t.key}`} aria-controls="liste-demandes" />
        ))}
      </Tabs>

      <RequestFilters value={filters} onChange={(f) => setParams(writeFilters(params, f), { replace: true })} />

      <Box id="liste-demandes" role="tabpanel" aria-labelledby={`onglet-${tab.key}`}>
        {list.isPending ? (
          <LoadingState label="Chargement des demandes" />
        ) : list.error ? (
          <ErrorState message="Impossible de charger les demandes." actionLabel="Réessayer" onAction={() => void list.refetch()} />
        ) : requests.length === 0 ? (
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper' }}>
            <EmptyState
              icon={filtered ? SearchX : tab.scope === 'mine' ? Send : Inbox}
              title="Aucune demande"
              description={filtered ? 'Aucune demande ne correspond à ces filtres.' : tab.empty}
              action={
                !filtered && tab.scope === 'mine' ? (
                  <Button component={RouterLink} to="/demandes/nouvelle" variant="outlined" startIcon={<Plus aria-hidden="true" />}>
                    Créer une demande
                  </Button>
                ) : undefined
              }
            />
          </Box>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {count} demande{requests.length > 1 || list.hasNextPage ? 's' : ''}
              {filtered ? ' correspondant aux filtres' : ''}
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
                bgcolor: 'background.paper',
                overflow: 'hidden',
                '& > li + li': { borderTop: 1, borderColor: 'divider' },
              }}
            >
              {requests.map((r) => (
                <li key={r.id}>
                  <RequestRow request={r} received={tab.scope === 'assigned'} />
                </li>
              ))}
            </Box>
            {list.hasNextPage && (
              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <Button variant="outlined" onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
                  Afficher plus de demandes
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>
    </>
  );
}
