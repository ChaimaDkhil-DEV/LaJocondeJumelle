import { Availability, CoverageSource, CoverageType, RequestStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
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
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { EXTEND_MAX_MINUTES, EXTEND_MIN_MINUTES } from './domain/coverage-state-machine';
import { MAIN_STATUSES, type MainStatus } from './domain/coverage-status';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOrUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);
const toArray = ({ value }: { value: unknown }) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]);

/** Affectation directe par l'admin (contracts/rest-api.md `POST /coverage`, FR-019). */
export class CreateCoverageDto {
  /** Identifiant généré par le client : rend la création idempotente. */
  @IsUUID()
  clientId!: string;

  @IsUUID()
  classId!: string;

  @IsEnum(CoverageType, { message: 'Type attendu : retard, absence ou classe vide.' })
  type!: CoverageType;

  /** Enseignant concerné (groupe Enseignants), facultatif. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  teacherId?: string | null;

  @IsISO8601({ strict: true })
  startAt!: string;

  @IsISO8601({ strict: true })
  endAt!: string;

  @IsUUID()
  assigneeId!: string;

  /** Motif détaillé : admin et super administrateur seulement. */
  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(1000)
  reason?: string;

  /** Consigne pour le surveillant. */
  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsUUID()
  voiceFileId?: string;
}

/** Surveillants proposables pour un créneau, avant la création (formulaire d'affectation directe). */
export class SlotCandidatesQuery {
  @IsUUID()
  classId!: string;

  @IsISO8601({ strict: true })
  startAt!: string;

  @IsISO8601({ strict: true })
  endAt!: string;
}

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Demande d'un enseignant (contracts/rest-api.md `POST /coverage/teacher-requests`, FR-012). */
export class TeacherRequestDto {
  @IsUUID()
  clientId!: string;

  @IsIn(['LATENESS', 'ABSENCE'], { message: 'Type attendu : retard ou absence.' })
  type!: 'LATENESS' | 'ABSENCE';

  @IsUUID('all', { message: 'Choisissez la classe.' })
  classId!: string;

  /** Aujourd'hui ou demain, dans le fuseau de l'école. */
  @Matches(DATE_FORMAT, { message: 'Date attendue (AAAA-MM-JJ).' })
  date!: string;

  @Matches(TIME_FORMAT, { message: 'Heure de début attendue (HH:MM).' })
  startTime!: string;

  /** Heure de fin, ou `durationMinutes` (l'un des deux exactement). */
  @IsOptional()
  @Matches(TIME_FORMAT, { message: 'Heure de fin attendue (HH:MM).' })
  endTime?: string;

  @IsOptional()
  @IsInt({ message: 'Durée en minutes attendue.' })
  @Min(5, { message: 'La durée doit être d’au moins 5 minutes.' })
  @Max(720, { message: 'La durée ne doit pas dépasser 12 heures.' })
  durationMinutes?: number;

  /** Motif détaillé, facultatif : visible de l'admin, du super administrateur et de l'auteur. */
  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** Modification par l'auteur tant que la demande est « en attente » (FR-008g). */
export class UpdateTeacherRequestDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @IsIn(['LATENESS', 'ABSENCE'], { message: 'Type attendu : retard ou absence.' })
  type?: 'LATENESS' | 'ABSENCE';

  @IsOptional()
  @IsUUID('all', { message: 'Choisissez la classe.' })
  classId?: string;

  @IsOptional()
  @Matches(DATE_FORMAT, { message: 'Date attendue (AAAA-MM-JJ).' })
  date?: string;

  @IsOptional()
  @Matches(TIME_FORMAT, { message: 'Heure de début attendue (HH:MM).' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_FORMAT, { message: 'Heure de fin attendue (HH:MM).' })
  endTime?: string;

  @IsOptional()
  @IsInt({ message: 'Durée en minutes attendue.' })
  @Min(5, { message: 'La durée doit être d’au moins 5 minutes.' })
  @Max(720, { message: 'La durée ne doit pas dépasser 12 heures.' })
  durationMinutes?: number;

  /** null efface le motif. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value))
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  reason?: string | null;
}

export class CoverageActionDto {
  /** Contrôlée par le service : une action inconnue ou retirée répond 400 UNKNOWN_ACTION. */
  @IsString()
  @MaxLength(40)
  action!: string;

  /** Verrouillage optimiste. */
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

  /** SET_TEACHER : enseignant concerné, ou null pour « non précisé ». */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  teacherId?: string | null;

  /** RELEASE_SUPPORT. */
  @IsOptional()
  @IsUUID()
  supportId?: string;

  /** EXTEND : minutes ajoutées. */
  @IsOptional()
  @IsInt()
  @Min(EXTEND_MIN_MINUTES)
  @Max(EXTEND_MAX_MINUTES)
  minutes?: number;

  /** CONFIRM_PRESENCE : photo prise avec la caméra (fichier provisoire téléversé par le surveillant). */
  @IsOptional()
  @IsUUID()
  photoFileId?: string;

  /** CONFIRM_PRESENCE : jeton lu dans le QR code de la classe. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  qrToken?: string;
}

/** Déclaration d'une classe vide par un surveillant (FR-015, FR-015a). */
export class EmptyClassDto {
  /** Identifiant généré par le client : rend la déclaration idempotente. */
  @IsUUID()
  clientId!: string;

  @IsUUID()
  classId!: string;

  /** Enseignant concerné : facultatif, jamais bloquant ; membre du groupe Enseignants. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  teacherId?: string | null;

  /** QR de la classe, facultatif : enregistré comme preuve de présence (R10). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  qrToken?: string;
}

export const MERGE_DECISIONS = ['CONFIRM', 'REJECT'] as const;

export class MergeDecisionDto {
  @IsIn(MERGE_DECISIONS, { message: 'Décision attendue : CONFIRM ou REJECT.' })
  decision!: (typeof MERGE_DECISIONS)[number];
}

export class ListMergeProposalsQuery {
  @IsOptional()
  @IsIn(['PENDING', 'CONFIRMED', 'REJECTED'])
  status?: 'PENDING' | 'CONFIRMED' | 'REJECTED';
}

export class ResolveQrDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  token!: string;
}

export class OwnAvailabilityDto {
  /** Un surveillant peut seulement se déclarer disponible ou indisponible ; « Absent » est réservé aux admins. */
  @IsIn(['AVAILABLE', 'UNAVAILABLE'])
  availability!: 'AVAILABLE' | 'UNAVAILABLE';
}

export class SetAvailabilityDto {
  @IsEnum(Availability)
  availability!: Availability;
}

export class ListCoverageQuery {
  /** Statut principal (FR-008c : filtres fondés sur le statut principal). */
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(MAIN_STATUSES, { each: true })
  mainStatus?: MainStatus[];

  /** Statut technique (tableau de suivi du super administrateur). */
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(RequestStatus, { each: true })
  status?: RequestStatus[];

  @IsOptional()
  @IsEnum(CoverageSource)
  source?: CoverageSource;

  @IsOptional()
  @IsEnum(CoverageType)
  type?: CoverageType;

  @IsOptional()
  @IsUUID()
  floorId?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  /** Inclure les affectations finales (terminées, annulées, non pourvues). */
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

  /** Étage de la classe : obligatoire à la création et à la modification (FR-006). */
  @IsUUID('all', { message: 'Choisissez l’étage de la classe.' })
  floorId!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class FloorDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le nom est obligatoire.' })
  @MaxLength(60, { message: 'Le nom ne doit pas dépasser 60 caractères.' })
  name!: string;

  @IsInt({ message: 'Position entière attendue.' })
  @Min(0)
  @Max(1000)
  position!: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateFloorDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le nom est obligatoire.' })
  @MaxLength(60, { message: 'Le nom ne doit pas dépasser 60 caractères.' })
  name?: string;

  @IsOptional()
  @IsInt({ message: 'Position entière attendue.' })
  @Min(0)
  @Max(1000)
  position?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
