import type { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Rôles des comptes du personnel. Un compte parent (PARENT, 015) se crée uniquement depuis la fiche du
 * représentant légal, jamais par la gestion des comptes.
 */
export const STAFF_ROLES: readonly Role[] = ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'];

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizeUsername = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
/** Fonction vide → null (champ facultatif effacé). */
const trimOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);

export class CreateUserDto {
  @Transform(normalizeUsername)
  @IsString()
  @MinLength(3, { message: 'L’identifiant doit comporter au moins 3 caractères.' })
  @MaxLength(64, { message: 'L’identifiant ne doit pas dépasser 64 caractères.' })
  @Matches(/^[a-z0-9._-]+$/, { message: 'L’identifiant ne peut contenir que des lettres sans accent, chiffres, points, tirets et soulignés.' })
  username!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le nom est obligatoire.' })
  @MaxLength(100, { message: 'Le nom ne doit pas dépasser 100 caractères.' })
  displayName!: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(100, { message: 'La fonction ne doit pas dépasser 100 caractères.' })
  jobTitle?: string | null;

  @IsIn(STAFF_ROLES, { message: 'Rôle inconnu.' })
  role!: Role;

  /**
   * Catégories dont le compte est destinataire : seuls ces comptes peuvent recevoir une demande
   * (circuit A) ou y être affectés par un admin (circuit B, réaffectation).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true, message: 'Catégorie inconnue.' })
  recipientCategoryIds?: string[];

  /** Affectations : étage de rattachement d'un surveillant, facultatif (004, FR-006). null efface. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID('all', { message: 'Étage inconnu.' })
  floorId?: string | null;
}

export class UpdateUserDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le nom est obligatoire.' })
  @MaxLength(100, { message: 'Le nom ne doit pas dépasser 100 caractères.' })
  displayName?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(100, { message: 'La fonction ne doit pas dépasser 100 caractères.' })
  jobTitle?: string | null;

  @IsOptional()
  @IsIn(STAFF_ROLES, { message: 'Rôle inconnu.' })
  role?: Role;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /**
   * Catégories dont le compte est destinataire : seuls ces comptes peuvent recevoir une demande
   * (circuit A) ou y être affectés par un admin (circuit B, réaffectation).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true, message: 'Catégorie inconnue.' })
  recipientCategoryIds?: string[];

  /** Affectations : étage de rattachement d'un surveillant, facultatif (004, FR-006). null efface. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID('all', { message: 'Étage inconnu.' })
  floorId?: string | null;
}

/** GET /admin/users : liste paginée (curseur opaque, voir `users.service.ts`). */
export class ListUsersQuery {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
