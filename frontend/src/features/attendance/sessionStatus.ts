import { AlarmClock, Ban, CalendarClock, CircleCheck, FileCheck, Hourglass, UserRoundX, type LucideIcon } from 'lucide-react';
import type { Tone } from '../../design/tokens';
import { t } from '../../i18n';
import type { SessionStatus } from './types';

/**
 * Statut d'une séance (020) : libellé, teinte et icône, jamais la couleur seule. Partagé par la liste des enseignants
 * attendus et par l'emploi du temps d'administration, pour que les mêmes couleurs veuillent dire la même chose.
 */
export const SESSION_STATUS: Record<SessionStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  UPCOMING: { label: t('À venir'), tone: 'neutral', icon: CalendarClock },
  EXPECTED: { label: t('Attendu'), tone: 'info', icon: Hourglass },
  PRESENT: { label: t('Présent'), tone: 'success', icon: CircleCheck },
  LATE: { label: t('En retard'), tone: 'warning', icon: AlarmClock },
  NOT_ARRIVED: { label: t('Non arrivé'), tone: 'error', icon: UserRoundX },
  EXCUSED: { label: t('Absence justifiée'), tone: 'neutral', icon: FileCheck },
  CANCELLED: { label: t('Séance annulée'), tone: 'neutral', icon: Ban },
};
