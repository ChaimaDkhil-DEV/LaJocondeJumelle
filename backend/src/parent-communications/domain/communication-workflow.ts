import type { ConversationStatus, ConversationType, ParentCommunicationStatus } from '@prisma/client';

/**
 * Cycle de vie d'un message (015, FR-001 ; 017). Les messages envoyés directement (SENT) n'ont aucune
 * transition ; les messages de l'administration aux parents soumis pour validation suivent le cycle 015.
 * Règles pures : le service vérifie en plus l'auteur, la permission de validation, la version examinée et
 * le verrouillage optimiste ; la visibilité selon le lecteur est dans conversation-access.ts.
 */
export type CommunicationAction = 'SUBMIT' | 'CANCEL' | 'APPROVE' | 'RETURN' | 'REJECT';

const TRANSITIONS: Partial<
  Record<ParentCommunicationStatus, Partial<Record<CommunicationAction, ParentCommunicationStatus>>>
> = {
  DRAFT: { SUBMIT: 'PENDING_ADMIN_VALIDATION', CANCEL: 'CANCELLED' },
  PENDING_ADMIN_VALIDATION: {
    APPROVE: 'APPROVED',
    RETURN: 'RETURNED_FOR_CORRECTION',
    REJECT: 'REJECTED',
  },
  RETURNED_FOR_CORRECTION: { SUBMIT: 'PENDING_ADMIN_VALIDATION', CANCEL: 'CANCELLED' },
};

export function nextStatus(
  status: ParentCommunicationStatus,
  action: CommunicationAction,
): ParentCommunicationStatus | null {
  return TRANSITIONS[status]?.[action] ?? null;
}

/** Seuls un brouillon et un message retourné se modifient ; en attente, rien ne change. */
export function canEdit(status: ParentCommunicationStatus): boolean {
  return status === 'DRAFT' || status === 'RETURNED_FOR_CORRECTION';
}

export function isFinal(status: ParentCommunicationStatus): boolean {
  return status === 'APPROVED' || status === 'REJECTED' || status === 'CANCELLED' || status === 'SENT';
}

/** Un message porte un texte non vide, un vocal, ou les deux (017, FR-007). */
export function missingContent(content: { text: string | null | undefined; voiceFileId: string | null | undefined }): boolean {
  return !content.text?.trim() && !content.voiceFileId;
}

/** Une décision est refusée dans une archive 015 (D4) et dans une conversation clôturée. */
export function decisionBlocked(conversation: {
  type: ConversationType;
  status: ConversationStatus;
}): 'ARCHIVED' | 'CLOSED' | null {
  if (conversation.type === 'LEGACY_TEACHER_PARENT') return 'ARCHIVED';
  if (conversation.status === 'CLOSED') return 'CLOSED';
  return null;
}
