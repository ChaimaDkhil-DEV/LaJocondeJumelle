/** Emplois du temps (020) — contrats de specs/020-emplois-du-temps/contracts/api.md. */

export interface Person {
  id: string;
  displayName: string;
}

export interface TimetableSession {
  id: string;
  seriesId: string | null;
  /** Modifiée à part de sa série : les changements de la série ne la touchent plus. */
  detached: boolean;
  teacher: Person;
  class: { id: string; name: string; room: string | null };
  level: { id: string; name: string } | null;
  /** Jour local de l'école (AAAA-MM-JJ). */
  date: string;
  weekday: number;
  startAt: string;
  endAt: string;
  /** Heures locales de l'école (HH:MM), calculées par le serveur. */
  startTime: string;
  endTime: string;
  subject: string | null;
  room: string | null;
  status: 'SCHEDULED' | 'CANCELLED';
  /** Administration seulement ; absent des vues de l'enseignant. */
  cancelReason?: string | null;
  /** Vue de l'enseignant : séance prise comme remplaçant désigné. */
  replaces?: { displayName: string } | null;
  /** Vue de l'enseignant : séance couverte par une absence qu'il a annoncée. */
  announcedAbsence?: boolean;
}

export interface TimetableSeries {
  id: string;
  teacher: Person;
  class: { id: string; name: string; room: string | null };
  weekday: number;
  startTime: string;
  endTime: string;
  subject: string | null;
  room: string | null;
  startDate: string;
  endDate: string;
  upcomingCount?: number;
}

export interface TimetableConflict {
  kind: 'TEACHER' | 'CLASS';
  sessionId: string;
  date: string;
  startAt: string;
  endAt: string;
  teacher: Person;
  class: { id: string; name: string };
  proposed: { date: string; startAt: string; endAt: string };
}

export interface SessionInput {
  teacherId: string;
  classId: string;
  date: string;
  startTime: string;
  endTime: string;
  subject?: string | null;
  room?: string | null;
}

export interface SeriesInput extends Omit<SessionInput, 'date'> {
  weekday: number;
  startDate: string;
  endDate: string;
}

export interface MyTimetable {
  from: string;
  to: string;
  sessions: TimetableSession[];
}
