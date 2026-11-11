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
  Max,
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

/** Corps d'un message (017, FR-007) : un texte, un vocal, ou les deux (vérifié par le service). */
export class MessageBodyDto {
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(REMARK_MAX, { message: `Le message ne doit pas dépasser ${REMARK_MAX} caractères.` })
  text?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  voiceFileId?: string | null;
}

/** POST /communications/teacher/conversations et /parent/messages/conversations : au sujet d'un élève. */
export class StartConversationDto extends MessageBodyDto {
  @IsUUID()
  studentId!: string;
}

export const CONVERSATION_TYPES = ['INTERNAL', 'PARENT'] as const;

/** POST /admin/communications/conversations : avec un enseignant (INTERNAL) ou un représentant (PARENT). */
export class AdminStartConversationDto extends StartConversationDto {
  @IsIn(CONVERSATION_TYPES)
  type!: (typeof CONVERSATION_TYPES)[number];

  @ValidateIf((o: AdminStartConversationDto) => o.type === 'INTERNAL')
  @IsUUID()
  teacherId?: string;

  @ValidateIf((o: AdminStartConversationDto) => o.type === 'PARENT')
  @IsUUID()
  guardianId?: string;

  /** « Contacter le parent » : conversation interne d'origine (PARENT seulement). */
  @IsOptional()
  @ValidateIf((o: AdminStartConversationDto) => o.type === 'PARENT')
  @IsUUID()
  linkedInternalId?: string;
}

/** PATCH /admin/communications/messages/:id : correction d'un message retourné (auteur seulement). */
export class EditMessageDto extends MessageBodyDto {
  @IsInt()
  @Min(0)
  version!: number;
}

export class VersionDto {
  @IsInt()
  @Min(0)
  version!: number;
}

export const DECISIONS = ['APPROVE', 'RETURN', 'REJECT'] as const;
export type Decision = (typeof DECISIONS)[number];

/** POST /admin/communications/messages/:id/decision : décision sur exactement la version examinée. */
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

/** PUT /admin/communications/conversations/:id/responsible : null libère la conversation. */
export class ResponsibleDto {
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  adminId!: string | null;
}

/** Période, bornes incluses (AAAA-MM-JJ ou date-heure ISO 8601). */
export class PeriodQuery {
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

const toBoolean = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);
const toInt = ({ value }: { value: unknown }) => (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value);

export const CONVERSATION_FILTER_TYPES = ['INTERNAL', 'PARENT', 'LEGACY_TEACHER_PARENT'] as const;
export const CONVERSATION_STATUSES = ['OPEN', 'CLOSED'] as const;
export const CONVERSATIONS_PAGE_MAX = 50;

/** GET /admin/communications/conversations : recherche, la plus récemment active d'abord. */
export class ConversationsQuery extends PeriodQuery {
  @IsOptional()
  @IsIn(CONVERSATION_FILTER_TYPES)
  type?: (typeof CONVERSATION_FILTER_TYPES)[number];

  @IsOptional()
  @IsIn(CONVERSATION_STATUSES)
  status?: (typeof CONVERSATION_STATUSES)[number];

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsUUID()
  guardianId?: string;

  /** Conversations dont je suis l'administrateur responsable. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  mine?: boolean;

  /** Nom de l'élève, du représentant ou de l'enseignant. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(CONVERSATIONS_PAGE_MAX)
  limit?: number;
}

export const VALIDATION_STATUS_FILTERS = [
  'PENDING_ADMIN_VALIDATION',
  'RETURNED_FOR_CORRECTION',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;

/** GET /admin/communications/to-validate : messages de l'administration aux parents, en attente par défaut. */
export class ToValidateQuery extends PeriodQuery {
  @IsOptional()
  @IsIn(VALIDATION_STATUS_FILTERS)
  status?: Exclude<ParentCommunicationStatus, 'DRAFT' | 'SENT'>;

  @IsOptional()
  @IsUUID()
  authorId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;
}

export class RecipientsQuery {
  @IsUUID()
  studentId!: string;
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
