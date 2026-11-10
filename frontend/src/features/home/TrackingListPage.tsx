import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Navigate, useParams } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { t } from '../../i18n';
import { useRequestList } from '../requests/api';
import { RequestRows } from '../requests/RequestListPage';
import { trackingViewOf, type TrackingView } from './tracking';

/**
 * Liste d'un groupe de « Suivi de mes demandes » (016) : les demandes envoyées par l'utilisateur
 * connecté, filtrées par le serveur selon le groupe (`scope=mine&tracking=…`). Groupe inconnu : retour
 * à l'accueil.
 */
export function TrackingListPage() {
  const view = trackingViewOf(useParams().groupe);
  if (!view) return <Navigate to="/" replace />;
  return <TrackingList key={view.group} view={view} />;
}

function TrackingList({ view }: { view: TrackingView }) {
  const list = useRequestList('mine', [], `&tracking=${view.group}`);
  const requests = list.data?.pages.flatMap((p) => p.items) ?? [];
  const count = `${requests.length}${list.hasNextPage ? '+' : ''}`;
  const plural = requests.length > 1 || list.hasNextPage;

  return (
    <>
      <PageHeader title={view.title} description={view.description} back={{ to: '/', label: t('Retour à l’accueil') }} />
      {list.isPending ? (
        <LoadingState label={t('Chargement des demandes')} />
      ) : list.error ? (
        <ErrorState message={t('Impossible de charger les demandes.')} actionLabel={t('Réessayer')} onAction={() => void list.refetch()} />
      ) : requests.length === 0 ? (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper' }}>
          <EmptyState icon={view.icon} title={t('Aucune demande')} description={view.empty} />
        </Box>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t(plural ? '{count} demandes' : '{count} demande', { count })}
          </Typography>
          <RequestRows
            requests={requests}
            received={false}
            hasNextPage={list.hasNextPage}
            loadingMore={list.isFetchingNextPage}
            onMore={() => void list.fetchNextPage()}
          />
        </>
      )}
    </>
  );
}
