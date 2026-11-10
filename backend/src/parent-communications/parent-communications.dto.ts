import type { ParentCommunicationStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Texte facultatif : vide → null. */
const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
const normalizeUsername = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export const REMARK_MAX = 2000;
export const REASON_MAX = 1000;

/** POST /parent-communications : brouillon (remarque et vocal facultatifs à ce stade). */
export class CreateCommunicationDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  guardianId!: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(REMARK_MAX, { message: `La remarque ne doit pas dépasser ${REMARK_MAX} caractères.` })
  text?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  voiceFileId?: string | null;
}

/** PATCH /parent-communications/:id : modification d'un brouillon ou d'une communication retournée. */
export class UpdateCommunicationDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @IsUUID()
  guardianId?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(REMARK_MAX, { message: `La remarque ne doit pas dépasser ${REMARK_MAX} caractères.` })
  text?: string | null;

  /** null : retire le vocal du brouillon. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  voiceFileId?: string | null;
}

export class VersionDto {
  @IsInt()
  @Min(0)
  version!: number;
}

export const DECISIONS = ['APPROVE', 'RETURN', 'REJECT'] as const;
export type Decision = (typeof DECISIONS)[number];

/** POST /admin/parent-communications/:id/decision : décision sur exactement la version examinée. */
export class DecisionDto {
  @IsIn(DECISIONS)
  action!: Decision;

  /** Numéro de la version examinée : refusée si une nouvelle version a été soumise entre-temps. */
  @IsInt()
  @Min(1)
  revision!: number;

  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(REASON_MAX, { message: `Le motif ne doit pas dépasser ${REASON_MAX} caractères.` })
  reason?: string;
}

export const STATUS_FILTERS = [
  'PENDING_ADMIN_VALIDATION',
  'RETURNED_FOR_CORRECTION',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'ALL',
] as const;

/** Période de soumission, bornes incluses (AAAA-MM-JJ ou date-heure ISO 8601). */
export class PeriodQuery {
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

/** GET /admin/parent-communications/discussions : toutes les discussions, ou celles de la période. */
export class DiscussionsQuery extends PeriodQuery {}

/** GET /admin/parent-communications : en attente par défaut. */
export class ListCommunicationsQuery extends PeriodQuery {
  @IsOptional()
  @IsIn(STATUS_FILTERS)
  status?: Exclude<ParentCommunicationStatus, 'DRAFT'> | 'ALL';

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;
}

/** Représentant légal (administration). */
export class GuardianDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le prénom est obligatoire.' })
  @MaxLength(60)
  firstName!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le nom est obligatoire.' })
  @MaxLength(60)
  lastName!: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(40)
  relationship?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^\+?[0-9 ().-]{6,20}$/, { message: 'Numéro de téléphone invalide.' })
  phone?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_o, v) => v !== null)
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  @MaxLength(254)
  email?: string | null;

  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  studentIds!: string[];
}

export class UpdateGuardianDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  lastName?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(40)
  relationship?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^\+?[0-9 ().-]{6,20}$/, { message: 'Numéro de téléphone invalide.' })
  phone?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_o, v) => v !== null)
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  @MaxLength(254)
  email?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  studentIds?: string[];
}

/** Compte parent (rôle PARENT) d'un représentant : mêmes règles d'identifiant que les comptes du personnel. */
export class GuardianAccountDto {
  @Transform(normalizeUsername)
  @IsString()
  @MinLength(3, { message: 'L’identifiant doit comporter au moins 3 caractères.' })
  @MaxLength(64, { message: 'L’identifiant ne doit pas dépasser 64 caractères.' })
  @Matches(/^[a-z0-9._-]+$/, {
    message:
      'L’identifiant ne peut contenir que des lettres sans accent, chiffres, points, tirets et soulignés.',
  })
  username!: string;
}

export class TeacherClassesDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  classIds!: string[];
}
