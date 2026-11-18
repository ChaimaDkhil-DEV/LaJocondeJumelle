import type { Prisma } from '@prisma/client';
import { dayValue } from '../attendance/attendance.mapper';
import type { PrismaService } from '../common/prisma.service';
import { addDays, atLocalTime, localDate } from '../common/school-time';
import { SESSION_INCLUDE, toSessionView, type SessionRow } from './timetable.mapper';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Séances d'un enseignant vues par lui-même (020, US4) : les siennes, et celles qu'il prend comme remplaçant désigné
 * sur une absence annoncée. Le motif d'une annulation reste à l'administration. Lu par « Mon emploi du temps » et par
 * la page du QR (séance en cours ou prochaine) ; l'identité vient toujours de la session de l'appelant.
 */
export interface OwnSessionView extends Omit<ReturnType<typeof toSessionView>, 'cancelReason'> {
  /** Séance prise comme remplaçant désigné : le titulaire remplacé. */
  replaces: { displayName: string } | null;
  /** Séance couverte par une absence que l'enseignant a annoncée. */
  announcedAbsence: boolean;
}

interface Absence {
  teacherId: string | null;
  substituteTeacherId: string | null;
  startAt: Date;
  /** Fin de la plage annoncée ; sans fin, la fin du jour local. */
  endAt: Date;
  teacher: { displayName: string } | null;
}

const overlaps = (s: { startAt: Date; endAt: Date }, a: { startAt: Date; endAt: Date }) => s.startAt < a.endAt && a.startAt < s.endAt;

export async function ownSessions(db: Db, teacherId: string, from: string, to: string, timeZone: string): Promise<OwnSessionView[]> {
  const start = atLocalTime(from, '00:00', timeZone);
  const end = atLocalTime(addDays(to, 1), '00:00', timeZone);
  const range = { gte: dayValue(from), lte: dayValue(to) };
  const [own, announced] = await Promise.all([
    db.teachingSession.findMany({ where: { teacherId, localDate: range }, include: SESSION_INCLUDE }),
    db.coverageDetail.findMany({
      where: {
        source: 'TEACHER_REQUEST',
        type: 'ABSENCE',
        mergedIntoId: null,
        request: { status: { not: 'CANCELLED' } },
        OR: [{ teacherId }, { substituteTeacherId: teacherId }],
        startAt: { lt: end },
        AND: [{ OR: [{ plannedEndAt: null }, { plannedEndAt: { gt: start } }] }],
      },
      select: { teacherId: true, substituteTeacherId: true, startAt: true, plannedEndAt: true, teacher: { select: { displayName: true } } },
    }),
  ]);
  const absences: Absence[] = announced.map((a) => ({
    ...a,
    endAt: a.plannedEndAt ?? atLocalTime(addDays(localDate(a.startAt, timeZone), 1), '00:00', timeZone),
  }));
  const asSubstitute = absences.filter((a) => a.substituteTeacherId === teacherId && a.teacherId && a.teacherId !== teacherId);
  const replaced: SessionRow[] = asSubstitute.length
    ? await db.teachingSession.findMany({
        where: { status: 'SCHEDULED', localDate: range, teacherId: { in: [...new Set(asSubstitute.map((a) => a.teacherId!))] } },
        include: SESSION_INCLUDE,
      })
    : [];

  const view = (row: SessionRow, replaces: { displayName: string } | null): OwnSessionView => {
    // Le motif d'une annulation reste à l'administration : il n'est pas envoyé à l'enseignant.
    const rest: Partial<ReturnType<typeof toSessionView>> = toSessionView(row, timeZone);
    delete rest.cancelReason;
    return {
      ...(rest as Omit<ReturnType<typeof toSessionView>, 'cancelReason'>),
      replaces,
      announcedAbsence: replaces === null && absences.some((a) => a.teacherId === teacherId && overlaps(row, a)),
    };
  };
  const substituteViews = replaced.flatMap((row) => {
    const absence = asSubstitute.find((a) => a.teacherId === row.teacherId && overlaps(row, a));
    return absence ? [view(row, { displayName: absence.teacher?.displayName ?? row.teacher.displayName })] : [];
  });
  return [...own.map((row) => view(row, null)), ...substituteViews].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}
