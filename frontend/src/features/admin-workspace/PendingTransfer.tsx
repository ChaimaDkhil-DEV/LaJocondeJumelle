import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ErrorState } from '../../components/ErrorState';
import { t } from '../../i18n';
import { useTransfer } from './api';
import { TransferCard } from './TransferCard';

/**
 * Proposition de transfert en attente sur une demande, affichée sur sa page (018, FR-025 : indication
 * visible). Les administrateurs de la catégorie la voient ; seuls son destinataire et son auteur y
 * trouvent des actions, d'après ce que le serveur leur autorise.
 */
export function PendingTransfer({ transferId }: { transferId: string }) {
  const transfer = useTransfer(transferId);
  if (transfer.isPending) return null;
  if (transfer.error) {
    return <ErrorState message={t('Impossible de charger la proposition de transfert en attente.')} actionLabel={t('Réessayer')} onAction={() => void transfer.refetch()} />;
  }
  return (
    <Box component="section" aria-labelledby="titre-transfert-en-attente" sx={{ mb: 3 }}>
      <Typography id="titre-transfert-en-attente" component="h2" variant="subtitle1" sx={{ mb: 1 }}>
        {t('Proposition de transfert en attente')}
      </Typography>
      <TransferCard transfer={transfer.data} headingLevel="h3" />
    </Box>
  );
}
