import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { FilePen, Hourglass, Inbox, Mic, Plus, SearchX, Send } from 'lucide-react';
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
import { isPlural, t } from '../../i18n';
import { OutboxPanel } from '../outbox/OutboxPanel';
import { useCurrentUser } from '../auth/useCurrentUser';
import { useHasDrafts, useRequestList } from './api';
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
  { key: 'recues', label: t('Reçues'), scope: 'assigned', empty: t('Vous n’avez reçu aucune demande.') },
  { key: 'envoyees', label: t('Envoyées'), scope: 'mine', empty: t('Vous n’avez envoyé aucune demande.') },
  // Spec 007 : affiché seulement s'il existe au moins un brouillon.
  { key: 'brouillons', label: t('Brouillons'), scope: 'drafts', empty: t('Vous n’avez aucun brouillon.') },
  {
    key: 'a-valider',
    label: t('À valider'),
    scope: 'managed',
    statuses: ['PENDING_ADMIN_VALIDATION', 'PENDING_FINAL_VALIDATION'],
    empty: t('Aucune demande ne vous attend.'),
    managersOnly: true,
  },
  // Administration : toutes les demandes qu'elle peut voir, dont celles qu'elle consulte en lecture seule
  // (modes direct et entre enseignants).
  { key: 'suivi', label: t('Suivi'), scope: 'all', empty: t('Aucune demande à suivre.'), managersOnly: true },
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

/** Ligne de la liste : toute la ligne est un lien vers la demande (vers sa reprise pour un brouillon). */
function RequestRow({ request, received }: { request: RequestSummary; received: boolean }) {
  const person = received ? request.requester : request.assignee;
  const isDraft = request.status === 'DRAFT';
  const counterpart = received
    ? t('De : {name}', { name: request.requester.displayName })
    : request.assignee
      ? t('Pour : {name}', { name: request.assignee.displayName })
      : isDraft
        ? t('Pas encore envoyée')
        : t('En attente d’affectation');
  const unread = request.unreadCount;

  return (
    <Box
      component={RouterLink}
      to={isDraft ? `/demandes/${request.id}/brouillon` : `/demandes/${request.id}`}
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
                {` ${t(isPlural(unread) ? 'notifications non lues' : 'notification non lue')}`}
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
              <Mic size={icon.sm - 2} aria-hidden="true" /> {t('Message vocal')}
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
  const isManager = me.data?.role === 'ADMIN' || me.data?.role === 'SUPER_ADMIN';
  const hasDrafts = useHasDrafts();
  // L'onglet « Brouillons » reste affiché s'il est demandé dans l'adresse, même vide.
  const showDrafts = hasDrafts.data === true || params.get('onglet') === 'brouillons';
  const tabs = TABS.filter((t) => (!t.managersOnly || isManager) && (t.scope !== 'drafts' || showDrafts));
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
  const plural = requests.length > 1 || list.hasNextPage;
  const countLabel = filtered
    ? t(plural ? '{count} demandes correspondant aux filtres' : '{count} demande correspondant aux filtres', { count })
    : t(plural ? '{count} demandes' : '{count} demande', { count });

  return (
    <>
      <PageHeader
        title={t('Mes demandes')}
        description={t('Les demandes que vous avez reçues, celles que vous avez envoyées et celles qui attendent votre validation.')}
        actions={
          <Button component={RouterLink} to="/demandes/nouvelle" variant="contained" startIcon={<Plus aria-hidden="true" />}>
            {t('Nouvelle demande')}
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
        aria-label={t('Type de demandes')}
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
          <LoadingState label={t('Chargement des demandes')} />
        ) : list.error ? (
          <ErrorState message={t('Impossible de charger les demandes.')} actionLabel={t('Réessayer')} onAction={() => void list.refetch()} />
        ) : requests.length === 0 ? (
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper' }}>
            <EmptyState
              icon={filtered ? SearchX : tab.scope === 'mine' ? Send : tab.scope === 'drafts' ? FilePen : Inbox}
              title={t('Aucune demande')}
              description={filtered ? t('Aucune demande ne correspond à ces filtres.') : tab.empty}
              action={
                !filtered && tab.scope === 'mine' ? (
                  <Button component={RouterLink} to="/demandes/nouvelle" variant="outlined" startIcon={<Plus aria-hidden="true" />}>
                    {t('Créer une demande')}
                  </Button>
                ) : undefined
              }
            />
          </Box>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {countLabel}
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
                  {t('Afficher plus de demandes')}
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>
    </>
  );
}
