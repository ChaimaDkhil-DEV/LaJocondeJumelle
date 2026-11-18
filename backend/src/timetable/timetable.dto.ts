import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Emplois du temps (020) — contracts/api.md. Dates `AAAA-MM-JJ`, heures locales `HH:MM`. */

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_MESSAGE = 'Date attendue (AAAA-MM-JJ).';
const TIME_MESSAGE = 'Heure attendue (HH:MM).';

/** Texte facultatif : espaces retirés, vide → null (effacer la valeur). */
const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateSessionDto {
  @IsUUID('all', { message: 'Choisissez l’enseignant.' })
  teacherId!: string;

  @IsUUID('all', { message: 'Choisissez la classe.' })
  classId!: string;

  @Matches(DATE_FORMAT, { message: DATE_MESSAGE })
  date!: string;

  @Matches(TIME_FORMAT, { message: TIME_MESSAGE })
  startTime!: string;

  @Matches(TIME_FORMAT, { message: TIME_MESSAGE })
  endTime!: string;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(100, { message: 'La matière fait au plus 100 caractères.' })
  subject?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(80, { message: 'La salle fait au plus 80 caractères.' })
  room?: string | null;
}

export class CreateSeriesDto {
  @IsUUID('all', { message: 'Choisissez l’enseignant.' })
  teacherId!: string;

  @IsUUID('all', { message: 'Choisissez la classe.' })
  classId!: string;

  @IsInt({ message: 'Choisissez le jour de la semaine.' })
  @Min(1, { message: 'Choisissez le jour de la semaine.' })
  @Max(7, { message: 'Choisissez le jour de la semaine.' })
  weekday!: number;

  @Matches(TIME_FORMAT, { message: TIME_MESSAGE })
  startTime!: string;

  @Matches(TIME_FORMAT, { message: TIME_MESSAGE })
  endTime!: string;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(100, { message: 'La matière fait au plus 100 caractères.' })
  subject?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(80, { message: 'La salle fait au plus 80 caractères.' })
  room?: string | null;

  @Matches(DATE_FORMAT, { message: DATE_MESSAGE })
  startDate!: string;

  @Matches(DATE_FORMAT, { message: DATE_MESSAGE })
  endDate!: string;
}

/** Modification d'une séance qui n'a pas commencé : seuls les champs envoyés changent. */
export class UpdateSessionDto {
  @IsOptional()
  @IsUUID('all', { message: 'Choisissez l’enseignant.' })
  teacherId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Choisissez la classe.' })
  classId?: string;

  @IsOptional()
  @Matches(DATE_FORMAT, { message: DATE_MESSAGE })
  date?: string;

  @IsOptional()
  @Matches(TIME_FORMAT, { message: TIME_MESSAGE })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_FORMAT, { message: TIME_MESSAGE })
  endTime?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(100, { message: 'La matière fait au plus 100 caractères.' })
  subject?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(80, { message: 'La salle fait au plus 80 caractères.' })
  room?: string | null;
}

/** Changement d'une série à partir d'une date (R2) ; le jour de la semaine ne change pas. */
export class UpdateSeriesDto {
  @Matches(DATE_FORMAT, { message: DATE_MESSAGE })
  from!: string;

  @IsOptional()
  @IsUUID('all', { message: 'Choisissez l’enseignant.' })
  teacherId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Choisissez la classe.' })
  classId?: string;

  @IsOptional()
  @Matches(TIME_FORMAT, { message: TIME_MESSAGE })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_FORMAT, { message: TIME_MESSAGE })
  endTime?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(100, { message: 'La matière fait au plus 100 caractères.' })
  subject?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(80, { message: 'La salle fait au plus 80 caractères.' })
  room?: string | null;

  @IsOptional()
  @Matches(DATE_FORMAT, { message: DATE_MESSAGE })
  endDate?: string;
}

export class CancelDto {
  @Transform(trim)
  @IsString({ message: 'Indiquez le motif de l’annulation.' })
  @MinLength(1, { message: 'Indiquez le motif de l’annulation.' })
  @MaxLength(500, { message: 'Le motif fait au plus 500 caractères.' })
  reason!: string;
}

export class CancelSeriesDto extends CancelDto {
  @Matches(DATE_FORMAT, { message: DATE_MESSAGE })
  from!: string;

  @Matches(DATE_FORMAT, { message: DATE_MESSAGE })
  to!: string;
}

export class SessionsQuery {
  @Matches(DATE_FORMAT, { message: DATE_MESSAGE })
  from!: string;

  @Matches(DATE_FORMAT, { message: DATE_MESSAGE })
  to!: string;

  @IsOptional()
  @IsUUID('all')
  teacherId?: string;

  @IsOptional()
  @IsUUID('all')
  classId?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  includeCancelled?: 'true' | 'false';
}

export class SeriesQuery {
  @IsOptional()
  @IsUUID('all')
  teacherId?: string;

  @IsOptional()
  @IsUUID('all')
  classId?: string;
}

/** « Mon emploi du temps » : aucune autre identité que celle de la session n'est acceptée. */
export class MineQuery {
  @Matches(DATE_FORMAT, { message: DATE_MESSAGE })
  from!: string;

  @Matches(DATE_FORMAT, { message: DATE_MESSAGE })
  to!: string;
}
