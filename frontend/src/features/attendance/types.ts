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

/** Présence dans l'établissement (019) : arrivé aujourd'hui et pas reparti. */
export type PresenceState = 'NOT_ARRIVED' | 'PRESENT' | 'DEPARTED';

/** Ce que l'enseignant voit de sa propre présence. */
export interface OwnPresence {
  state: PresenceState;
  firstArrivalAt: string | null;
  /** Heure du départ en cours ; null s'il est présent ou pas arrivé. */
  departedAt: string | null;
}

/** Réponse d'un scan de départ ou de retour ; `created` faux : l'état était déjà enregistré. */
export interface PresenceResult {
  created: boolean;
  presence: OwnPresence;
}

export interface ArrivalResolution {
  class: SchoolClass;
  attendance: AttendanceItem | null;
  preview: ArrivalMatch;
  presence: OwnPresence;
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

/** Une ligne par enseignant, quel que soit le nombre de classes scannées. */
export interface PresentTeacher {
  teacher: Person;
  /** null : saisie de l'administration sans heure. */
  firstArrivalAt: string | null;
  lastClass: SchoolClass;
  lastSeenAt: string;
}

export interface TeacherDeparture {
  id: string;
  departedAt: string;
  method: AttendanceMethod;
  /** Classe dont le QR a été scanné pour partir ; null pour une saisie de l'administration. */
  class: SchoolClass | null;
  recordedBy: Person;
  comment: string | null;
}

export interface DepartedTeacher extends PresentTeacher {
  departure: TeacherDeparture;
}

export interface PresentList {
  date: string;
  present: PresentTeacher[];
  departed: DepartedTeacher[];
}

export interface DepartureInput {
  teacherId: string;
  departedTime?: string;
  comment?: string;
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
