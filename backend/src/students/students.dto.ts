import { SchoolCycle } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

import { normalizeTunisianPhone, TUNISIAN_PHONE_FORMAT, TUNISIAN_PHONE_MESSAGE } from '../common/tunisian-phone';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Élève : une classe et un téléphone de parent. */
export class StudentDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le prénom est obligatoire.' })
  @MaxLength(60, { message: 'Le prénom ne doit pas dépasser 60 caractères.' })
  firstName!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le nom est obligatoire.' })
  @MaxLength(60, { message: 'Le nom ne doit pas dépasser 60 caractères.' })
  lastName!: string;

  @IsUUID('all', { message: 'Choisissez la classe de l’élève.' })
  classId!: string;

  @Transform(({ value }) => normalizeTunisianPhone(value))
  @IsString()
  @Matches(TUNISIAN_PHONE_FORMAT, { message: TUNISIAN_PHONE_MESSAGE })
  parentPhone!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Niveau scolaire (ex. « 1re année primaire ») : nom, cycle et ordre d'affichage, tous uniques ou obligatoires. */
export class LevelDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le nom est obligatoire.' })
  @MaxLength(60, { message: 'Le nom ne doit pas dépasser 60 caractères.' })
  name!: string;

  @IsEnum(SchoolCycle, { message: 'Choisissez le cycle : préparatoire ou primaire.' })
  cycle!: SchoolCycle;

  @IsInt({ message: 'Position entière attendue.' })
  @Min(0, { message: 'La position doit être positive ou nulle.' })
  @Max(1000, { message: 'La position ne doit pas dépasser 1000.' })
  position!: number;
}

export class UpdateLevelDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Le nom est obligatoire.' })
  @MaxLength(60, { message: 'Le nom ne doit pas dépasser 60 caractères.' })
  name?: string;

  @IsOptional()
  @IsEnum(SchoolCycle, { message: 'Choisissez le cycle : préparatoire ou primaire.' })
  cycle?: SchoolCycle;

  @IsOptional()
  @IsInt({ message: 'Position entière attendue.' })
  @Min(0, { message: 'La position doit être positive ou nulle.' })
  @Max(1000, { message: 'La position ne doit pas dépasser 1000.' })
  position?: number;
}
