import { IsDefined, IsOptional, IsString, Matches } from 'class-validator';
import { atLocalTime } from '../common/school-time';
import { endOfMinute } from './domain/situation';

/** Date et heure ISO 8601, avec ou sans fuseau (sans fuseau : celui de l'école). Une date seule est refusée. */
const MOMENT = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

export class SituationQuery {
  @IsDefined({ message: 'Indiquez la date et l’heure.' })
  @Matches(MOMENT, { message: 'Date et heure attendues (AAAA-MM-JJThh:mm), avec ou sans fuseau.' })
  at!: string;
}

/** Pagination du journal de l'élève, comme celle du journal d'audit. */
export class AuditTrailQuery {
  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export interface ParsedMoment {
  /** Minute demandée (secondes ignorées). */
  requested: Date;
  /** Instant évalué : la fin de cette minute. */
  evaluatedAt: Date;
}

/** Fuseau écrit `+0100` ou `+01:00` → `+01:00`. */
const withColon = (zone: string) => (zone === 'Z' || zone.includes(':') ? zone : `${zone.slice(0, 3)}:${zone.slice(3)}`);

/** Instant demandé, lu dans le fuseau de l'école s'il n'en porte pas ; null s'il n'existe pas (30 février…). */
export function parseMoment(at: string, timeZone: string): ParsedMoment | null {
  const match = MOMENT.exec(at);
  if (!match) return null;
  const [, date, time, zone] = match;
  let instant: Date;
  if (zone) {
    instant = new Date(`${date}T${time}:00${withColon(zone)}`);
  } else {
    try {
      instant = atLocalTime(date, time, timeZone);
    } catch {
      return null;
    }
  }
  if (Number.isNaN(instant.getTime())) return null;
  const evaluatedAt = endOfMinute(instant);
  return { requested: new Date(evaluatedAt.getTime() - 59_999), evaluatedAt };
}
