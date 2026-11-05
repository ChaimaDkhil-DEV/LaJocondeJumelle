import type { Person, SchoolClass } from '../coverage/types';

export type AttendanceStatus = 'ARRIVED' | 'ON_TIME' | 'LATE' | 'ABSENT';
export type AttendanceMethod = 'QR' | 'MANUAL';
/** Statuts posés par une personne (jamais « arrivée enregistrée », propre au scan). */
export type ManualStatus = 'ON_TIME' | 'LATE' | 'ABSENT';
export type AnnouncedType = 'LATENESS' | 'ABSENCE';

export interface AttendanceItem {
  id: string;
  /** Jour dans le fuseau de l'école (AAAA-MM-JJ). */
  date: string;
  method: AttendanceMethod;
  status: AttendanceStatus;
  arrivedAt: string | null;
  recordedAt: string;
  comment: string | null;
  class: SchoolClass;
  teacher: Person;
  recordedBy: Person;
  requestId: string | null;
  announcedType: AnnouncedType | null;
  announcedLateMinutes: number | null;
  /** Titulaire remplacé quand l'enseignant est le remplaçant autorisé. */
  substituteFor: Person | null;
  /** Scan d'un enseignant qui avait annoncé une absence couvrant ce moment. */
  anomaly: boolean;
}

export type ArrivalMatch =
  | { kind: 'NONE' }
  | { kind: 'ANNOUNCED_LATENESS'; requestId: string; lateMinutes: number }
  | { kind: 'ANNOUNCED_ABSENCE'; requestId: string }
  | { kind: 'SUBSTITUTE'; requestId: string; titularId: string };

export interface ArrivalResolution {
  class: SchoolClass;
  attendance: AttendanceItem | null;
  preview: ArrivalMatch;
}

export interface ArrivalResult {
  created: boolean;
  attendance: AttendanceItem;
  match: ArrivalMatch;
}

export interface AnnouncedItem {
  requestId: string;
  type: AnnouncedType | null;
  startAt: string;
  plannedEndAt: string | null;
  class: SchoolClass;
  teacher: Person | null;
  substituteTeacher: Person | null;
  status: string;
  /** Pointage scanné rattaché ; null : aucun scan enregistré (ce n'est pas une absence). */
  attendanceId: string | null;
}

export interface EmptyClassItem {
  requestId: string;
  startAt: string;
  class: SchoolClass;
  teacher: Person | null;
  declaredBy: Person;
}

export interface ClassState {
  class: SchoolClass;
  current: 'EMPTY' | 'OCCUPIED' | null;
  events: Array<{ at: string; kind: 'EMPTY' | 'ARRIVAL' }>;
}

export interface AttendanceDay {
  date: string;
  attendances: AttendanceItem[];
  announced: AnnouncedItem[];
  emptyClasses: EmptyClassItem[];
  classStates: ClassState[];
}

export interface ManualInput {
  teacherId: string;
  classId: string;
  date?: string;
  status: ManualStatus;
  arrivedTime?: string;
  comment?: string;
}

export interface CorrectionInput {
  id: string;
  status?: ManualStatus;
  arrivedTime?: string | null;
  comment?: string | null;
  reason: string;
}
