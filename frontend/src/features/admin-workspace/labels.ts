import { t } from '../../i18n';
import type { AssignmentOperation, OwnedScope, TransferCancelCause, TransferStatus, TransferType } from './types';

/** Opérations sur le responsable d'une demande, telles qu'elles se lisent dans l'historique. */
export const OPERATION_LABELS: Record<AssignmentOperation, string> = {
  CLAIMED: t('Prise en charge'),
  TRANSFERRED: t('Transférée'),
  REASSIGNED: t('Réattribuée'),
  RELEASED: t('Libérée'),
};

/** Titre, description et état vide de chaque liste « mes demandes ». */
export const OWNED_LISTS: Record<OwnedScope, { title: string; description: string; empty: string; emptyHint: string }> = {
  all: {
    title: t('Mes demandes'),
    description: t('Toutes les demandes à votre charge, en cours ou terminées.'),
    empty: t('Aucune demande à votre charge'),
    emptyHint: t('Prenez une demande en charge depuis la file commune.'),
  },
  active: {
    title: t('Demandes en cours'),
    description: t('Les demandes à votre charge qui ne sont pas encore clôturées, refusées ou annulées.'),
    empty: t('Aucune demande en cours'),
    emptyHint: t('Prenez une demande en charge depuis la file commune.'),
  },
  finished: {
    title: t('Demandes terminées'),
    description: t('Les demandes que vous aviez à votre charge et qui sont clôturées, refusées ou annulées.'),
    empty: t('Aucune demande terminée'),
    emptyHint: t('Les demandes que vous aurez menées à leur terme apparaîtront ici.'),
  },
};

export const TRANSFER_TYPE_LABELS: Record<TransferType, string> = {
  DELEGATION_REQUEST: t('Délégation'),
  TAKEOVER_REQUEST: t('Demande de reprise'),
};

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  PENDING: t('En attente'),
  ACCEPTED: t('Acceptée'),
  REJECTED: t('Refusée'),
  CANCELLED: t('Annulée'),
  EXPIRED: t('Expirée'),
};

/** Pourquoi une proposition a été annulée : toujours dit, jamais un simple « annulée ». */
export const CANCEL_CAUSE_LABELS: Record<TransferCancelCause, string> = {
  INITIATOR: t('Annulée par son auteur.'),
  REQUEST_FINISHED: t('Annulée : la demande a été terminée entre-temps.'),
  OWNER_CHANGED: t('Annulée : la demande a changé de mains entre-temps.'),
  REASSIGNED_BY_SUPER_ADMIN: t('Annulée : la demande a été réattribuée par le super administrateur.'),
  PARTICIPANT_UNAVAILABLE: t('Annulée : l’un des deux administrateurs n’est plus disponible.'),
};
