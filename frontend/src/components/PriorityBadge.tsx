import { ChevronsUp, ChevronUp, Minus, Siren, type LucideIcon } from 'lucide-react';
import type { Priority } from '../api/types';
import type { Tone } from '../design/tokens';
import { Badge } from './Badge';

export const PRIORITY_LABELS: Record<Priority, string> = {
  NORMAL: 'Normale',
  MEDIUM: 'Moyenne',
  HIGH: 'Haute',
  URGENT: 'Urgente',
};

/** Gradation discrète : trait, un chevron, deux chevrons, puis sirène rouge pour l'urgence. */
export const PRIORITY_STYLE: Record<Priority, { tone: Tone; icon: LucideIcon }> = {
  NORMAL: { tone: 'neutral', icon: Minus },
  MEDIUM: { tone: 'neutral', icon: ChevronUp },
  HIGH: { tone: 'warning', icon: ChevronsUp },
  URGENT: { tone: 'error', icon: Siren },
};

/** Priorité : icône + libellé ; « Urgente » est repérable sans la couleur (icône dédiée). */
export function PriorityBadge({ priority }: { priority: Priority }) {
  const { tone, icon } = PRIORITY_STYLE[priority];
  return (
    <Badge tone={tone} icon={icon} iconTestId={priority === 'URGENT' ? 'priority-urgent-icon' : undefined}>
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}
