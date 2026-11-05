import { MealService, SchoolCycle } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Espaces multiples réduits : « 06  12 34 » → « 06 12 34 ». */
const phone = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);

/** Élève : une classe, un téléphone de parent et exactement un service de restauration. */
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

  @Transform(phone)
  @IsString()
  @Matches(/^\+?\d[\d ]{6,18}\d$/, { message: 'Numéro invalide : chiffres et espaces, « + » possible au début (8 à 20 caractères).' })
  parentPhone!: string;

  /** Un seul service : CANTINE ou PANIER (jamais les deux, jamais aucun). */
  @IsEnum(MealService, { message: 'Choisissez le service de restauration : cantine ou panier.' })
  mealService!: MealService;

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
