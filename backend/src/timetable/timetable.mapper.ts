import type { Prisma } from '@prisma/client';
import { dayString } from '../attendance/attendance.mapper';
import { localTime } from '../common/school-time';
import { isoWeekday } from './domain/series';

/** Vues d'une séance et d'une série (020, contracts/api.md). */

const PERSON = { select: { id: true, displayName: true } } as const;

export const SESSION_INCLUDE = {
  teacher: PERSON,
  class: { select: { id: true, name: true, room: true, level: { select: { id: true, name: true } } } },
} as const satisfies Prisma.TeachingSessionInclude;

export type SessionRow = Prisma.TeachingSessionGetPayload<{ include: typeof SESSION_INCLUDE }>;

/** `timeZone` : fuseau de l'école, pour les heures locales affichées (`HH:MM`). */
export function toSessionView(row: SessionRow, timeZone: string) {
  const date = dayString(row.localDate);
  return {
    id: row.id,
    seriesId: row.seriesId,
    detached: row.detached,
    teacher: row.teacher,
    class: { id: row.class.id, name: row.class.name, room: row.class.room },
    level: row.class.level,
    date,
    weekday: isoWeekday(date),
    startAt: row.startAt,
    endAt: row.endAt,
    startTime: localTime(row.startAt, timeZone),
    endTime: localTime(row.endAt, timeZone),
    subject: row.subject,
    // Sans salle propre, la séance a lieu dans la salle de la classe.
    room: row.room ?? row.class.room,
    status: row.status,
    cancelReason: row.cancelReason,
  };
}

export type SessionView = ReturnType<typeof toSessionView>;

export const SERIES_INCLUDE = {
  teacher: PERSON,
  class: { select: { id: true, name: true, room: true } },
} as const satisfies Prisma.TimetableSeriesInclude;

export type SeriesRow = Prisma.TimetableSeriesGetPayload<{ include: typeof SERIES_INCLUDE }>;

export function toSeriesView(row: SeriesRow, upcomingCount?: number) {
  return {
    id: row.id,
    teacher: row.teacher,
    class: row.class,
    weekday: row.weekday,
    startTime: row.startTime,
    endTime: row.endTime,
    subject: row.subject,
    room: row.room,
    startDate: dayString(row.startDate),
    endDate: dayString(row.endDate),
    ...(upcomingCount !== undefined ? { upcomingCount } : {}),
  };
}
