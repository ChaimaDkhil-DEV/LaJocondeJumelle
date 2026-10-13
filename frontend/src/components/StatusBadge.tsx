import {
  Ban,
  CircleCheck,
  CirclePlay,
  CircleX,
  ClipboardCheck,
  Hourglass,
  Lock,
  PencilLine,
  RotateCcw,
  Send,
  ThumbsUp,
  type LucideIcon,
} from 'lucide-react';
import type { RequestStatus } from '../api/types';
import type { Tone } from '../design/tokens';
import { Badge } from './Badge';

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

/** Ton et icône de chaque statut : en attente (orange), en cours (accent), terminé (vert), refus (rouge). */
const STATUS_STYLE: Record<RequestStatus, { tone: Tone; icon: LucideIcon }> = {
  DRAFT: { tone: 'neutral', icon: PencilLine },
  PENDING_ADMIN_VALIDATION: { tone: 'warning', icon: Hourglass },
  SENT: { tone: 'info', icon: Send },
  ACCEPTED: { tone: 'accent', icon: ThumbsUp },
  IN_PROGRESS: { tone: 'accent', icon: CirclePlay },
  DONE: { tone: 'success', icon: CircleCheck },
  PENDING_FINAL_VALIDATION: { tone: 'warning', icon: ClipboardCheck },
  TO_CORRECT: { tone: 'warning', icon: RotateCcw },
  CLOSED: { tone: 'neutral', icon: Lock },
  REJECTED: { tone: 'error', icon: CircleX },
  CANCELLED: { tone: 'neutral', icon: Ban },
};

/** Statut d'une demande : icône + libellé texte, la couleur n'est qu'un complément. */
export function StatusBadge({ status }: { status: RequestStatus }) {
  const { tone, icon } = STATUS_STYLE[status];
  return (
    <Badge tone={tone} icon={icon}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
