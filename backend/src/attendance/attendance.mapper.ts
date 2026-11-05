import type { Prisma } from '@prisma/client';

/** Relations chargées pour toutes les vues d'un pointage. */
export const ATTENDANCE_INCLUDE = {
  class: { select: { id: true, name: true, room: true } },
  teacher: { select: { id: true, displayName: true } },
  recordedBy: { select: { id: true, displayName: true } },
  substituteFor: { select: { id: true, displayName: true } },
  request: { select: { coverage: { select: { type: true } } } },
} as const satisfies Prisma.TeacherAttendanceInclude;

export type AttendanceRow = Prisma.TeacherAttendanceGetPayload<{ include: typeof ATTENDANCE_INCLUDE }>;

export const dayString = (date: Date): string => date.toISOString().slice(0, 10);
/** Valeur d'une colonne `@db.Date` : minuit UTC du jour local. */
export const dayValue = (date: string): Date => new Date(`${date}T00:00:00.000Z`);

export function toAttendanceView(row: AttendanceRow) {
  const announcedType = row.request?.coverage?.type === 'LATENESS' || row.request?.coverage?.type === 'ABSENCE' ? row.request.coverage.type : null;
  return {
    id: row.id,
    date: dayString(row.localDate),
    method: row.method,
    status: row.status,
    arrivedAt: row.arrivedAt,
    recordedAt: row.recordedAt,
    comment: row.comment,
    class: row.class,
    teacher: row.teacher,
    recordedBy: row.recordedBy,
    requestId: row.requestId,
    announcedType,
    announcedLateMinutes: row.announcedLateMinutes,
    /** Titulaire remplacé quand l'enseignant est le remplaçant autorisé. */
    substituteFor: row.substituteFor,
    /** Scan d'un enseignant qui avait annoncé une absence couvrant ce moment : à vérifier par l'admin. */
    anomaly: row.method === 'QR' && announcedType === 'ABSENCE' && row.substituteForId === null,
  };
}

export type AttendanceView = ReturnType<typeof toAttendanceView>;
