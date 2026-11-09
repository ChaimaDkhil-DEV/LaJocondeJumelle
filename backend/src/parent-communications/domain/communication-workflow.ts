import type { ParentCommunicationStatus } from '@prisma/client';

/**
 * Cycle de vie d'une communication aux parents (015, FR-001). Règles pures : le service vérifie en plus
 * l'auteur, la permission de validation, la version examinée et le verrouillage optimiste.
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

/** Seuls un brouillon et une communication retournée se modifient ; en attente, rien ne change. */
export function canEdit(status: ParentCommunicationStatus): boolean {
  return status === 'DRAFT' || status === 'RETURNED_FOR_CORRECTION';
}

export function isFinal(status: ParentCommunicationStatus): boolean {
  return status === 'APPROVED' || status === 'REJECTED' || status === 'CANCELLED';
}

/** Éléments manquants pour soumettre : la remarque écrite et le message vocal sont obligatoires (FR-002). */
export function missingForSubmit(draft: {
  text: string | null;
  voiceFileId: string | null;
}): Array<'text' | 'voice'> {
  const missing: Array<'text' | 'voice'> = [];
  if (!draft.text?.trim()) missing.push('text');
  if (!draft.voiceFileId) missing.push('voice');
  return missing;
}

/** Le parent ne voit jamais un brouillon, une attente, un retour, un rejet ni une annulation (FR-005). */
export function parentCanSee(status: ParentCommunicationStatus): boolean {
  return status === 'APPROVED';
}

/** La validation voit tout ce qui a été soumis au moins une fois ; un brouillon reste privé à l'enseignant. */
export function validatorCanSee(
  status: ParentCommunicationStatus,
  currentRevision: number,
): boolean {
  return status !== 'DRAFT' && currentRevision > 0;
}
