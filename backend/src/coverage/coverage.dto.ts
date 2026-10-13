import { Availability, Priority, RequestStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EXTEND_MAX_MINUTES, EXTEND_MIN_MINUTES, USER_COVERAGE_ACTIONS, type CoverageAction } from './domain/coverage-state-machine';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOrUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;
const toArray = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

/** Durée estimée maximale d'une garde : 12 h. */
export const MAX_ESTIMATED_MINUTES = 720;

export class CreateCoverageDto {
  /** Identifiant généré par le client : rend la création idempotente. */
  @IsUUID()
  clientId!: string;

  @IsUUID()
  categoryId!: string;

  @IsUUID()
  classId!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Choisissez au moins un groupe d’employés.' })
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  groupIds!: string[];

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  /** Absent = maintenant (heure serveur). */
  @IsOptional()
  @IsISO8601({ strict: true })
  startAt?: string;

  /** Absent = jusqu'à l'arrivée de l'enseignant. */
  @IsOptional()
  @IsInt({ message: 'Durée en minutes attendue.' })
  @Min(5, { message: 'La durée estimée doit être d’au moins 5 minutes.' })
  @Max(MAX_ESTIMATED_MINUTES, { message: 'La durée estimée ne doit pas dépasser 12 heures.' })
  estimatedMinutes?: number;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(100)
  absentTeacher?: string;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsUUID()
  voiceFileId?: string;
}

export class CoverageActionDto {
  @IsIn(USER_COVERAGE_ACTIONS)
  action!: CoverageAction;

  /** Verrouillage optimiste (facultatif pour « Je prends » : le premier arrivé gagne). */
  @IsOptional()
  @IsInt()
  @Min(0)
  version?: number;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(1000)
  reason?: string;

  /** ASSIGN / REASSIGN. */
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  /** ASSIGN / REASSIGN : forcer malgré l'indisponibilité (confirmation explicite dans l'interface). */
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  /** WIDEN. */
  @IsOptional()
  @IsUUID()
  groupId?: string;

  /** EXTEND : minutes ajoutées. */
  @IsOptional()
  @IsInt()
  @Min(EXTEND_MIN_MINUTES)
  @Max(EXTEND_MAX_MINUTES)
  minutes?: number;

  /** CONFIRM_PRESENCE : photo prise avec la caméra (fichier provisoire téléversé par l'employé). */
  @IsOptional()
  @IsUUID()
  photoFileId?: string;

  /** CONFIRM_PRESENCE : jeton lu dans le QR code de la classe. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  qrToken?: string;
}

export class ResolveQrDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  token!: string;
}

export class OwnAvailabilityDto {
  /** Un employé peut seulement se déclarer disponible ou indisponible ; « Absent » est réservé aux responsables. */
  @IsIn(['AVAILABLE', 'UNAVAILABLE'])
  availability!: 'AVAILABLE' | 'UNAVAILABLE';
}

export class SetAvailabilityDto {
  @IsEnum(Availability)
  availability!: Availability;
}

export class ListCoverageQuery {
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(RequestStatus, { each: true })
  status?: RequestStatus[];

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  /** Inclure les couvertures terminées (clôturées, annulées). */
  @IsOptional()
  @IsIn(['true', 'false'])
  includeFinished?: 'true' | 'false';
}

// ---------------------------------------------------------------------------
// Administration (super administrateur)
// ---------------------------------------------------------------------------

export class GroupDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le nom est obligatoire.' })
  @MaxLength(60)
  name!: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  memberIds!: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ClassDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le nom est obligatoire.' })
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(80)
  room?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
