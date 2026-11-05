import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;

const trimOrUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/** Jeton lu dans le QR code de la classe (même jeton que les gardes). */
export class QrTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  token!: string;
}

export class DayQuery {
  @IsOptional()
  @Matches(DATE_FORMAT, { message: 'Date attendue (AAAA-MM-JJ).' })
  date?: string;
}

/** Statuts posés par une personne : jamais « arrivée enregistrée » (propre au scan). */
export const MANUAL_STATUSES = ['ON_TIME', 'LATE', 'ABSENT'] as const;

/** Régularisation d'un oubli de scan par la surveillante. */
export class ManualAttendanceDto {
  @IsUUID('all', { message: 'Choisissez l’enseignant.' })
  teacherId!: string;

  @IsUUID('all', { message: 'Choisissez la classe.' })
  classId!: string;

  /** Jour concerné ; aujourd'hui par défaut. */
  @IsOptional()
  @Matches(DATE_FORMAT, { message: 'Date attendue (AAAA-MM-JJ).' })
  date?: string;

  @IsIn(MANUAL_STATUSES, { message: 'Statut attendu : présent, en retard ou absent.' })
  status!: (typeof MANUAL_STATUSES)[number];

  /** Heure réelle d'arrivée, si la surveillante la connaît ; distincte de l'heure de saisie (serveur). */
  @IsOptional()
  @Matches(TIME_FORMAT, { message: 'Heure d’arrivée attendue (HH:MM).' })
  arrivedTime?: string;

  /** Motif ou commentaire ; obligatoire pour une absence. */
  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(500)
  comment?: string;
}

/** Correction d'une saisie ou qualification d'un scan ; le motif est obligatoire et tracé. */
export class CorrectAttendanceDto {
  @IsOptional()
  @IsIn(MANUAL_STATUSES, { message: 'Statut attendu : présent, en retard ou absent.' })
  status?: (typeof MANUAL_STATUSES)[number];

  /** null efface l'heure d'arrivée (saisie manuelle seulement). */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(TIME_FORMAT, { message: 'Heure d’arrivée attendue (HH:MM).' })
  arrivedTime?: string | null;

  /** null efface le commentaire. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value))
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(500)
  comment?: string | null;

  /** Motif de la correction (conservé au journal d'audit). */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Indiquez le motif de la correction.' })
  @MinLength(1, { message: 'Indiquez le motif de la correction.' })
  @MaxLength(300)
  reason!: string;
}

/** Désignation du remplaçant d'une absence annoncée ; null retire le remplaçant. */
export class SetSubstituteDto {
  @ValidateIf((_o, v) => v !== null)
  @IsUUID('all', { message: 'Choisissez l’enseignant remplaçant.' })
  teacherId!: string | null;
}
