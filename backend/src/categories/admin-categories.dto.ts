import { AssignmentMode, Circuit, ClosureMode, Priority, ProofMode, RequestKind, Role } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Délai maximal accepté : un an, en minutes. */
const MAX_MINUTES = 525_600;

export class CreateCategoryDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le nom est obligatoire.' })
  @MaxLength(60, { message: 'Le nom ne doit pas dépasser 60 caractères.' })
  name!: string;

  @IsEnum(Circuit)
  circuit!: Circuit;

  @IsArray()
  @ArrayMinSize(1, { message: 'Au moins un rôle doit pouvoir créer des demandes.' })
  @ArrayUnique()
  @IsEnum(Role, { each: true })
  creatorRoles!: Role[];

  @IsEnum(ClosureMode)
  closureMode!: ClosureMode;

  @IsOptional()
  @IsInt()
  @Min(0, { message: 'Le délai avant clôture automatique ne peut pas être négatif.' })
  @Max(43_200)
  autoCloseAfterMinutes?: number;

  @IsOptional()
  @IsBoolean()
  finalValidation?: boolean;

  @IsOptional()
  @IsEnum(AssignmentMode)
  assignmentMode?: AssignmentMode;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  autoAssigneeId?: string | null;

  @IsOptional()
  @IsBoolean()
  photoRequired?: boolean;

  /** WORK (par défaut) ou COVERAGE ; ne peut plus être modifié ensuite. */
  @IsOptional()
  @IsEnum(RequestKind)
  kind?: RequestKind;

  /** Couverture : preuve de présence exigée. */
  @IsOptional()
  @IsEnum(ProofMode)
  proofMode?: ProofMode;
}

export class UpdateCategoryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le nom est obligatoire.' })
  @MaxLength(60, { message: 'Le nom ne doit pas dépasser 60 caractères.' })
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsEnum(Circuit)
  circuit?: Circuit;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Au moins un rôle doit pouvoir créer des demandes.' })
  @ArrayUnique()
  @IsEnum(Role, { each: true })
  creatorRoles?: Role[];

  @IsOptional()
  @IsEnum(ClosureMode)
  closureMode?: ClosureMode;

  @IsOptional()
  @IsInt()
  @Min(0, { message: 'Le délai avant clôture automatique ne peut pas être négatif.' })
  @Max(43_200)
  autoCloseAfterMinutes?: number;

  @IsOptional()
  @IsBoolean()
  finalValidation?: boolean;

  @IsOptional()
  @IsEnum(AssignmentMode)
  assignmentMode?: AssignmentMode;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  autoAssigneeId?: string | null;

  @IsOptional()
  @IsBoolean()
  photoRequired?: boolean;

  /** Accepté uniquement s'il est identique au type actuel (le type est figé à la création). */
  @IsOptional()
  @IsEnum(RequestKind)
  kind?: RequestKind;

  @IsOptional()
  @IsEnum(ProofMode)
  proofMode?: ProofMode;
}

export class MembersDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  userIds!: string[];
}

export class DeadlineRuleDto {
  @IsEnum(Priority)
  priority!: Priority;

  @ValidateIf((_o, v) => v !== null)
  @IsInt({ message: 'Nombre entier de minutes attendu (ou vide).' })
  @Min(1, { message: 'Un délai doit être d’au moins 1 minute.' })
  @Max(MAX_MINUTES)
  validationMinutes!: number | null;

  @ValidateIf((_o, v) => v !== null)
  @IsInt({ message: 'Nombre entier de minutes attendu (ou vide).' })
  @Min(1, { message: 'Un délai doit être d’au moins 1 minute.' })
  @Max(MAX_MINUTES)
  takeoverMinutes!: number | null;

  @ValidateIf((_o, v) => v !== null)
  @IsInt({ message: 'Nombre entier de minutes attendu (ou vide).' })
  @Min(1, { message: 'Un délai doit être d’au moins 1 minute.' })
  @Max(MAX_MINUTES)
  completionMinutes!: number | null;

  /** Couverture uniquement (vide pour les demandes de travail). */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt({ message: 'Nombre entier de minutes attendu (ou vide).' })
  @Min(1, { message: 'Un délai doit être d’au moins 1 minute.' })
  @Max(MAX_MINUTES)
  arrivalMinutes?: number | null;
}

export class DeadlineRulesDto {
  @IsArray()
  @ArrayMinSize(4, { message: 'Une règle par priorité est attendue (4).' })
  @ArrayMaxSize(4, { message: 'Une règle par priorité est attendue (4).' })
  @ValidateNested({ each: true })
  @Type(() => DeadlineRuleDto)
  rules!: DeadlineRuleDto[];
}
