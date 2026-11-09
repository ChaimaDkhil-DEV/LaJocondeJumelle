import type { NotificationType, RequestKind } from '@prisma/client';

/**
 * Contenu d'un push (spec 014, D7, contracts/push-payload.md). Le serveur n'envoie aucun texte rédigé :
 * l'appareil compose le titre à partir du type, dans sa langue. Seuls sortent l'identifiant de la
 * notification, son type, le nom de la classe (garde) ou la référence (demande de travail), et le chemin
 * de la ressource. Jamais de titre, de description, de message ni de nom de personne (SC-006).
 */
export interface PushPayload {
  v: 1;
  id: string;
  type: NotificationType;
  place: string;
  url: string;
}

export interface PushPayloadInput {
  notificationId: string;
  type: NotificationType;
  requestId: string;
  kind: RequestKind;
  reference: string;
  /** Nom de la classe d'une garde ; null pour une demande de travail. */
  className: string | null;
}

export function buildPushPayload(input: PushPayloadInput): PushPayload {
  const coverage = input.kind === 'COVERAGE';
  return {
    v: 1,
    id: input.notificationId,
    type: input.type,
    place: coverage && input.className ? input.className : input.reference,
    url: coverage ? `/gardes/${input.requestId}` : `/demandes/${input.requestId}`,
  };
}
