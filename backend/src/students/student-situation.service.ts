import { Inject, Injectable } from '@nestjs/common';
import type { AuditAction, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors';
import { buildPage, decodeCursor, parseLimit, type Page } from '../common/pagination';
import { PrismaService } from '../common/prisma.service';
import { addDays, atLocalTime, localDate } from '../common/school-time';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import {
  buildSituation,
  classAt,
  type AnnouncementFact,
  type AttendanceFact,
  type ChangeFact,
  type ClassInfo,
  type CoverageFact,
  type DepartureFact,
  type Person,
  type SessionFact,
  type Situation,
} from './domain/situation';
import { parseMoment } from './student-situation.dto';
import type { StudentsContext } from './students.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE_FR = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' });

/** Erreur de champ au format du projet. */
const fieldError = (field: string, message: string) => new AppException('VALIDATION_ERROR', { fields: [{ field, messages: [message] }] }, message);

export interface ClassPeriodView {
  id: string;
  class: { id: string; name: string; level: string | null; floor: string | null; room: string | null };
  startedAt: Date;
  /** Début de la période suivante ; null pour la période actuelle. */
  endedAt: Date | null;
  changedBy: { id: string; displayName: string } | null;
  reconstructed: boolean;
  availability: 'KNOWN' | 'PROBABLE';
  /** Pour une période reconstituée : la mise en service, avant laquelle elle n'est pas garantie. */
  probableUntil: Date | null;
  warning: string | null;
}

export interface AuditEntryView {
  id: string;
  action: AuditAction;
  actor: { id: string; displayName: string } | null;
  targetType: string | null;
  targetId: string | null;
  details: Prisma.JsonValue;
  ip: string | null;
  createdAt: Date;
}

export type SituationView = Omit<Situation, 'moment'> & { moment: Situation['moment'] & { requested: string } };

/**
 * Historique et situation d'un élève (021). Lecture seule : rien ne s'écrit ici, les périodes de classe sont
 * ajoutées par le service des élèves, dans la transaction qui modifie l'élève.
 */
@Injectable()
export class StudentSituationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Élève existant ou 404 : un identifiant mal formé ne touche pas la base. */
  private async requireStudent(id: string) {
    const student = UUID.test(id)
      ? await this.prisma.student.findUnique({ where: { id }, select: { id: true, firstName: true, lastName: true, createdAt: true } })
      : null;
    if (!student) throw new AppException('NOT_FOUND');
    return student;
  }

  /** Périodes de classe de l'élève, la plus récente d'abord ; chacune finit quand la suivante commence. */
  async classHistory(id: string): Promise<{ studentId: string; items: ClassPeriodView[] }> {
    await this.requireStudent(id);
    const rows = await this.prisma.studentClassHistory.findMany({
      where: { studentId: id },
      orderBy: [{ startedAt: 'asc' }, { seq: 'asc' }],
      include: {
        class: { select: { id: true, name: true, room: true, level: { select: { name: true } }, floor: { select: { name: true } } } },
        changedBy: { select: { id: true, displayName: true } },
      },
    });
    const items = rows.map((row, index): ClassPeriodView => {
      const probable = row.reconstructed;
      return {
        id: row.id,
        class: { id: row.class.id, name: row.class.name, level: row.class.level?.name ?? null, floor: row.class.floor?.name ?? null, room: row.class.room },
        startedAt: row.startedAt,
        endedAt: rows[index + 1]?.startedAt ?? null,
        changedBy: row.changedBy,
        reconstructed: row.reconstructed,
        availability: probable ? 'PROBABLE' : 'KNOWN',
        probableUntil: probable ? row.createdAt : null,
        warning: probable ? `Non garantie : des changements de classe ont pu ne pas être enregistrés avant le ${DATE_FR.format(row.createdAt)}.` : null,
      };
    });
    return { studentId: id, items: items.reverse() };
  }

  /** Journal de l'élève : changements de sa fiche et consultations de sa situation, la plus récente d'abord. */
  async auditTrail(id: string, query: { limit?: string; cursor?: string }): Promise<Page<AuditEntryView>> {
    await this.requireStudent(id);
    const limit = parseLimit(query.limit);
    const and: Prisma.AuditLogWhereInput[] = [{ targetType: 'Student', targetId: id }];
    if (query.cursor) {
      const c = decodeCursor(query.cursor);
      and.push({ OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }] });
    }
    const rows = await this.prisma.auditLog.findMany({
      where: { AND: and },
      include: { actor: { select: { id: true, displayName: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = buildPage(rows, limit);
    return {
      nextCursor: page.nextCursor,
      items: page.items.map((r) => ({ id: r.id, action: r.action, actor: r.actor, targetType: r.targetType, targetId: r.targetId, details: r.details, ip: r.ip, createdAt: r.createdAt })),
    };
  }

  /** Situation de l'élève à la minute demandée : lit les faits, puis les assemble (domain/situation.ts). */
  async situation(id: string, at: string, ctx: StudentsContext): Promise<SituationView> {
    const student = await this.requireStudent(id);
    const tz = this.config.schoolTimezone;
    const moment = parseMoment(at, tz);
    if (!moment) throw fieldError('at', 'Date et heure attendues (AAAA-MM-JJThh:mm), avec ou sans fuseau.');
    if (moment.requested.getTime() > Date.now()) throw fieldError('at', 'L’instant demandé ne peut pas être dans le futur.');

    const periods = await this.prisma.studentClassHistory.findMany({ where: { studentId: id }, orderBy: [{ startedAt: 'asc' }, { seq: 'asc' }] });
    const classRows = await this.prisma.schoolClass.findMany({
      where: { id: { in: [...new Set(periods.map((p) => p.classId))] } },
      select: { id: true, name: true, room: true, level: { select: { name: true } }, floor: { select: { name: true } } },
    });
    const classes: Record<string, ClassInfo> = Object.fromEntries(
      classRows.map((c) => [c.id, { id: c.id, name: c.name, room: c.room, level: c.level?.name ?? null, floor: c.floor?.name ?? null }]),
    );

    const period = student.createdAt.getTime() > moment.evaluatedAt.getTime() ? null : classAt(periods, moment.evaluatedAt);
    const day = period ? await this.dayFacts(period.classId, moment.evaluatedAt, tz) : null;

    const situation = buildSituation(
      {
        timeZone: tz,
        student,
        periods,
        classes,
        sessions: day?.sessions ?? [],
        attendances: day?.attendances ?? [],
        departures: day?.departures ?? [],
        announcements: day?.announcements ?? [],
        coverages: day?.coverages ?? [],
        users: day?.users ?? {},
        changes: day?.changes ?? [],
      },
      moment.evaluatedAt,
    );
    // Chaque consultation est journalisée, avant de répondre : qui, quand, quel élève, quel instant (FR-020).
    await this.audit.log('STUDENT_SITUATION_VIEWED', { actorId: ctx.actor.id, ip: ctx.ip, targetType: 'Student', targetId: id, details: { studentId: id, at } });
    return { ...situation, moment: { ...situation.moment, requested: at } };
  }

  /** Faits de la classe ce jour-là : séances, pointages, départs, annonces, gardes ; noms des personnes citées. */
  private async dayFacts(classId: string, at: Date, tz: string) {
    const date = localDate(at, tz);
    const dayStart = atLocalTime(date, '00:00', tz);
    const dayEnd = atLocalTime(addDays(date, 1), '00:00', tz);
    const day = new Date(`${date}T00:00:00.000Z`);
    const userIds = new Set<string>();
    const person = (user: { id: string; displayName: string }): Person => {
      userIds.add(user.id);
      return { id: user.id, displayName: user.displayName };
    };

    const sessionRows = await this.prisma.teachingSession.findMany({
      where: { classId, localDate: day },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      include: { teacher: { select: { id: true, displayName: true } }, cancelledBy: { select: { id: true, displayName: true } } },
    });
    const sessions: SessionFact[] = sessionRows.map((s) => ({
      id: s.id,
      teacher: person(s.teacher),
      subject: s.subject,
      room: s.room ?? null,
      startAt: s.startAt,
      endAt: s.endAt,
      status: s.status,
      cancelReason: s.cancelReason,
      cancelledAt: s.cancelledAt,
      cancelledBy: s.cancelledBy ? person(s.cancelledBy) : null,
    }));

    const attendanceRows = await this.prisma.teacherAttendance.findMany({
      where: { classId, localDate: day },
      orderBy: [{ arrivedAt: 'asc' }, { recordedAt: 'asc' }],
      include: { teacher: { select: { id: true, displayName: true } } },
    });
    // Une ligne de pointage corrigée a été modifiée sur place : la valeur lue est la valeur corrigée (FR-018).
    const corrections = attendanceRows.length
      ? await this.prisma.auditLog.findMany({ where: { action: 'ATTENDANCE_CORRECTED', targetType: 'TeacherAttendance', targetId: { in: attendanceRows.map((a) => a.id) } }, select: { targetId: true } })
      : [];
    const correctedIds = new Set(corrections.map((c) => c.targetId));
    const attendances: AttendanceFact[] = attendanceRows.map((a) => ({
      teacher: person(a.teacher),
      status: a.status,
      method: a.method,
      arrivedAt: a.arrivedAt,
      recordedAt: a.recordedAt,
      comment: a.comment,
      corrected: correctedIds.has(a.id),
      substituteForId: a.substituteForId,
    }));

    const teacherIds = [...new Set([...sessions.map((s) => s.teacher.id), ...attendances.map((a) => a.teacher.id)])];
    const departureRows = await this.prisma.teacherDeparture.findMany({
      where: { localDate: day, teacherId: { in: teacherIds } },
      include: { teacher: { select: { id: true, displayName: true } } },
    });
    const departures: DepartureFact[] = departureRows.map((d) => ({ teacher: person(d.teacher), departedAt: d.departedAt, returnedAt: d.returnedAt }));

    // Annonces : retard ou absence demandé par l'enseignant de la classe ce jour-là (même critère que la liste 020).
    const announcementRows = await this.prisma.coverageDetail.findMany({
      where: {
        source: 'TEACHER_REQUEST',
        type: { in: ['LATENESS', 'ABSENCE'] },
        mergedIntoId: null,
        teacherId: { in: sessions.map((s) => s.teacher.id) },
        startAt: { lt: dayEnd },
        OR: [{ plannedEndAt: null }, { plannedEndAt: { gt: dayStart } }],
        request: { status: { not: 'CANCELLED' } },
      },
      include: { request: { select: { createdAt: true } } },
    });
    const substituteEvents = announcementRows.length
      ? await this.prisma.requestEvent.findMany({ where: { requestId: { in: announcementRows.map((a) => a.requestId) }, type: 'SUBSTITUTE_SET' }, orderBy: { seq: 'asc' } })
      : [];
    const teacherOf = (value: unknown): string | null => {
      const id = (value as { teacherId?: unknown } | null)?.teacherId;
      return typeof id === 'string' ? id : null;
    };
    const announcements: AnnouncementFact[] = announcementRows.map((a) => ({
      requestId: a.requestId,
      type: a.type as 'ABSENCE' | 'LATENESS',
      teacherId: a.teacherId,
      startAt: a.startAt,
      plannedEndAt: a.plannedEndAt,
      announcedAt: a.request.createdAt,
      reason: a.reason,
      announcedLateMinutes: a.type === 'LATENESS' ? a.estimatedMinutes : null,
      anonymized: a.anonymizedAt !== null,
      currentSubstituteId: a.substituteTeacherId,
      substituteEvents: substituteEvents
        .filter((e) => e.requestId === a.requestId)
        .map((e) => ({ at: e.createdAt, seq: Number(e.seq), fromTeacherId: teacherOf(e.fromValue), toTeacherId: teacherOf(e.toValue), byId: e.actorId })),
    }));
    for (const a of announcements) {
      if (a.currentSubstituteId) userIds.add(a.currentSubstituteId);
      for (const e of a.substituteEvents) {
        if (e.toTeacherId) userIds.add(e.toTeacherId);
        if (e.byId) userIds.add(e.byId);
      }
    }

    // Gardes de la classe commencées avant l'instant et pas terminées à cet instant.
    const coverageRows = await this.prisma.coverageDetail.findMany({
      where: {
        classId,
        mergedIntoId: null,
        startAt: { lte: at },
        OR: [{ relievedAt: null }, { relievedAt: { gt: at } }],
        request: { status: { not: 'CANCELLED' } },
      },
      include: {
        request: {
          select: {
            events: { where: { type: { in: ['ASSIGNED', 'REASSIGNED', 'RELEASED'] } }, orderBy: { seq: 'asc' } },
            presences: { select: { userId: true, createdAt: true } },
            supports: { select: { userId: true, joinedAt: true, releasedAt: true } },
          },
        },
      },
    });
    const coverages: CoverageFact[] = coverageRows.map((c) => {
      for (const p of c.request.presences) userIds.add(p.userId);
      for (const s of c.request.supports) userIds.add(s.userId);
      return {
        requestId: c.requestId,
        source: c.source,
        type: c.type,
        startAt: c.startAt,
        plannedEndAt: c.plannedEndAt,
        relievedAt: c.relievedAt,
        assigneeEvents: c.request.events.map((e) => {
          const assigneeId = (e.toValue as { assigneeId?: unknown } | null)?.assigneeId;
          const id = typeof assigneeId === 'string' ? assigneeId : null;
          if (id) userIds.add(id);
          return { at: e.createdAt, seq: Number(e.seq), kind: e.type as 'ASSIGNED' | 'REASSIGNED' | 'RELEASED', assigneeId: id };
        }),
        presences: c.request.presences.map((p) => ({ userId: p.userId, at: p.createdAt })),
        supports: c.request.supports,
      };
    });

    const changes = await this.changesOf({
      sessionIds: sessions.map((x) => x.id),
      seriesIds: [...new Set(sessionRows.flatMap((x) => (x.seriesId ? [x.seriesId] : [])))],
      attendanceIds: attendanceRows.map((a) => a.id),
      requestIds: announcements.map((a) => a.requestId),
      userIds,
    });

    const people = await this.prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, displayName: true } });
    const users: Record<string, Person> = Object.fromEntries(people.map((u) => [u.id, { id: u.id, displayName: u.displayName }]));
    const named = changes.map((c) => (c.by ? { ...c, by: users[c.by.id] ?? { id: c.by.id, displayName: '(compte anonymisé)', anonymized: true } } : c));
    return { sessions, attendances, departures, announcements, coverages, users, changes: named };
  }

  /**
   * Modifications qui touchent la séance, ses pointages et l'annonce du jour : emploi du temps, pointage corrigé ou
   * saisi, remplaçant. Lues au journal d'audit par cible, sans limite de date : une correction faite après coup
   * doit apparaître, marquée comme telle (FR-015).
   */
  private async changesOf(targets: { sessionIds: string[]; seriesIds: string[]; attendanceIds: string[]; requestIds: string[]; userIds: Set<string> }): Promise<ChangeFact[]> {
    const where = [
      targets.sessionIds.length ? { targetType: 'TeachingSession', targetId: { in: targets.sessionIds } } : null,
      targets.seriesIds.length ? { targetType: 'TimetableSeries', targetId: { in: targets.seriesIds } } : null,
      targets.attendanceIds.length ? { targetType: 'TeacherAttendance', targetId: { in: targets.attendanceIds } } : null,
      targets.requestIds.length ? { targetType: 'Request', targetId: { in: targets.requestIds }, action: 'COVERAGE_MANAGED' as const } : null,
    ].filter((clause) => clause !== null);
    if (where.length === 0) return [];
    const rows = await this.prisma.auditLog.findMany({ where: { OR: where }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 200 });
    const detailsOf = (value: unknown) => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {});
    return rows
      .filter((row) => row.action !== 'COVERAGE_MANAGED' || detailsOf(row.details).action === 'SET_SUBSTITUTE')
      .map((row) => {
        if (row.actorId) targets.userIds.add(row.actorId);
        const details = detailsOf(row.details);
        return {
          kind: row.action,
          at: row.createdAt,
          by: row.actorId ? { id: row.actorId, displayName: '' } : null,
          before: details.before ?? null,
          after: details.after ?? null,
          reason: typeof details.reason === 'string' ? details.reason : null,
        };
      });
  }
}
