import { Archive, CircleCheck, Hourglass, type LucideIcon } from 'lucide-react';
import type { ColorTokens } from '../../design/tokens';
import { t } from '../../i18n';
import type { TrackingGroup } from '../requests/api';

/**
 * « Suivi de mes demandes » (016) : présentation des trois groupes. Les statuts de chaque groupe sont
 * tenus par le serveur (src/requests/domain/tracking.ts) : l'interface ne passe que le nom du groupe.
 */
export interface TrackingView {
  group: TrackingGroup;
  /** Segment d'adresse de la liste : /demandes/suivi/<slug>. */
  slug: string;
  title: string;
  description: string;
  empty: string;
  icon: LucideIcon;
  /** Couleurs douces du bouton : fond, bordure, et couleur de l'icône et du compteur (≥ 4.5:1 sur le fond). */
  colors: (tokens: ColorTokens) => { bg: string; border: string; accent: string };
}

export const TRACKING_VIEWS: readonly TrackingView[] = [
  {
    group: 'pending',
    slug: 'en-attente',
    title: t('En attente'),
    description: t('Demandes envoyées qui attendent une validation ou sont en cours de traitement.'),
    empty: t('Aucune demande en attente pour le moment.'),
    icon: Hourglass,
    colors: (c) => ({ bg: c.accents.orange.soft, border: c.accents.orange.main, accent: c.accents.orange.main }),
  },
  {
    group: 'handled',
    slug: 'traitees',
    title: t('Validées / traitées'),
    description: t('Demandes réalisées par la personne chargée.'),
    empty: t('Aucune demande validée ou traitée pour le moment.'),
    icon: CircleCheck,
    colors: (c) => ({ bg: c.success.soft, border: c.success.main, accent: c.success.text }),
  },
  {
    group: 'archived',
    slug: 'archives',
    title: t('Archives'),
    description: t('Historique des demandes clôturées, refusées ou annulées.'),
    empty: t('Aucune demande archivée pour le moment.'),
    icon: Archive,
    colors: (c) => ({ bg: c.surfaceMuted, border: c.borderStrong, accent: c.textSecondary }),
  },
];

export function trackingViewOf(slug: string | undefined): TrackingView | undefined {
  return TRACKING_VIEWS.find((v) => v.slug === slug);
}
