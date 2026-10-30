import { MealService } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

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
