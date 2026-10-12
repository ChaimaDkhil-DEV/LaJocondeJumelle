import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import Chip from '@mui/material/Chip';
import type { Priority } from '../api/types';

export const PRIORITY_LABELS: Record<Priority, string> = {
  NORMAL: 'Normale',
  MEDIUM: 'Moyenne',
  HIGH: 'Haute',
  URGENT: 'Urgente',
};

/** Priorité : « Urgente » est signalée par une icône et un texte, pas seulement par la couleur. */
export function PriorityChip({ priority }: { priority: Priority }) {
  const urgent = priority === 'URGENT';
  return (
    <Chip
      size="small"
      color={urgent ? 'error' : priority === 'HIGH' ? 'warning' : 'default'}
      variant={urgent ? 'filled' : 'outlined'}
      icon={urgent ? <PriorityHighIcon data-testid="priority-urgent-icon" aria-hidden="true" /> : undefined}
      label={PRIORITY_LABELS[priority]}
    />
  );
}
