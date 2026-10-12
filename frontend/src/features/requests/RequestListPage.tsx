import AddIcon from '@mui/icons-material/Add';
import MicIcon from '@mui/icons-material/Mic';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { Link as RouterLink, useSearchParams } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { formatDateTime } from '../../components/format';
import { LoadingState } from '../../components/LoadingState';
import { PriorityChip } from '../../components/PriorityChip';
import { StatusChip } from '../../components/StatusChip';
import { OutboxPanel } from '../outbox/OutboxPanel';
import { useRequestList } from './api';
import type { RequestScope, RequestSummary } from './types';

const TABS: Array<{ key: string; label: string; scope: RequestScope; empty: string }> = [
  { key: 'recues', label: 'Reçues', scope: 'assigned', empty: 'Vous n’avez reçu aucune demande.' },
  { key: 'envoyees', label: 'Envoyées', scope: 'mine', empty: 'Vous n’avez envoyé aucune demande.' },
];

function RequestCard({ request, received }: { request: RequestSummary; received: boolean }) {
  const counterpart = received
    ? `De : ${request.requester.displayName}`
    : request.assignee
      ? `Pour : ${request.assignee.displayName}`
      : 'En attente d’affectation';
  return (
    <Card variant="outlined">
      <CardActionArea component={RouterLink} to={`/demandes/${request.id}`}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600, flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
              {request.title}
            </Typography>
            {request.unreadCount > 0 && (
              <Badge
                color="primary"
                badgeContent={request.unreadCount}
                aria-label={`${request.unreadCount} notification${request.unreadCount > 1 ? 's' : ''} non lue${request.unreadCount > 1 ? 's' : ''}`}
                sx={{ mt: 1.5, mr: 1 }}
              />
            )}
          </Box>
          <Typography variant="body2" color="text.secondary">
            {request.reference} · {request.category.name}
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', my: 1 }}>
            <StatusChip status={request.status} />
            <PriorityChip priority={request.priority} />
            {request.hasVoice && (
              <Typography component="span" variant="body2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <MicIcon fontSize="small" aria-hidden="true" /> Message vocal
              </Typography>
            )}
          </Stack>
          <Typography variant="body2">
            {counterpart} · {formatDateTime(request.createdAt)}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export function RequestListPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.key === params.get('onglet')) ?? TABS[0];
  const list = useRequestList(tab.scope);
  const requests = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
        <Typography component="h1" variant="h4">
          Mes demandes
        </Typography>
        <Button component={RouterLink} to="/demandes/nouvelle" variant="contained" startIcon={<AddIcon aria-hidden="true" />}>
          Nouvelle demande
        </Button>
      </Box>

      <OutboxPanel />

      <Tabs
        value={tab.key}
        onChange={(_e, key: string) => setParams({ onglet: key }, { replace: true })}
        aria-label="Type de demandes"
        sx={{ mb: 2 }}
      >
        {TABS.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} id={`onglet-${t.key}`} aria-controls="liste-demandes" />
        ))}
      </Tabs>

      <Box id="liste-demandes" role="tabpanel" aria-labelledby={`onglet-${tab.key}`}>
        {list.isPending ? (
          <LoadingState label="Chargement des demandes" />
        ) : list.error ? (
          <ErrorState message="Impossible de charger les demandes." actionLabel="Réessayer" onAction={() => void list.refetch()} />
        ) : requests.length === 0 ? (
          <EmptyState title="Aucune demande" description={tab.empty} />
        ) : (
          <Stack spacing={2}>
            {requests.map((r) => (
              <RequestCard key={r.id} request={r} received={tab.scope === 'assigned'} />
            ))}
            {list.hasNextPage && (
              <Button onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
                Afficher plus de demandes
              </Button>
            )}
          </Stack>
        )}
      </Box>
    </>
  );
}
