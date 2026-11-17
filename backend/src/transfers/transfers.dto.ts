import { Priority, RequestStatus, RequestTransferStatus } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateIf } from 'class-validator';

/** Périmètre de « mes demandes » : toutes, en cours, terminées. */
export const OWNED_SCOPES = ['all', 'active', 'finished'] as const;
export type OwnedScope = (typeof OWNED_SCOPES)[number];

/** Prise en charge : la version lue par l'administrateur (verrouillage optimiste), rien d'autre. */
export class ClaimRequestDto {
  @IsInt()
  @Min(0)
  version!: number;
}

export class PageQuery {
  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  cursor?: string;
}

/** Aucun identifiant d'administrateur n'est accepté : la liste est toujours celle de la session. */
export class OwnedRequestsQuery extends PageQuery {
  @IsOptional()
  @IsIn(OWNED_SCOPES, { message: 'Périmètre inconnu.' })
  scope?: OwnedScope;
}

export const TRANSFER_TYPES = ['TAKEOVER_REQUEST', 'DELEGATION_REQUEST'] as const;

/**
 * Proposition de transfert. Le motif est obligatoire (contrôlé par le service : 422 REASON_REQUIRED).
 * `recipientId` : le collègue choisi pour une délégation ; interdit pour une demande de reprise, que le
 * serveur adresse toujours à la personne qui a pris la demande en charge.
 */
export class ProposeTransferDto {
  @IsIn(TRANSFER_TYPES, { message: 'Type de transfert inconnu.' })
  type!: (typeof TRANSFER_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Le motif ne doit pas dépasser 500 caractères.' })
  reason?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Administrateur inconnu.' })
  recipientId?: string;
}

export class RejectTransferDto {
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Le motif ne doit pas dépasser 500 caractères.' })
  responseReason?: string;
}

/**
 * Réattribution administrative (super administrateur). `adminId` est toujours fourni : l'administrateur
 * qui reçoit la demande, ou null pour la remettre dans la file commune. Motif obligatoire (contrôlé par
 * le service : 422 REASON_REQUIRED).
 */
export class ReassignOwnerDto {
  @ValidateIf((_o, value) => value !== null)
  @IsUUID('all', { message: 'Administrateur inconnu.' })
  adminId!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Le motif ne doit pas dépasser 500 caractères.' })
  reason?: string;
}

/** Supervision des demandes : filtres du super administrateur. */
export class SupervisedRequestsQuery extends PageQuery {
  @IsOptional()
  @IsIn(['free', 'owned'], { message: 'Filtre inconnu.' })
  ownership?: 'free' | 'owned';

  @IsOptional()
  @IsIn(['active', 'finished'], { message: 'Filtre inconnu.' })
  state?: 'active' | 'finished';

  @IsOptional()
  @IsUUID('all', { message: 'Administrateur inconnu.' })
  adminId?: string;

  @IsOptional()
  @IsEnum(RequestStatus, { message: 'Statut inconnu.' })
  status?: RequestStatus;

  @IsOptional()
  @IsEnum(Priority, { message: 'Priorité inconnue.' })
  priority?: Priority;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Date invalide.' })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Date invalide.' })
  to?: string;
}

/** Toutes les propositions de transfert, par statut (super administrateur). */
export class AllTransfersQuery extends PageQuery {
  @IsOptional()
  @IsEnum(RequestTransferStatus, { message: 'Statut inconnu.' })
  status?: RequestTransferStatus;
}

/** Listes de propositions : en attente par défaut, `all` pour toutes. Toujours celles de la session. */
export class TransfersQuery extends PageQuery {
  @IsOptional()
  @IsIn(['pending', 'all'], { message: 'Filtre inconnu.' })
  status?: 'pending' | 'all';
}
