import { Priority } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

const toArray = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

/** Filtres communs du tableau de bord (GET /admin/dashboard/*). */
export class DashboardQuery {
  /** Début de période (date AAAA-MM-JJ ou date-heure ISO 8601), inclus ; 30 jours par défaut. */
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  /** Fin de période, incluse ; une date seule couvre toute la journée. Maintenant par défaut. */
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @IsOptional()
  @Transform(toArray)
  @IsUUID('all', { each: true })
  categoryId?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsEnum(Priority, { each: true })
  priority?: Priority[];

  /** Demandes dont l'employé est le demandeur ou la personne affectée. */
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  /** Fuseau IANA des jours de la série quotidienne (UTC par défaut). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tz?: string;
}

export class DashboardActivityQuery extends DashboardQuery {
  /** Position (seq) du dernier événement de la page précédente. */
  @IsOptional()
  @Matches(/^\d{1,19}$/)
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
