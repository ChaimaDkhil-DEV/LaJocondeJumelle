/**
 * Situation d'un élève à un instant donné (021). Fonction pure : aucune base, aucune horloge, les faits sont des
 * paramètres. Elle assemble des faits déjà enregistrés (classe de l'élève, emploi du temps, pointage, annonces,
 * remplaçants, gardes) et dit pour chaque rubrique s'il est connu, probable, aucun ou indisponible. Elle ne devine
 * jamais : un enseignant sans arrivée enregistrée est « aucune arrivée enregistrée », jamais « absent » (FR-017).
 */

const MINUTE_MS = 60_000;

/** Disponibilité d'une rubrique : valeur enregistrée, déduite de la classe actuelle, rien d'enregistré, ou inconnaissable. */
export type Availability = 'KNOWN' | 'PROBABLE' | 'NONE' | 'UNAVAILABLE';

export interface Section<T> {
  availability: Availability;
  value?: T;
  /** Toujours présent pour PROBABLE. */
  warning?: string;
  /** Toujours présent pour UNAVAILABLE. */
  reasonUnavailable?: string;
}

export interface Person {
  id: string;
  displayName: string;
  /** Compte dont les données ont été anonymisées : le nom n'est plus connu. */
  anonymized?: boolean;
}

// ---------------------------------------------------------------------------
// Faits en entrée
// ---------------------------------------------------------------------------

export interface PeriodFact {
  classId: string;
  startedAt: Date;
  /** Écriture de la ligne : pour une ligne reconstituée, la mise en service. */
  createdAt: Date;
  reconstructed: boolean;
}

export interface ClassInfo {
  id: string;
  name: string;
  level: string | null;
  floor: string | null;
  room: string | null;
}

export interface SessionFact {
  id: string;
  teacher: Person;
  subject: string | null;
  room: string | null;
  startAt: Date;
  endAt: Date;
  status: 'SCHEDULED' | 'CANCELLED';
  cancelReason: string | null;
  cancelledAt: Date | null;
  cancelledBy: Person | null;
}

/** Un pointage de la classe ce jour-là (TeacherAttendance). */
export interface AttendanceFact {
  teacher: Person;
  status: 'ARRIVED' | 'ON_TIME' | 'LATE' | 'ABSENT';
  method: 'QR' | 'MANUAL';
  /** Heure réelle ; null pour une saisie sans heure. */
  arrivedAt: Date | null;
  recordedAt: Date;
  comment: string | null;
  /** Une correction a été journalisée pour cette ligne : la valeur est la valeur corrigée. */
  corrected: boolean;
  /** Titulaire remplacé, si cet enseignant est le remplaçant autorisé. */
  substituteForId: string | null;
}

export interface DepartureFact {
  teacher: Person;
  departedAt: Date;
  returnedAt: Date | null;
}

export interface SubstituteEventFact {
  at: Date;
  seq: number;
  fromTeacherId: string | null;
  toTeacherId: string | null;
  byId: string | null;
}

/** Retard ou absence annoncés (CoverageDetail source TEACHER_REQUEST). */
export interface AnnouncementFact {
  requestId: string;
  type: 'ABSENCE' | 'LATENESS';
  teacherId: string | null;
  startAt: Date;
  plannedEndAt: Date | null;
  announcedAt: Date;
  reason: string | null;
  announcedLateMinutes: number | null;
  anonymized: boolean;
  /** Valeur actuelle de `substituteTeacherId`, écrasée à chaque changement. */
  currentSubstituteId: string | null;
  /** Changements du remplaçant (événements SUBSTITUTE_SET). */
  substituteEvents: SubstituteEventFact[];
}

export interface AssigneeEventFact {
  at: Date;
  seq: number;
  kind: 'ASSIGNED' | 'REASSIGNED' | 'RELEASED';
  assigneeId: string | null;
}

/** Une garde de la classe (CoverageDetail), tous types. */
export interface CoverageFact {
  requestId: string;
  source: 'TEACHER_REQUEST' | 'SUPERVISOR_REPORT' | 'ADMIN_DIRECT' | null;
  type: 'ABSENCE' | 'LATENESS' | 'EMPTY_CLASS' | null;
  startAt: Date;
  plannedEndAt: Date | null;
  relievedAt: Date | null;
  assigneeEvents: AssigneeEventFact[];
  presences: Array<{ userId: string; at: Date }>;
  supports: Array<{ userId: string; joinedAt: Date; releasedAt: Date | null }>;
}

export interface ChangeFact {
  kind: string;
  at: Date;
  by: Person | null;
  before: unknown;
  after: unknown;
  reason: string | null;
}

export interface SituationFacts {
  timeZone: string;
  student: { id: string; firstName: string; lastName: string; createdAt: Date };
  /** Périodes de classe de l'élève, dans l'ordre d'écriture (`startedAt`, puis `seq`). */
  periods: readonly PeriodFact[];
  classes: Record<string, ClassInfo>;
  /** Séances de la classe de l'élève à l'instant, ce jour-là, tous statuts. */
  sessions: readonly SessionFact[];
  attendances: readonly AttendanceFact[];
  departures: readonly DepartureFact[];
  announcements: readonly AnnouncementFact[];
  coverages: readonly CoverageFact[];
  users: Record<string, Person>;
  changes: readonly ChangeFact[];
}

// ---------------------------------------------------------------------------
// Situation en sortie
// ---------------------------------------------------------------------------

export interface ClassValue extends ClassInfo {
  since: Date;
  until: Date | null;
  reconstructed: boolean;
}

export interface SessionValue {
  id: string;
  teacher: Person;
  subject: string | null;
  room: string | null;
  startAt: Date;
  endAt: Date;
  status: 'SCHEDULED' | 'CANCELLED';
  cancellation: { reason: string | null; at: Date | null; by: Person | null } | null;
}

export interface ArrivalValue {
  teacher: Person;
  status: AttendanceFact['status'];
  method: AttendanceFact['method'];
  arrivedAt: Date | null;
  recordedAt: Date;
  comment: string | null;
  corrected: boolean;
}

export interface TeacherValue {
  arrivals: ArrivalValue[];
  /** Arrivées enregistrées après l'instant demandé : à ce moment-là, l'enseignant n'était pas encore là. */
  laterArrivals: ArrivalValue[];
  absences: ArrivalValue[];
  /** Départs de l'établissement sans retour à l'instant demandé. */
  departures: Array<{ teacher: Person; departedAt: Date }>;
  /** L'arrivée est un fait de la journée : l'enseignant a plusieurs séances dans cette classe ce jour-là. */
  dayLevelOnly: boolean;
}

export interface AnnouncementValue {
  requestId: string;
  type: 'ABSENCE' | 'LATENESS';
  announcedLateMinutes: number | null;
  reason: string | null;
  startAt: Date;
  plannedEndAt: Date | null;
  announcedAt: Date;
  anonymized: boolean;
}

export interface SubstituteValue {
  inForce: Person | null;
  previous: Array<{ teacher: Person; setAt: Date; setBy: Person | null; madeAfterMoment: boolean }>;
  arrived: { teacher: Person; arrivedAt: Date | null; recordedAt: Date } | null;
}

export interface SupervisorsValue {
  source: CoverageFact['source'];
  type: CoverageFact['type'];
  startAt: Date;
  endAt: Date | null;
  assignee: { user: Person; state: 'PRESENT' | 'ASSIGNED_NOT_RECORDED'; presentSince: Date | null } | null;
  reinforcements: Array<{ user: Person; joinedAt: Date }>;
}

export interface ChangeValue extends ChangeFact {
  madeAfterMoment: boolean;
}

export interface Situation {
  student: { id: string; firstName: string; lastName: string };
  moment: { evaluatedAt: Date; timeZone: string };
  class: Section<ClassValue>;
  session: Section<SessionValue>;
  teacher: Section<TeacherValue>;
  announcement: Section<AnnouncementValue>;
  substitute: Section<SubstituteValue>;
  supervisors: Section<SupervisorsValue>;
  changes: Section<ChangeValue[]>;
}

// ---------------------------------------------------------------------------
// Règles
// ---------------------------------------------------------------------------

/** Instant évalué : la fin de la minute demandée, pour qu'un fait de cette minute compte (secondes ignorées). */
export function endOfMinute(at: Date): Date {
  return new Date(Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS - 1);
}

/** Période de classe en vigueur : la dernière commencée à l'instant demandé, dans l'ordre d'écriture. */
export function classAt(periods: readonly PeriodFact[], at: Date): PeriodFact | null {
  let found: PeriodFact | null = null;
  for (const period of periods) if (period.startedAt.getTime() <= at.getTime()) found = period;
  return found;
}

const NO_CLASS_REASON = 'Avant la création de l’élève : aucune classe n’est connue à cet instant.';

function formatDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone }).format(date);
}

const known = <T>(value: T): Section<T> => ({ availability: 'KNOWN', value });
const none = <T>(value?: T): Section<T> => (value === undefined ? { availability: 'NONE' } : { availability: 'NONE', value });
const unavailable = (reasonUnavailable: string): Section<never> => ({ availability: 'UNAVAILABLE', reasonUnavailable });

/** Heure de l'arrivée d'un pointage : l'heure réelle, sinon l'heure d'enregistrement. */
const arrivalTime = (a: AttendanceFact) => (a.arrivedAt ?? a.recordedAt).getTime();

const byOrder = <T extends { at: Date; seq: number }>(a: T, b: T) => a.at.getTime() - b.at.getTime() || a.seq - b.seq;

function toArrival(a: AttendanceFact): ArrivalValue {
  return { teacher: a.teacher, status: a.status, method: a.method, arrivedAt: a.arrivedAt, recordedAt: a.recordedAt, comment: a.comment, corrected: a.corrected };
}

/** Séance qui couvre l'instant : une séance prévue l'emporte sur une séance annulée. */
function sessionAt(sessions: readonly SessionFact[], at: Date): SessionFact | null {
  const covering = sessions.filter((s) => s.startAt.getTime() <= at.getTime() && at.getTime() < s.endAt.getTime());
  return covering.find((s) => s.status === 'SCHEDULED') ?? covering[0] ?? null;
}

/** Annonce du titulaire qui chevauche la séance (même règle que la liste des enseignants attendus, 020). */
function announcementFor(announcements: readonly AnnouncementFact[], session: SessionFact): AnnouncementFact | null {
  const matching = announcements.filter(
    (a) =>
      a.teacherId === session.teacher.id &&
      a.startAt.getTime() < session.endAt.getTime() &&
      (a.plannedEndAt === null || a.plannedEndAt.getTime() > session.startAt.getTime()),
  );
  matching.sort((a, b) => b.announcedAt.getTime() - a.announcedAt.getTime());
  return matching[0] ?? null;
}

export function buildSituation(facts: SituationFacts, at: Date): Situation {
  const person = (id: string | null): Person | null => (id === null ? null : (facts.users[id] ?? { id, displayName: '(compte anonymisé)', anonymized: true }));
  const base = { student: { id: facts.student.id, firstName: facts.student.firstName, lastName: facts.student.lastName }, moment: { evaluatedAt: at, timeZone: facts.timeZone } };

  const period = at.getTime() < facts.student.createdAt.getTime() ? null : classAt(facts.periods, at);
  if (!period) {
    const reason = NO_CLASS_REASON;
    return {
      ...base,
      class: unavailable(reason),
      session: unavailable(reason),
      teacher: unavailable(reason),
      announcement: unavailable(reason),
      substitute: unavailable(reason),
      supervisors: unavailable(reason),
      changes: unavailable(reason),
    };
  }

  const probable = period.reconstructed && at.getTime() < period.createdAt.getTime();
  const probableWarning = `Non garantie : des changements de classe ont pu ne pas être enregistrés avant le ${formatDay(period.createdAt, facts.timeZone)}.`;
  /** Une rubrique connue devient probable quand la classe l'est ; « aucun » et « indisponible » ne changent pas. */
  const adjust = <T>(section: Section<T>): Section<T> => (probable && section.availability === 'KNOWN' ? { ...section, availability: 'PROBABLE', warning: probableWarning } : section);

  const next = facts.periods[facts.periods.indexOf(period) + 1] ?? null;
  const info = facts.classes[period.classId] ?? { id: period.classId, name: '(classe inconnue)', level: null, floor: null, room: null };
  const classSection: Section<ClassValue> = {
    availability: probable ? 'PROBABLE' : 'KNOWN',
    value: { ...info, since: period.startedAt, until: next?.startedAt ?? null, reconstructed: period.reconstructed },
    ...(probable ? { warning: probableWarning } : {}),
  };

  // Séance planifiée
  const session = sessionAt(facts.sessions, at);
  const sessionSection: Section<SessionValue> = session
    ? known({
        id: session.id,
        teacher: session.teacher,
        subject: session.subject,
        room: session.room,
        startAt: session.startAt,
        endAt: session.endAt,
        status: session.status,
        cancellation: session.status === 'CANCELLED' ? { reason: session.cancelReason, at: session.cancelledAt, by: session.cancelledBy } : null,
      })
    : none();

  // Enseignant réellement présent
  const present = facts.attendances.filter((a) => a.status !== 'ABSENT');
  const arrivals = present.filter((a) => arrivalTime(a) <= at.getTime()).sort((a, b) => arrivalTime(a) - arrivalTime(b));
  const later = present.filter((a) => arrivalTime(a) > at.getTime()).sort((a, b) => arrivalTime(a) - arrivalTime(b));
  const absences = facts.attendances.filter((a) => a.status === 'ABSENT');
  const departures = facts.departures
    .filter((dep) => dep.departedAt.getTime() <= at.getTime() && (dep.returnedAt === null || dep.returnedAt.getTime() > at.getTime()))
    .map((dep) => ({ teacher: dep.teacher, departedAt: dep.departedAt }));
  const sessionsOf = (teacherId: string) => facts.sessions.filter((s) => s.status === 'SCHEDULED' && s.teacher.id === teacherId).length;
  const dayLevelOnly = arrivals.some((a) => sessionsOf(a.teacher.id) >= 2 || (a.substituteForId !== null && sessionsOf(a.substituteForId) >= 2));
  const teacherValue: TeacherValue = { arrivals: arrivals.map(toArrival), laterArrivals: later.map(toArrival), absences: absences.map(toArrival), departures, dayLevelOnly };
  const teacherSection: Section<TeacherValue> = arrivals.length > 0 || absences.length > 0 ? known(teacherValue) : none(teacherValue);

  // Annonce, remplaçant
  const announced = session ? announcementFor(facts.announcements, session) : null;
  const announcementSection: Section<AnnouncementValue> = announced
    ? known({
        requestId: announced.requestId,
        type: announced.type,
        announcedLateMinutes: announced.announcedLateMinutes,
        reason: announced.anonymized ? null : announced.reason,
        startAt: announced.startAt,
        plannedEndAt: announced.plannedEndAt,
        announcedAt: announced.announcedAt,
        anonymized: announced.anonymized,
      })
    : none();

  let substituteSection: Section<SubstituteValue> = none();
  if (announced) {
    const events = [...announced.substituteEvents].sort(byOrder).filter((e) => e.toTeacherId !== null);
    const arrivedRow = present.filter((a) => a.substituteForId === announced.teacherId && arrivalTime(a) <= at.getTime()).sort((a, b) => arrivalTime(a) - arrivalTime(b))[0];
    const arrived = arrivedRow ? { teacher: arrivedRow.teacher, arrivedAt: arrivedRow.arrivedAt, recordedAt: arrivedRow.recordedAt } : null;
    if (events.length > 0) {
      const inForceEvent = [...events].reverse().find((e) => e.at.getTime() <= at.getTime());
      const value: SubstituteValue = {
        inForce: inForceEvent ? person(inForceEvent.toTeacherId) : null,
        previous: events.map((e) => ({ teacher: person(e.toTeacherId)!, setAt: e.at, setBy: person(e.byId), madeAfterMoment: e.at.getTime() > at.getTime() })),
        arrived,
      };
      substituteSection = inForceEvent ? known(value) : none(value);
    } else if (announced.currentSubstituteId) {
      substituteSection = {
        availability: 'PROBABLE',
        value: { inForce: person(announced.currentSubstituteId), previous: [], arrived },
        warning: 'Remplaçant connu par sa valeur actuelle seulement : aucun changement daté n’est enregistré.',
      };
    }
  }

  // Surveillants : gardes de la classe dont la fenêtre contient l'instant
  const inWindow = facts.coverages
    .filter((c) => {
      const end = c.relievedAt ?? c.plannedEndAt;
      return c.startAt.getTime() <= at.getTime() && (end === null || at.getTime() < end.getTime());
    })
    .sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
  const cover = inWindow[0];
  let supervisorsSection: Section<SupervisorsValue> = none();
  if (cover) {
    const lastEvent = [...cover.assigneeEvents].sort(byOrder).filter((e) => e.at.getTime() <= at.getTime()).pop();
    const assigneeId = lastEvent && lastEvent.kind !== 'RELEASED' ? lastEvent.assigneeId : null;
    const presence = assigneeId ? cover.presences.filter((p) => p.userId === assigneeId && p.at.getTime() <= at.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime())[0] : undefined;
    supervisorsSection = known({
      source: cover.source,
      type: cover.type,
      startAt: cover.startAt,
      endAt: cover.relievedAt ?? cover.plannedEndAt,
      assignee: assigneeId ? { user: person(assigneeId)!, state: presence ? 'PRESENT' : 'ASSIGNED_NOT_RECORDED', presentSince: presence?.at ?? null } : null,
      reinforcements: cover.supports
        .filter((s) => s.joinedAt.getTime() <= at.getTime() && (s.releasedAt === null || s.releasedAt.getTime() > at.getTime()))
        .map((s) => ({ user: person(s.userId)!, joinedAt: s.joinedAt })),
    });
  }

  // Modifications du jour, avec ce qui a été fait après l'instant
  const changes = [...facts.changes].sort((a, b) => a.at.getTime() - b.at.getTime()).map((c): ChangeValue => ({ ...c, madeAfterMoment: c.at.getTime() > at.getTime() }));
  const changesSection: Section<ChangeValue[]> = changes.length > 0 ? known(changes) : none();

  return {
    ...base,
    class: classSection,
    session: adjust(sessionSection),
    teacher: adjust(teacherSection),
    announcement: adjust(announcementSection),
    substitute: adjust(substituteSection),
    supervisors: adjust(supervisorsSection),
    changes: adjust(changesSection),
  };
}
