import { Priority, RequestStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

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

export const REQUEST_SCOPES = ['mine', 'assigned', 'managed', 'all'] as const;
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
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
