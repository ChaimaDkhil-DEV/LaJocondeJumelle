import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ArrowLeftRight, TriangleAlert, UserRoundCog } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import type { RequestStatus } from '../../api/types';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { LoadingState } from '../../components/LoadingState';
import { PRIORITY_LABELS, PriorityBadge } from '../../components/PriorityBadge';
import { STATUS_LABELS, StatusBadge } from '../../components/StatusBadge';
import { font, icon } from '../../design/tokens';
import { t } from '../../i18n';
import { TRANSFER_STATUS_LABELS } from '../admin-workspace/labels';
import { TransferCard } from '../admin-workspace/TransferCard';
import type { TransferStatus } from '../admin-workspace/types';
import { ReassignOwnerDialog } from './ReassignOwnerDialog';
import {
  NO_FILTERS,
  useAdministrators,
  useAllTransfers,
  useSupervisedRequests,
  type AdministratorLoad,
  type SupervisedRequest,
  type SupervisionFilters,
} from './supervisionApi';

type View = 'requests' | 'administrators' | 'transfers';

/** Statuts d'une demande de travail hors brouillon, dans l'ordre du circuit. */
const WORK_STATUSES: RequestStatus[] = [
  'PENDING_ADMIN_VALIDATION',
  'SENT',
  'ACCEPTED',
  'IN_PROGRESS',
  'DONE',
  'PENDING_FINAL_VALIDATION',
  'TO_CORRECT',
  'CLOSED',
  'REJECTED',
  'CANCELLED',
];
const FINISHED: RequestStatus[] = ['CLOSED', 'REJECTED', 'CANCELLED'];
const TRANSFER_STATUSES: TransferStatus[] = ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED'];

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
      sx={{ minWidth: 0 }}
    >
      {children}
    </TextField>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
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

function RequestRow({ request, onReassign }: { request: SupervisedRequest; onReassign: () => void }) {
  const titleId = useId();
  return (
    <Paper component="article" aria-labelledby={titleId} variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'grid', gap: 1.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <PriorityBadge priority={request.priority} />
        <StatusBadge status={request.status} />
        {request.adminOwnerUnavailable && (
          <Badge tone="error" icon={TriangleAlert}>
            {t('Administrateur indisponible')}
          </Badge>
        )}
      </Box>
      <Typography id={titleId} component="h3" variant="subtitle1" sx={{ fontWeight: font.semibold, overflowWrap: 'anywhere' }}>
        <Link component={RouterLink} to={`/demandes/${request.id}`} color="inherit">
          {request.title}
        </Link>
      </Typography>
      <Box component="dl" sx={{ m: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(4, minmax(0, 1fr))' } }}>
        <Meta label={t('Prise en charge par')}>
          {request.adminOwner ? (
            request.adminOwner.displayName
          ) : (
            <Box component="span" sx={{ color: 'text.secondary' }}>
              {t('Libre')}
            </Box>
          )}
        </Meta>
        <Meta label={t('Demandeur')}>{request.requester.displayName}</Meta>
        <Meta label={t('Catégorie')}>{request.category.name}</Meta>
        <Meta label={t('Créée le')}>
          <time dateTime={request.createdAt}>{formatDateTime(request.createdAt)}</time>
        </Meta>
      </Box>
      {!FINISHED.includes(request.status) && (
        <Box sx={{ display: 'flex', justifyContent: { sm: 'flex-end' } }}>
          <Button
            variant="outlined"
            startIcon={<UserRoundCog size={icon.sm} aria-hidden="true" />}
            onClick={onReassign}
            aria-label={`${t('Réattribuer')} : ${request.title}`}
            sx={{ minHeight: 44, flex: { xs: '1 1 auto', sm: 'none' } }}
          >
            {t('Réattribuer')}
          </Button>
        </Box>
      )}
    </Paper>
  );
}

function RequestsView({ filters, setFilters }: { filters: SupervisionFilters; setFilters: (next: SupervisionFilters) => void }) {
  const requests = useSupervisedRequests(filters);
  const administrators = useAdministrators();
  const [reassigning, setReassigning] = useState<SupervisedRequest | null>(null);
  // Pages chargées jusqu'ici, dans l'ordre du serveur (les plus récentes d'abord).
  const items = requests.data?.pages.flatMap((page) => page.items) ?? [];
  const set = <K extends keyof SupervisionFilters>(key: K, value: SupervisionFilters[K]) => setFilters({ ...filters, [key]: value });

  return (
    <Box>
      <Box
        component="form"
        aria-label={t('Filtres des demandes')}
        onSubmit={(e) => e.preventDefault()}
        sx={{ display: 'grid', gap: 2, mb: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' } }}
      >
        <Select label={t('Prise en charge')} value={filters.ownership} onChange={(v) => set('ownership', v as SupervisionFilters['ownership'])}>
          <MenuItem value="">{t('Toutes')}</MenuItem>
          <MenuItem value="free">{t('Libres')}</MenuItem>
          <MenuItem value="owned">{t('Prises en charge')}</MenuItem>
        </Select>
        <Select label={t('État')} value={filters.state} onChange={(v) => set('state', v as SupervisionFilters['state'])}>
          <MenuItem value="">{t('Tous')}</MenuItem>
          <MenuItem value="active">{t('En cours')}</MenuItem>
          <MenuItem value="finished">{t('Terminées')}</MenuItem>
        </Select>
        <Select label={t('Administrateur')} value={filters.adminId} onChange={(v) => set('adminId', v)}>
          <MenuItem value="">{t('Tous')}</MenuItem>
          {(administrators.data ?? []).map((admin) => (
            <MenuItem key={admin.id} value={admin.id}>
              {admin.displayName}
            </MenuItem>
          ))}
        </Select>
        <Select label={t('Priorité')} value={filters.priority} onChange={(v) => set('priority', v as SupervisionFilters['priority'])}>
          <MenuItem value="">{t('Toutes')}</MenuItem>
          <MenuItem value="NORMAL">{PRIORITY_LABELS.NORMAL}</MenuItem>
          <MenuItem value="URGENT">{PRIORITY_LABELS.URGENT}</MenuItem>
        </Select>
        <Select label={t('Statut')} value={filters.status} onChange={(v) => set('status', v as SupervisionFilters['status'])}>
          <MenuItem value="">{t('Tous')}</MenuItem>
          {WORK_STATUSES.map((status) => (
            <MenuItem key={status} value={status}>
              {STATUS_LABELS[status]}
            </MenuItem>
          ))}
        </Select>
        <TextField
          size="small"
          type="date"
          label={t('Créées à partir du')}
          value={filters.from}
          onChange={(e) => set('from', e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          size="small"
          type="date"
          label={t('Créées jusqu’au')}
          value={filters.to}
          onChange={(e) => set('to', e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Button variant="text" onClick={() => setFilters(NO_FILTERS)} sx={{ minHeight: 40, justifySelf: 'start' }}>
          {t('Réinitialiser les filtres')}
        </Button>
      </Box>

      {requests.isPending && <LoadingState label={t('Chargement des demandes')} />}
      {requests.error && (
        <ErrorState message={t('Impossible de charger les demandes.')} actionLabel={t('Réessayer')} onAction={() => void requests.refetch()} />
      )}
      {requests.data && items.length === 0 && (
        <EmptyState title={t('Aucune demande ne correspond à ces critères')} description={t('Élargissez ou réinitialisez les filtres.')} />
      )}
      {items.length > 0 && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {items.map((request) => (
            <RequestRow key={request.id} request={request} onReassign={() => setReassigning(request)} />
          ))}
        </Box>
      )}
      {requests.hasNextPage && (
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
          <Button variant="outlined" loading={requests.isFetchingNextPage} onClick={() => void requests.fetchNextPage()} sx={{ minHeight: 44 }}>
            {t('Afficher plus de demandes')}
          </Button>
        </Box>
      )}
      {reassigning && <ReassignOwnerDialog request={reassigning} onClose={() => setReassigning(null)} />}
    </Box>
  );
}

function AdministratorRow({ admin, onShowRequests }: { admin: AdministratorLoad; onShowRequests: () => void }) {
  const titleId = useId();
  return (
    <Paper component="article" aria-labelledby={titleId} variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, display: 'grid', gap: 1.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <Typography id={titleId} component="h3" variant="subtitle1" sx={{ fontWeight: font.semibold, overflowWrap: 'anywhere' }}>
          {admin.displayName}
        </Typography>
        <Badge tone={admin.active ? 'success' : 'neutral'}>{admin.active ? t('Actif') : t('Désactivé')}</Badge>
      </Box>
      <Box component="dl" sx={{ m: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(5, minmax(0, 1fr))' } }}>
        <Meta label={t('Fonction')}>{admin.jobTitle ?? '—'}</Meta>
        <Meta label={t('Demandes en cours')}>{admin.ownedActive}</Meta>
        <Meta label={t('Demandes terminées')}>{admin.ownedFinished}</Meta>
        <Meta label={t('Transferts en attente')}>{admin.transfersPending}</Meta>
        <Meta label={t('Dernière opération')}>
          {admin.lastOperationAt ? <time dateTime={admin.lastOperationAt}>{formatDateTime(admin.lastOperationAt)}</time> : t('Aucune opération')}
        </Meta>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: { sm: 'flex-end' } }}>
        <Button variant="outlined" onClick={onShowRequests} aria-label={`${t('Voir ses demandes')} : ${admin.displayName}`} sx={{ minHeight: 44 }}>
          {t('Voir ses demandes')}
        </Button>
      </Box>
    </Paper>
  );
}

function AdministratorsView({ onShowRequests }: { onShowRequests: (adminId: string) => void }) {
  const administrators = useAdministrators();
  if (administrators.isPending) return <LoadingState label={t('Chargement des administrateurs')} />;
  if (administrators.error) {
    return <ErrorState message={t('Impossible de charger les administrateurs.')} actionLabel={t('Réessayer')} onAction={() => void administrators.refetch()} />;
  }
  if (administrators.data.length === 0) {
    return <EmptyState title={t('Aucun administrateur')} description={t('Créez un compte de rôle Admin dans « Comptes ».')} />;
  }
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      {administrators.data.map((admin) => (
        <AdministratorRow key={admin.id} admin={admin} onShowRequests={() => onShowRequests(admin.id)} />
      ))}
    </Box>
  );
}

function TransfersView() {
  const [status, setStatus] = useState<TransferStatus | 'all'>('PENDING');
  const transfers = useAllTransfers(status);
  const items = transfers.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Box>
      <Box sx={{ mb: 2, maxWidth: 280, display: 'grid' }}>
        <Select label={t('Statut des propositions')} value={status} onChange={(v) => setStatus(v as TransferStatus | 'all')}>
          {TRANSFER_STATUSES.map((s) => (
            <MenuItem key={s} value={s}>
              {TRANSFER_STATUS_LABELS[s]}
            </MenuItem>
          ))}
          <MenuItem value="all">{t('Toutes')}</MenuItem>
        </Select>
      </Box>
      {transfers.isPending && <LoadingState label={t('Chargement des propositions')} />}
      {transfers.error && (
        <ErrorState message={t('Impossible de charger les propositions de transfert.')} actionLabel={t('Réessayer')} onAction={() => void transfers.refetch()} />
      )}
      {transfers.data && items.length === 0 && <EmptyState icon={ArrowLeftRight} title={t('Aucune proposition de transfert avec ce statut')} />}
      {items.length > 0 && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {items.map((transfer) => (
            <TransferCard key={transfer.id} transfer={transfer} headingLevel="h3" />
          ))}
        </Box>
      )}
      {transfers.hasNextPage && (
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
          <Button variant="outlined" loading={transfers.isFetchingNextPage} onClick={() => void transfers.fetchNextPage()} sx={{ minHeight: 44 }}>
            {t('Afficher plus de propositions')}
          </Button>
        </Box>
      )}
    </Box>
  );
}

/**
 * Supervision du super administrateur (018, US5) : toutes les demandes « via l'administration » et la
 * personne qui les a prises en charge, la charge de chaque administrateur, toutes les propositions de
 * transfert, et la réattribution administrative. Consultation et réattribution seulement : le super
 * administrateur ne traite pas les demandes ici.
 */
export function SupervisionPage() {
  const [view, setView] = useState<View>('requests');
  const [filters, setFilters] = useState<SupervisionFilters>(NO_FILTERS);

  return (
    <Box component="section" aria-labelledby="titre-supervision">
      <Typography id="titre-supervision" component="h2" variant="h6" sx={{ mb: 0.5 }}>
        {t('Supervision')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('Qui s’occupe de quoi : demandes et administrateurs qui les ont prises en charge, transferts entre eux, et réattribution en cas d’absence.')}
      </Typography>
      <Tabs value={view} onChange={(_event, next: View) => setView(next)} aria-label={t('Vues de la supervision')} variant="scrollable" sx={{ mb: 3 }}>
        <Tab value="requests" label={t('Demandes')} id="supervision-onglet-requests" aria-controls="supervision-vue-requests" />
        <Tab value="administrators" label={t('Administrateurs')} id="supervision-onglet-administrators" aria-controls="supervision-vue-administrators" />
        <Tab value="transfers" label={t('Transferts')} id="supervision-onglet-transfers" aria-controls="supervision-vue-transfers" />
      </Tabs>
      <Box role="tabpanel" id={`supervision-vue-${view}`} aria-labelledby={`supervision-onglet-${view}`}>
        {view === 'requests' && <RequestsView filters={filters} setFilters={setFilters} />}
        {view === 'administrators' && (
          <AdministratorsView
            onShowRequests={(adminId) => {
              setFilters({ ...NO_FILTERS, adminId });
              setView('requests');
            }}
          />
        )}
        {view === 'transfers' && <TransfersView />}
      </Box>
    </Box>
  );
}
