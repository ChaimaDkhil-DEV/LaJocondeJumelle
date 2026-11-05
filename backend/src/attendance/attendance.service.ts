import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { addDays, atLocalTime, localDate } from '../common/school-time';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { CoverageAccessLoader } from '../coverage/coverage-access.loader';
import { CoverageActionsService } from '../coverage/coverage-actions.service';
import { adminRecipients, groupFlagsOf } from '../coverage/coverage-groups';
import { moduleCapabilities } from '../coverage/domain/coverage-policy';
import { verifyQrToken } from '../coverage/domain/qr-token';
import type { RequestContext } from '../requests/requests.service';
import type { CorrectAttendanceDto, DayQuery, ManualAttendanceDto, SetSubstituteDto } from './attendance.dto';
import {
  ATTENDANCE_INCLUDE,
  dayString,
  dayValue,
  toAttendanceView,
  type AttendanceRow,
  type AttendanceView,
} from './attendance.mapper';
import {
  correctionRefusal,
  currentClassState,
  matchArrival,
  type AnnouncedRequest,
  type ArrivalMatch,
  type ClassEvent,
} from './domain/attendance-matching';

/** Une saisie manuelle ne remonte pas plus loin que cette limite (jours) : au-delà, c'est une correction de l'admin. */
const MANUAL_MAX_DAYS_BACK = 7;
/** Pointages affichés dans « Mes présences ». */
const HISTORY_LIMIT = 90;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fieldError(field: string, message: string): AppException {
  return new AppException('VALIDATION_ERROR', { fields: [{ field, messages: [message] }] }, message);
}

export interface ArrivalResult {
  created: boolean;
  attendance: AttendanceView;
  match: ArrivalMatch;
}

/**
 * Pointage des enseignants par QR. Le QR identifie la classe, la session identifie l'enseignant, l'heure
 * est celle du serveur. Il n'y a pas d'emploi du temps : l'heure de référence d'un retard ne vient que
 * d'une demande de retard annoncée ; sans demande, l'arrivée est enregistrée sans jugement.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CoverageAccessLoader,
    private readonly actions: CoverageActionsService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ---------------------------------------------------------------------------
  // Arrivée de l'enseignant (QR)
  // ---------------------------------------------------------------------------

  /** Page du QR pour un enseignant : classe, pointage du jour s'il existe, rattachement prévu. Rien n'est enregistré. */
  async resolve(user: AuthenticatedUser, token: string, ctx: RequestContext) {
    await this.assertTeacher(user, ctx);
    const schoolClass = await this.classFromToken(token);
    const now = new Date();
    const day = localDate(now, this.config.schoolTimezone);
    const existing = await this.findOwn(user.id, schoolClass.id, day);
    const preview = existing ? ({ kind: 'NONE' } as const) : matchArrival(user.id, now, await this.announcedFor(schoolClass.id, day));
    return {
      class: { id: schoolClass.id, name: schoolClass.name, room: schoolClass.room },
      attendance: existing ? toAttendanceView(existing) : null,
      preview,
    };
  }

  /**
   * Enregistre l'arrivée du demandeur dans la classe du QR. Idempotent : un deuxième scan, y compris
   * simultané, renvoie le pointage existant (unicité en base) sans doublon.
   */
  async arrive(user: AuthenticatedUser, token: string, ctx: RequestContext): Promise<ArrivalResult> {
    await this.assertTeacher(user, ctx);
    const schoolClass = await this.classFromToken(token);
    const now = new Date();
    const day = localDate(now, this.config.schoolTimezone);

    const existing = await this.findOwn(user.id, schoolClass.id, day);
    if (existing) return { created: false, attendance: toAttendanceView(existing), match: { kind: 'NONE' } };

    const match = matchArrival(user.id, now, await this.announcedFor(schoolClass.id, day));
    try {
      const row = await this.actions.run(async (tx, effects) => {
        const created = await tx.teacherAttendance.create({
          data: {
            teacherId: user.id,
            classId: schoolClass.id,
            localDate: dayValue(day),
            method: 'QR',
            status: 'ARRIVED',
            arrivedAt: now,
            recordedAt: now,
            recordedById: user.id,
            ...this.linkOf(match),
          },
          include: ATTENDANCE_INCLUDE,
        });
        if (match.kind !== 'NONE') {
          await tx.requestEvent.create({
            data: {
              requestId: match.requestId,
              actorId: user.id,
              type: 'TEACHER_ARRIVED',
              toValue: {
                classId: schoolClass.id,
                kind: match.kind,
                ...(match.kind === 'ANNOUNCED_LATENESS' ? { lateMinutes: match.lateMinutes } : {}),
                ...(match.kind === 'SUBSTITUTE' ? { titularId: match.titularId } : {}),
              },
            },
          });
          const request = await tx.request.findUnique({ where: { id: match.requestId }, select: { assigneeId: true, priority: true } });
          const admins = await adminRecipients(tx);
          if (match.kind === 'ANNOUNCED_ABSENCE') {
            await this.actions.notify(tx, effects, admins, user.id, 'COVERAGE_ATTENDANCE_ANOMALY', match.requestId, request?.priority ?? 'URGENT');
          } else {
            await this.actions.notify(tx, effects, [...admins, request?.assigneeId], user.id, 'COVERAGE_TEACHER_ARRIVED', match.requestId, request?.priority ?? 'URGENT');
          }
        }
        return created;
      });
      return { created: true, attendance: toAttendanceView(row), match };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.findOwn(user.id, schoolClass.id, day);
        if (duplicate) return { created: false, attendance: toAttendanceView(duplicate), match: { kind: 'NONE' } };
      }
      throw error;
    }
  }

  /** « Mes présences » : historique de l'enseignant. */
  async mine(user: AuthenticatedUser, ctx: RequestContext): Promise<AttendanceView[]> {
    await this.assertTeacher(user, ctx);
    const rows = await this.prisma.teacherAttendance.findMany({
      where: { teacherId: user.id },
      include: ATTENDANCE_INCLUDE,
      orderBy: [{ localDate: 'desc' }, { recordedAt: 'desc' }],
      take: HISTORY_LIMIT,
    });
    return rows.map(toAttendanceView);
  }

  // ---------------------------------------------------------------------------
  // Suivi des présences (admin)
  // ---------------------------------------------------------------------------

  /**
   * Journée : pointages, demandes annoncées (scannées ou non), classes vides déclarées et état courant de
   * chaque classe. Aucune liste « d'attendus » : sans emploi du temps, l'absence de scan ne prouve rien.
   */
  async day(user: AuthenticatedUser, query: DayQuery, ctx: RequestContext) {
    await this.assertManager(user, ctx);
    const tz = this.config.schoolTimezone;
    const day = query.date ?? localDate(new Date(), tz);
    const from = atLocalTime(day, '00:00', tz);
    const to = atLocalTime(addDays(day, 1), '00:00', tz);

    const [rows, announced, empties] = await Promise.all([
      this.prisma.teacherAttendance.findMany({ where: { localDate: dayValue(day) }, include: ATTENDANCE_INCLUDE, orderBy: { recordedAt: 'asc' } }),
      this.prisma.coverageDetail.findMany({
        where: { source: 'TEACHER_REQUEST', mergedIntoId: null, startAt: { gte: from, lt: to }, request: { status: { not: 'CANCELLED' } } },
        select: {
          requestId: true,
          type: true,
          startAt: true,
          plannedEndAt: true,
          class: { select: { id: true, name: true, room: true } },
          teacher: { select: { id: true, displayName: true } },
          substituteTeacher: { select: { id: true, displayName: true } },
          request: { select: { status: true } },
        },
        orderBy: { startAt: 'asc' },
      }),
      this.prisma.coverageDetail.findMany({
        where: { type: 'EMPTY_CLASS', mergedIntoId: null, startAt: { gte: from, lt: to }, request: { status: { not: 'CANCELLED' } } },
        select: {
          requestId: true,
          startAt: true,
          class: { select: { id: true, name: true, room: true } },
          teacher: { select: { id: true, displayName: true } },
          request: { select: { requester: { select: { id: true, displayName: true } } } },
        },
        orderBy: { startAt: 'asc' },
      }),
    ]);

    const attendances = rows.map(toAttendanceView);
    const announcedView = announced.map((a) => {
      const scan = rows.find((r) => r.requestId === a.requestId && r.method === 'QR');
      return {
        requestId: a.requestId,
        type: a.type,
        startAt: a.startAt,
        plannedEndAt: a.plannedEndAt,
        class: a.class,
        teacher: a.teacher,
        substituteTeacher: a.substituteTeacher,
        status: a.request.status,
        attendanceId: scan?.id ?? null,
      };
    });
    const emptyView = empties.map((e) => ({
      requestId: e.requestId,
      startAt: e.startAt,
      class: e.class,
      teacher: e.teacher,
      declaredBy: e.request.requester,
    }));

    // État courant par classe : le dernier événement l'emporte, tout l'historique est conservé.
    const events = new Map<string, { class: { id: string; name: string; room: string | null }; list: ClassEvent[] }>();
    const entry = (c: { id: string; name: string; room: string | null }) => {
      if (!events.has(c.id)) events.set(c.id, { class: c, list: [] });
      return events.get(c.id)!;
    };
    for (const e of empties) entry(e.class).list.push({ at: e.startAt, kind: 'EMPTY' });
    for (const r of rows) if (r.status !== 'ABSENT') entry(r.class).list.push({ at: r.arrivedAt ?? r.recordedAt, kind: 'ARRIVAL' });
    const classStates = [...events.values()]
      .map(({ class: c, list }) => ({
        class: c,
        current: currentClassState(list),
        events: [...list].sort((a, b) => a.at.getTime() - b.at.getTime()),
      }))
      .sort((a, b) => a.class.name.localeCompare(b.class.name, 'fr'));

    return { date: day, attendances, announced: announcedView, emptyClasses: emptyView, classStates };
  }

  /** Régularisation d'un oubli de scan. Refusée si un pointage existe déjà pour cet enseignant, cette classe et ce jour. */
  async recordManual(user: AuthenticatedUser, dto: ManualAttendanceDto, ctx: RequestContext): Promise<AttendanceView> {
    await this.assertManager(user, ctx);
    const tz = this.config.schoolTimezone;
    const now = new Date();
    const today = localDate(now, tz);
    const day = dto.date ?? today;
    if (day > today) throw fieldError('date', 'La date ne peut pas être dans le futur.');
    if (day < addDays(today, -MANUAL_MAX_DAYS_BACK)) {
      throw fieldError('date', `La date ne peut pas remonter à plus de ${MANUAL_MAX_DAYS_BACK} jours.`);
    }
    if (dto.status === 'ABSENT' && dto.arrivedTime) throw fieldError('arrivedTime', 'Une absence n’a pas d’heure d’arrivée.');
    if (dto.status === 'ABSENT' && !dto.comment) throw fieldError('comment', 'Indiquez le motif de l’absence.');
    const arrivedAt = dto.arrivedTime ? atLocalTime(day, dto.arrivedTime, tz) : null;
    if (arrivedAt && arrivedAt > now) throw fieldError('arrivedTime', 'L’heure d’arrivée ne peut pas être dans le futur.');

    const teacher = await this.prisma.user.findUnique({ where: { id: dto.teacherId }, select: { active: true } });
    if (!teacher?.active || !(await groupFlagsOf(this.prisma, dto.teacherId)).isTeacher) {
      throw fieldError('teacherId', 'Cet enseignant n’appartient pas au groupe Enseignants.');
    }
    const schoolClass = await this.prisma.schoolClass.findUnique({ where: { id: dto.classId } });
    if (!schoolClass?.active) throw new AppException('CLASS_INACTIVE');

    const announced = await this.announcedFor(dto.classId, day);
    const reference = arrivedAt ?? (day === today ? now : null);
    let link: Pick<Prisma.TeacherAttendanceUncheckedCreateInput, 'requestId' | 'announcedLateMinutes' | 'substituteForId'> = {};
    let match: ArrivalMatch = { kind: 'NONE' };
    if (dto.status === 'ABSENT') {
      const absence = announced.find((r) => r.teacherId === dto.teacherId && r.type === 'ABSENCE');
      if (absence) link = { requestId: absence.requestId };
    } else if (reference) {
      match = matchArrival(dto.teacherId, reference, announced);
      link = this.linkOf(match);
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.teacherAttendance.create({
          data: {
            teacherId: dto.teacherId,
            classId: dto.classId,
            localDate: dayValue(day),
            method: 'MANUAL',
            status: dto.status,
            arrivedAt,
            recordedAt: now,
            recordedById: user.id,
            comment: dto.comment ?? null,
            ...link,
          },
          include: ATTENDANCE_INCLUDE,
        });
        if (match.kind !== 'NONE') {
          await tx.requestEvent.create({
            data: { requestId: match.requestId, actorId: user.id, type: 'TEACHER_ARRIVED', toValue: { classId: dto.classId, kind: match.kind, manual: true } },
          });
        }
        await this.audit.log(
          'ATTENDANCE_MANUAL',
          {
            actorId: user.id,
            ip: ctx.ip,
            targetType: 'TeacherAttendance',
            targetId: created.id,
            details: { teacherId: dto.teacherId, classId: dto.classId, status: dto.status, method: 'MANUAL', ...(link.requestId ? { requestId: link.requestId } : {}) },
          },
          tx,
        );
        return created;
      });
      return toAttendanceView(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppException('ATTENDANCE_EXISTS');
      throw error;
    }
  }

  /** Correction ou qualification par la surveillante : motif obligatoire, avant/après au journal d'audit. */
  async correct(user: AuthenticatedUser, id: string, dto: CorrectAttendanceDto, ctx: RequestContext): Promise<AttendanceView> {
    await this.assertManager(user, ctx);
    const row = UUID.test(id) ? await this.prisma.teacherAttendance.findUnique({ where: { id }, include: ATTENDANCE_INCLUDE }) : null;
    if (!row) throw new AppException('NOT_FOUND');
    if (dto.status === undefined && dto.arrivedTime === undefined && dto.comment === undefined) {
      throw fieldError('status', 'Indiquez ce qui change : statut, heure d’arrivée ou commentaire.');
    }
    const refusal = correctionRefusal({ method: row.method }, { status: dto.status, arrivedAtChanged: dto.arrivedTime !== undefined });
    if (refusal) throw fieldError(dto.arrivedTime !== undefined ? 'arrivedTime' : 'status', refusal);

    const tz = this.config.schoolTimezone;
    const now = new Date();
    const nextStatus = dto.status ?? row.status;
    let arrivedAt: Date | null | undefined;
    if (dto.arrivedTime !== undefined) {
      if (dto.arrivedTime !== null && nextStatus === 'ABSENT') throw fieldError('arrivedTime', 'Une absence n’a pas d’heure d’arrivée.');
      arrivedAt = dto.arrivedTime === null ? null : atLocalTime(dayString(row.localDate), dto.arrivedTime, tz);
      if (arrivedAt && arrivedAt > now) throw fieldError('arrivedTime', 'L’heure d’arrivée ne peut pas être dans le futur.');
    }
    if (nextStatus === 'ABSENT') {
      arrivedAt = null;
      if (!(dto.comment ?? row.comment)) throw fieldError('comment', 'Indiquez le motif de l’absence.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.teacherAttendance.update({
        where: { id },
        data: {
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(arrivedAt !== undefined ? { arrivedAt } : {}),
          ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
          ...(nextStatus === 'ABSENT' ? { announcedLateMinutes: null } : {}),
        },
        include: ATTENDANCE_INCLUDE,
      });
      await this.audit.log(
        'ATTENDANCE_CORRECTED',
        {
          actorId: user.id,
          ip: ctx.ip,
          targetType: 'TeacherAttendance',
          targetId: id,
          details: {
            teacherId: row.teacherId,
            classId: row.classId,
            method: row.method,
            before: { status: row.status, arrivedAt: row.arrivedAt?.toISOString() ?? null },
            after: { status: saved.status, arrivedAt: saved.arrivedAt?.toISOString() ?? null },
            reason: dto.reason,
          },
        },
        tx,
      );
      return saved;
    });
    return toAttendanceView(updated);
  }

  // ---------------------------------------------------------------------------
  // Remplacement autorisé
  // ---------------------------------------------------------------------------

  /**
   * L'admin désigne l'enseignant remplaçant d'une absence annoncée (ou le retire avec `null`). Le titulaire
   * reste l'enseignant de la demande ; le remplaçant pointe ensuite sous son propre compte.
   */
  async setSubstitute(user: AuthenticatedUser, requestId: string, dto: SetSubstituteDto, ctx: RequestContext) {
    await this.assertManager(user, ctx);
    const detail = UUID.test(requestId)
      ? await this.prisma.coverageDetail.findUnique({
          where: { requestId },
          select: { requestId: true, source: true, type: true, teacherId: true, substituteTeacherId: true, request: { select: { status: true } } },
        })
      : null;
    if (!detail) throw new AppException('NOT_FOUND');
    if (detail.source !== 'TEACHER_REQUEST' || detail.type !== 'ABSENCE') {
      throw fieldError('teacherId', 'Un remplaçant se désigne sur une absence annoncée par un enseignant.');
    }
    if (detail.request.status === 'CANCELLED') throw fieldError('teacherId', 'Cette demande est annulée.');
    if (dto.teacherId !== null) {
      if (dto.teacherId === detail.teacherId) throw fieldError('teacherId', 'Le remplaçant doit être un autre enseignant que le titulaire.');
      const candidate = await this.prisma.user.findUnique({ where: { id: dto.teacherId }, select: { active: true } });
      if (!candidate?.active || !(await groupFlagsOf(this.prisma, dto.teacherId)).isTeacher) {
        throw fieldError('teacherId', 'Cet enseignant n’appartient pas au groupe Enseignants.');
      }
    }
    if (detail.substituteTeacherId === dto.teacherId) return { requestId, substituteTeacherId: dto.teacherId };

    await this.prisma.$transaction(async (tx) => {
      await tx.coverageDetail.update({ where: { requestId }, data: { substituteTeacherId: dto.teacherId } });
      await tx.requestEvent.create({
        data: {
          requestId,
          actorId: user.id,
          type: 'SUBSTITUTE_SET',
          fromValue: { teacherId: detail.substituteTeacherId },
          toValue: { teacherId: dto.teacherId },
        },
      });
      await this.audit.log(
        'COVERAGE_MANAGED',
        {
          actorId: user.id,
          ip: ctx.ip,
          targetType: 'Request',
          targetId: requestId,
          details: { action: 'SET_SUBSTITUTE', before: { teacherId: detail.substituteTeacherId }, after: { teacherId: dto.teacherId } },
        },
        tx,
      );
    });
    return { requestId, substituteTeacherId: dto.teacherId };
  }

  // ---------------------------------------------------------------------------
  // Outils
  // ---------------------------------------------------------------------------

  /** Champs de rattachement d'un pointage à une demande annoncée. */
  private linkOf(match: ArrivalMatch): Pick<Prisma.TeacherAttendanceUncheckedCreateInput, 'requestId' | 'announcedLateMinutes' | 'substituteForId'> {
    switch (match.kind) {
      case 'ANNOUNCED_LATENESS':
        return { requestId: match.requestId, announcedLateMinutes: match.lateMinutes };
      case 'ANNOUNCED_ABSENCE':
        return { requestId: match.requestId };
      case 'SUBSTITUTE':
        return { requestId: match.requestId, substituteForId: match.titularId };
      case 'NONE':
        return {};
    }
  }

  /** Classe du QR : signature, version en cours (non révoquée) et classe active. */
  private async classFromToken(token: string) {
    const parsed = verifyQrToken(this.actions.key, token);
    const schoolClass = parsed ? await this.prisma.schoolClass.findUnique({ where: { id: parsed.classId } }) : null;
    if (!parsed || !schoolClass || !schoolClass.active || schoolClass.qrVersion !== parsed.version) throw new AppException('QR_INVALID');
    return schoolClass;
  }

  private findOwn(teacherId: string, classId: string, day: string): Promise<AttendanceRow | null> {
    return this.prisma.teacherAttendance.findUnique({
      where: { teacherId_classId_localDate: { teacherId, classId, localDate: dayValue(day) } },
      include: ATTENDANCE_INCLUDE,
    });
  }

  /** Demandes d'enseignant du jour pour la classe (ni annulées ni fusionnées). */
  private async announcedFor(classId: string, day: string): Promise<AnnouncedRequest[]> {
    const tz = this.config.schoolTimezone;
    const rows = await this.prisma.coverageDetail.findMany({
      where: {
        classId,
        source: 'TEACHER_REQUEST',
        mergedIntoId: null,
        startAt: { gte: atLocalTime(day, '00:00', tz), lt: atLocalTime(addDays(day, 1), '00:00', tz) },
        request: { status: { not: 'CANCELLED' } },
      },
      select: { requestId: true, type: true, teacherId: true, substituteTeacherId: true, startAt: true, plannedEndAt: true },
    });
    return rows.map((r) => ({
      requestId: r.requestId,
      type: r.type === 'LATENESS' || r.type === 'ABSENCE' ? r.type : null,
      teacherId: r.teacherId,
      substituteTeacherId: r.substituteTeacherId,
      startAt: r.startAt,
      plannedEndAt: r.plannedEndAt,
    }));
  }

  /** Pointer son arrivée : membre du groupe Enseignants ; sinon 404 journalisé (comme le module Gardes). */
  private async assertTeacher(user: AuthenticatedUser, ctx: RequestContext): Promise<void> {
    if (moduleCapabilities(await this.access.viewer(user)).recordArrival) return;
    await this.logDenied(user, ctx, 'NOT_TEACHER');
    throw new AppException('NOT_FOUND');
  }

  /** Suivi, saisie, correction, remplaçant : admin ou super administrateur du module. */
  private async assertManager(user: AuthenticatedUser, ctx: RequestContext): Promise<void> {
    if (moduleCapabilities(await this.access.viewer(user)).manage) return;
    await this.logDenied(user, ctx, 'NOT_MANAGER');
    throw new AppException('NOT_FOUND');
  }

  private async logDenied(user: AuthenticatedUser, ctx: RequestContext, reason: string): Promise<void> {
    await this.audit.log('ACCESS_DENIED', {
      actorId: user.id,
      targetType: 'Attendance',
      targetId: 'attendance',
      ip: ctx.ip,
      details: { reason, route: ctx.route, method: ctx.method, channel: 'http' },
    });
  }
}
