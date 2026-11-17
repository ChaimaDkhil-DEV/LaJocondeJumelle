import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ArrowDownToLine, ArrowUpFromLine, History, type LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { icon as iconSize } from '../../design/tokens';
import { t } from '../../i18n';
import { useTransfers, type TransferBox } from './api';
import { TransferCard } from './TransferCard';

const SECTIONS: Array<{ box: TransferBox; title: string; description: string; empty: string; error: string; icon: LucideIcon }> = [
  {
    box: 'received',
    title: t('Demandes reçues'),
    description: t('Propositions de vos collègues qui attendent votre réponse.'),
    empty: t('Aucune proposition en attente de votre réponse'),
    error: t('Impossible de charger les propositions reçues.'),
    icon: ArrowDownToLine,
  },
  {
    box: 'sent',
    title: t('Demandes envoyées'),
    description: t('Vos propositions auxquelles votre collègue n’a pas encore répondu.'),
    empty: t('Aucune proposition envoyée en attente'),
    error: t('Impossible de charger les propositions envoyées.'),
    icon: ArrowUpFromLine,
  },
  {
    box: 'history',
    title: t('Historique des transferts'),
    description: t('Propositions acceptées, refusées, annulées ou expirées, envoyées ou reçues.'),
    empty: t('Aucun transfert passé'),
    error: t('Impossible de charger l’historique des transferts.'),
    icon: History,
  },
];

function TransferSection({ box, title, description, empty, error, icon: Icon }: (typeof SECTIONS)[number]) {
  const titleId = useId();
  const transfers = useTransfers(box);
  return (
    <Box component="section" aria-labelledby={titleId} sx={{ minWidth: 0 }}>
      <Typography id={titleId} component="h3" variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Icon size={iconSize.md} aria-hidden="true" />
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {description}
      </Typography>
      {transfers.isPending && <LoadingState label={t('Chargement des propositions')} rows={1} />}
      {transfers.error && <ErrorState message={error} actionLabel={t('Réessayer')} onAction={() => void transfers.refetch()} />}
      {transfers.data && transfers.data.items.length === 0 && <EmptyState compact icon={Icon} title={empty} />}
      {transfers.data && transfers.data.items.length > 0 && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {transfers.data.items.map((transfer) => (
            <TransferCard key={transfer.id} transfer={transfer} />
          ))}
        </Box>
      )}
    </Box>
  );
}

/**
 * « Collaboration » (018, US2 à US4) : propositions de transfert reçues et envoyées en attente, puis
 * l'historique. Les listes se relisent seules quand un collègue propose, répond ou annule.
 */
export function CollaborationPage() {
  return (
    <Box component="section" aria-labelledby="titre-collaboration">
      <Typography id="titre-collaboration" component="h2" variant="h6" sx={{ mb: 0.5 }}>
        {t('Collaboration')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('Délégations et demandes de reprise entre administrateurs. Une demande ne change de mains qu’après l’accord de la personne à qui la proposition est adressée.')}
      </Typography>
      <Box sx={{ display: 'grid', gap: 4 }}>
        {SECTIONS.map((section) => (
          <TransferSection key={section.box} {...section} />
        ))}
      </Box>
    </Box>
  );
}
