import Chip, { type ChipProps } from '@mui/material/Chip';
import type { RequestStatus } from '../api/types';

export const STATUS_LABELS: Record<RequestStatus, string> = {
  DRAFT: 'Brouillon',
  PENDING_ADMIN_VALIDATION: 'En attente de validation administrative',
  SENT: 'Envoyée',
  ACCEPTED: 'Acceptée',
  IN_PROGRESS: 'En cours',
  DONE: 'Terminée',
  PENDING_FINAL_VALIDATION: 'En attente de validation finale',
  TO_CORRECT: 'À corriger',
  CLOSED: 'Clôturée',
  REJECTED: 'Refusée',
  CANCELLED: 'Annulée',
};

const STATUS_COLORS: Record<RequestStatus, ChipProps['color']> = {
  DRAFT: 'default',
  PENDING_ADMIN_VALIDATION: 'secondary',
  SENT: 'primary',
  ACCEPTED: 'primary',
  IN_PROGRESS: 'primary',
  DONE: 'success',
  PENDING_FINAL_VALIDATION: 'secondary',
  TO_CORRECT: 'warning',
  CLOSED: 'default',
  REJECTED: 'error',
  CANCELLED: 'default',
};

/** Statut d'une demande : toujours un libellé texte, la couleur n'est qu'un complément. */
export function StatusChip({ status }: { status: RequestStatus }) {
  return <Chip size="small" variant="outlined" color={STATUS_COLORS[status]} label={STATUS_LABELS[status]} />;
}
