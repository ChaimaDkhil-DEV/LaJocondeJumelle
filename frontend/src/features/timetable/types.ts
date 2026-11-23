/** Emplois du temps (020) — contrats de specs/020-emplois-du-temps/contracts/api.md. */

export interface Person {
  id: string;
  displayName: string;
}

import type { LateReason, SessionStatus } from '../attendance/types';

/**
 * Présence de l'enseignant sur une séance, calculée par le serveur d'après le pointage (administration seulement,
 * sur une semaine au plus) : même calcul que la liste des enseignants attendus.
 */
export interface SessionPresence {
  status: SessionStatus;
  /** Heure réelle du pointage de l'enseignant prévu ; null sans pointage. */
  arrivedAt: string | null;
  lateMinutes: number | null;
  lateReason: LateReason | null;
  requestId: string | null;
  /** Remplaçant désigné sur une absence annoncée : le titulaire reste `teacher`. */
  replacedBy: Person | null;
  /** Le remplaçant, évalué sur ses propres pointages. */
  substitute: { teacher: Person; status: SessionStatus; arrivedAt: string | null; lateMinutes: number | null } | null;
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
  /** Vue d'administration : présence de l'enseignant ; null ou absente hors d'une semaine, ou séance annulée. */
  presence?: SessionPresence | null;
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
