import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Consigne (spec 009, FR-015) : titre 1 à 120 caractères, texte 1 à 4 000, portée générale ou une catégorie. */
export class CreateGuidelineDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le titre est obligatoire.' })
  @MaxLength(120, { message: 'Le titre ne doit pas dépasser 120 caractères.' })
  title!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le texte est obligatoire.' })
  @MaxLength(4000, { message: 'Le texte ne doit pas dépasser 4 000 caractères.' })
  body!: string;

  /** null : consigne générale. */
  @ValidateIf((_o, value) => value !== null)
  @IsUUID('all', { message: 'Choisissez une catégorie de demande de travail.' })
  categoryId!: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateGuidelineDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le titre est obligatoire.' })
  @MaxLength(120, { message: 'Le titre ne doit pas dépasser 120 caractères.' })
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le texte est obligatoire.' })
  @MaxLength(4000, { message: 'Le texte ne doit pas dépasser 4 000 caractères.' })
  body?: string;

  @ValidateIf((_o, value) => value !== null && value !== undefined)
  @IsUUID('all', { message: 'Choisissez une catégorie de demande de travail.' })
  categoryId?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
