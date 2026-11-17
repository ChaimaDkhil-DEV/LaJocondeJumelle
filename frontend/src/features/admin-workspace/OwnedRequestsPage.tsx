import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { t } from '../../i18n';
import { useOwnedRequests } from './api';
import { OWNED_LISTS } from './labels';
import type { OwnedScope } from './types';
import { WorkspaceRequestCard } from './WorkspaceRequestCard';

/**
 * Demandes dont l'administrateur connecté est le responsable actuel : toutes, en cours ou terminées
 * (018, FR-006). Le serveur les calcule d'après la session ; l'interface ne transmet aucun identifiant.
 */
export function OwnedRequestsPage({ scope }: { scope: OwnedScope }) {
  const requests = useOwnedRequests(scope);
  const list = OWNED_LISTS[scope];
  const titleId = `titre-demandes-${scope}`;

  return (
    <Box component="section" aria-labelledby={titleId}>
      <Typography id={titleId} component="h2" variant="h6" sx={{ mb: 0.5 }}>
        {list.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {list.description}
      </Typography>

      {requests.isPending && <LoadingState label={t('Chargement des demandes')} />}
      {requests.error && (
        <ErrorState message={t('Impossible de charger vos demandes.')} actionLabel={t('Réessayer')} onAction={() => void requests.refetch()} />
      )}
      {requests.data && requests.data.items.length === 0 && (
        <EmptyState
          title={list.empty}
          description={list.emptyHint}
          action={
            scope === 'finished' ? undefined : (
              <Button component={RouterLink} to="/espace/file" variant="outlined">
                {t('Voir la file commune')}
              </Button>
            )
          }
        />
      )}
      {requests.data && requests.data.items.length > 0 && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {requests.data.items.map((request) => (
            <WorkspaceRequestCard key={request.id} request={request} />
          ))}
        </Box>
      )}
    </Box>
  );
}
