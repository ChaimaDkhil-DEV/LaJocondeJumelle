import Box from '@mui/material/Box';
import { ArrowDownToLine, ArrowUpFromLine, CircleCheck, FolderOpen, Inbox, Loader } from 'lucide-react';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { t } from '../../i18n';
import { KpiCard } from '../admin/KpiCard';
import { useWorkspaceSummary } from './api';

/**
 * Tableau de bord de l'espace de travail (FR-023) : compteurs lus sur le serveur, chacun ouvre la liste
 * qu'il compte. Aucun chiffre n'est affiché tant que le serveur n'a pas répondu.
 */
export function WorkspaceDashboardPage() {
  const summary = useWorkspaceSummary();
  if (summary.isPending) return <LoadingState label={t('Chargement des compteurs')} />;
  if (summary.error) {
    return <ErrorState message={t('Impossible de charger les compteurs.')} actionLabel={t('Réessayer')} onAction={() => void summary.refetch()} />;
  }
  const counts = summary.data;
  const cards = [
    { label: t('Demandes disponibles'), value: counts.available, to: '/espace/file', icon: Inbox, hint: t('Dans la file commune, que personne n’a encore prises.') },
    { label: t('Mes demandes'), value: counts.mine, to: '/espace/mes-demandes', icon: FolderOpen, hint: t('À votre charge.') },
    { label: t('Demandes en cours'), value: counts.active, to: '/espace/en-cours', icon: Loader, hint: t('À votre charge, pas encore terminées.') },
    { label: t('Demandes terminées'), value: counts.finished, to: '/espace/terminees', icon: CircleCheck, hint: t('Clôturées, refusées ou annulées.') },
    {
      key: 'received',
      label: t('Transferts reçus en attente'),
      value: counts.transfersReceivedPending,
      to: '/espace/collaboration',
      icon: ArrowDownToLine,
      hint: t('Propositions qui attendent votre réponse.'),
    },
    {
      key: 'sent',
      label: t('Transferts envoyés en attente'),
      value: counts.transfersSentPending,
      to: '/espace/collaboration',
      icon: ArrowUpFromLine,
      hint: t('Vos propositions sans réponse pour le moment.'),
    },
  ];
  return (
    <Box
      component="section"
      aria-label={t('Tableau de bord')}
      sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}
    >
      {cards.map((card) => (
        <KpiCard key={'key' in card ? card.key : card.to} label={card.label} value={card.value} hint={card.hint} icon={card.icon} to={card.to} linkLabel={`${card.label} : ${card.value}`} />
      ))}
    </Box>
  );
}
