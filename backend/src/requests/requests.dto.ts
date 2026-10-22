import { Priority, RequestStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ALL_ACTIONS, type RequestAction } from './domain/request-state-machine';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Chaîne vide après nettoyage → absente. */
const trimOrUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;
const toArray = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

export class CreateRequestDto {
  /** Identifiant généré par le client : rend la création idempotente (research R10). */
  @IsUUID()
  clientId!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le titre est obligatoire.' })
  @MaxLength(120, { message: 'Le titre ne doit pas dépasser 120 caractères.' })
  title!: string;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsUUID()
  voiceFileId?: string;

  @IsUUID()
  categoryId!: string;

  @IsEnum(Priority)
  priority!: Priority;

  @IsOptional()
  @IsUUID()
  recipientId?: string;

  @IsOptional()
  @IsBoolean()
  asDraft?: boolean;
}

/** Modification d'un brouillon. `voiceFileId: null` retire le vocal. */
export class UpdateDraftDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ValidateIf((_o, value) => value !== null && value !== undefined)
  @IsUUID()
  voiceFileId?: string | null;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ValidateIf((_o, value) => value !== null && value !== undefined)
  @IsUUID()
  recipientId?: string | null;
}

export const REQUEST_SCOPES = ['mine', 'drafts', 'assigned', 'managed', 'all'] as const;
export type RequestScope = (typeof REQUEST_SCOPES)[number];

export class ListRequestsQuery {
  @IsOptional()
  @IsIn(REQUEST_SCOPES)
  scope?: RequestScope;

  @IsOptional()
  @Transform(toArray)
  @IsEnum(RequestStatus, { each: true })
  status?: RequestStatus[];

  @IsOptional()
  @Transform(toArray)
  @IsEnum(Priority, { each: true })
  priority?: Priority[];

  @IsOptional()
  @Transform(toArray)
  @IsUUID('all', { each: true })
  categoryId?: string[];

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  requesterId?: string;

  /** Début de période (date AAAA-MM-JJ ou date-heure ISO 8601), inclus. */
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  /** Fin de période, incluse ; une date seule couvre toute la journée. */
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  overdue?: 'true' | 'false';

  /** Recherche dans le titre, sans tenir compte de la casse. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

/** POST /requests/:id/actions — contracts/rest-api.md §Demandes. */
export class RequestActionDto {
  @IsIn(ALL_ACTIONS)
  action!: RequestAction;

  /** Version lue par le client : verrouillage optimiste (STATE_CHANGED si elle a changé). */
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('all', { each: true })
  proofFileIds?: string[];
}

/** PATCH /requests/:id/priority */
export class ChangePriorityDto {
  @IsEnum(Priority)
  priority!: Priority;

  @IsInt()
  @Min(0)
  version!: number;
}
