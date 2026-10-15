import { HttpException } from '@nestjs/common';

/**
 * Codes d'erreur métier — contracts/rest-api.md §Règles communes.
 * Chaque code a un statut HTTP et un message français lisible par l'utilisateur.
 */
export const ERROR_CATALOG = {
  VALIDATION_ERROR: { status: 400, message: 'Certaines informations sont manquantes ou invalides.' },
  UNAUTHENTICATED: { status: 401, message: 'Votre session a expiré. Veuillez vous reconnecter.' },
  INVALID_CREDENTIALS: { status: 401, message: 'Identifiant ou mot de passe incorrect.' },
  FORBIDDEN: { status: 403, message: 'Vous n’avez pas le droit d’effectuer cette action.' },
  PASSWORD_CHANGE_REQUIRED: {
    status: 403,
    message: 'Vous devez changer votre mot de passe avant de continuer.',
  },
  NOT_FOUND: { status: 404, message: 'Élément introuvable.' },
  CONFLICT: { status: 409, message: 'Cet élément existe déjà.' },
  INVALID_TRANSITION: {
    status: 409,
    message: 'Cette action n’est pas possible dans le statut actuel de la demande.',
  },
  STATE_CHANGED: {
    status: 409,
    message: 'La demande a été modifiée entre-temps. Elle a été rechargée.',
  },
  FILE_TOO_LARGE: { status: 413, message: 'Le fichier est trop volumineux.' },
  FILE_TYPE_NOT_ALLOWED: { status: 415, message: 'Ce type de fichier n’est pas accepté.' },
  RECIPIENT_NOT_ALLOWED: {
    status: 422,
    message: 'Ce destinataire ne peut pas recevoir les demandes de cette catégorie.',
  },
  ASSIGNEE_REQUIRED: { status: 422, message: 'Choisissez l’employé qui réalisera la demande.' },
  AUTO_ASSIGNEE_UNAVAILABLE: {
    status: 422,
    message: 'La personne désignée pour cette catégorie n’est plus disponible. Choisissez l’employé qui réalisera la demande.',
  },
  PHOTO_REQUIRED: {
    status: 422,
    message: 'Une photo de preuve est obligatoire pour terminer cette demande.',
  },
  REASON_REQUIRED: { status: 422, message: 'Un motif ou un commentaire est obligatoire.' },
  CONTENT_REQUIRED: { status: 422, message: 'Ajoutez un message vocal ou une description écrite.' },
  VOICE_TOO_LONG: {
    status: 422,
    message: 'Le message vocal dépasse la durée maximale autorisée.',
  },
  VOICE_TOO_SHORT: { status: 422, message: 'Le message vocal est trop court.' },
  ALREADY_TAKEN: { status: 409, message: 'Cette garde a déjà été prise.' },
  NOT_AVAILABLE: {
    status: 409,
    message: 'Cet employé n’est pas disponible : il a déjà une garde en cours sur ce créneau ou est indisponible.',
  },
  PROOF_REQUIRED: { status: 422, message: 'La preuve de présence demandée est manquante (photo ou QR code de la classe).' },
  QR_INVALID: { status: 422, message: 'Ce QR code n’est pas valide ou a été révoqué. Demandez le QR code à jour.' },
  QR_CLASS_MISMATCH: { status: 422, message: 'Ce QR code correspond à une autre classe que celle de votre garde.' },
  INVALID_DURATION: { status: 422, message: 'Durée invalide.' },
  RATE_LIMITED: {
    status: 429,
    message: 'Trop de tentatives. Patientez une minute avant de réessayer.',
  },
  INTERNAL_ERROR: {
    status: 500,
    message: 'Une erreur inattendue est survenue. Réessayez plus tard.',
  },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    readonly details?: Record<string, unknown>,
    message?: string,
  ) {
    const entry = ERROR_CATALOG[code];
    super({ code, message: message ?? entry.message, details }, entry.status);
  }

  get userMessage(): string {
    return (this.getResponse() as { message: string }).message;
  }
}
