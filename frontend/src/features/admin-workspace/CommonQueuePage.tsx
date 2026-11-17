import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { useToast } from '../../components/Toast';
import { t } from '../../i18n';
import { useCommonQueue } from './api';
import { ClaimDialog } from './ClaimDialog';
import type { QueueItem } from './types';
import { WorkspaceRequestCard } from './WorkspaceRequestCard';

/**
 * File commune (018, US1) : demandes en attente de validation, sans responsable, dans les catégories de
 * l'administrateur. Urgentes d'abord, puis les plus anciennes — l'ordre du serveur. La liste se relit
 * seule quand un collègue prend une demande (événement temps réel).
 */
export function CommonQueuePage() {
  const queue = useCommonQueue();
  const navigate = useNavigate();
  const toast = useToast();
  const [claiming, setClaiming] = useState<QueueItem | null>(null);

  return (
    <Box component="section" aria-labelledby="titre-file-commune">
      <Typography id="titre-file-commune" component="h2" variant="h6" sx={{ mb: 0.5 }}>
        {t('File commune')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('Demandes en attente de validation que personne n’a encore prises en charge. Les urgentes sont en tête.')}
      </Typography>

      {queue.isPending && <LoadingState label={t('Chargement de la file commune')} />}
      {queue.error && (
        <ErrorState message={t('Impossible de charger la file commune.')} actionLabel={t('Réessayer')} onAction={() => void queue.refetch()} />
      )}
      {queue.data && queue.data.items.length === 0 && (
        <EmptyState title={t('Aucune demande disponible')} description={t('Les nouvelles demandes à valider apparaîtront ici dès leur envoi.')} />
      )}
      {queue.data && queue.data.items.length > 0 && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {queue.data.items.map((request) => (
            <WorkspaceRequestCard key={request.id} request={request} onClaim={() => setClaiming(request)} />
          ))}
        </Box>
      )}

      <ClaimDialog
        request={claiming}
        onClose={() => setClaiming(null)}
        onClaimed={(id) => {
          setClaiming(null);
          toast.success(t('Demande prise en charge.'));
          void navigate(`/demandes/${id}`);
        }}
      />
    </Box>
  );
}
