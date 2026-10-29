import Box from '@mui/material/Box';
import { ChevronsUp, ChevronUp, Minus, Siren, type LucideIcon } from 'lucide-react';
import type { Priority } from '../api/types';
import { fontSize, type Tone } from '../design/tokens';
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

/**
 * Priorité sobre (listes d'alerte du tableau de bord) : badge doux seulement pour « Urgente »
 * (rouge) et « Haute » (accent) ; « Moyenne » et « Normale » en simple texte gris. Le libellé est
 * toujours écrit : la couleur n'est qu'un complément.
 */
export function PriorityLabel({ priority }: { priority: Priority }) {
  if (priority === 'URGENT') return <Badge tone="error">{PRIORITY_LABELS[priority]}</Badge>;
  if (priority === 'HIGH') return <Badge tone="accent">{PRIORITY_LABELS[priority]}</Badge>;
  return (
    <Box component="span" sx={{ color: 'text.secondary', fontSize: fontSize.sm }}>
      {PRIORITY_LABELS[priority]}
    </Box>
  );
}
