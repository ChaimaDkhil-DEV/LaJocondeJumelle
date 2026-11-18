import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { dayString, dayValue } from '../attendance/attendance.mapper';
import { AttendanceGate } from '../attendance/attendance-gate.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { groupFlagsOf } from '../common/group-flags';
import { PrismaService } from '../common/prisma.service';
import { addDays, localDate, localTime } from '../common/school-time';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { RealtimeService } from '../realtime/realtime.service';
import type { RequestContext } from '../requests/requests.service';
import { ownSessions, type OwnSessionView } from './own-sessions';
import { findConflicts, type ConflictFound, type ExistingSession, type ProposedSession } from './domain/conflicts';
import { periodError, seriesDates, sessionRange, slotError } from './domain/series';
import type {
  CancelDto,
  CancelSeriesDto,
  CreateSeriesDto,
  CreateSessionDto,
  MineQuery,
  SeriesQuery,
  SessionsQuery,
  UpdateSeriesDto,
  UpdateSessionDto,
} from './timetable.dto';
import { SERIES_INCLUDE, SESSION_INCLUDE, toSeriesView, toSessionView, type SessionView } from './timetable.mapper';

/** Plage maximale d'une liste de séances (administration). */
const LIST_MAX_DAYS = 31;
/** Plage maximale de « Mon emploi du temps » (deux semaines). */
const MINE_MAX_DAYS = 14;
/** Une séance passée s'annule jusqu'à 7 jours en arrière (même limite que la saisie manuelle d'un pointage). */
const CANCEL_MAX_DAYS_BACK = 7;
/** Motif posé sur les séances annulées quand la fin d'une série est avancée. */
const SHORTENED_REASON = 'Fin de série avancée';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Db = PrismaService | Prisma.TransactionClient;
type FieldErrors = Array<{ field: string; messages: string[] }>;

const invalid = (fields: FieldErrors) => new AppException('VALIDATION_ERROR', { fields }, fields[0]?.messages[0]);
const fieldError = (field: string, message: string) => invalid([{ field, messages: [message] }]);

/** Séance proposée, avec ce qu'il faut pour écrire la ligne et expliquer un conflit. */
interface Planned extends ProposedSession {
  date: string;
}

/** Séance existante chargée pour la vérification des conflits. */
interface Loaded extends ExistingSession {
  localDate: Date;
  teacher: { id: string; displayName: string };
  class: { id: string; name: string };
}

/** Violation d'une contrainte d'exclusion PostgreSQL (23P01), remontée par Prisma sans code dédié. */
function isOverlapViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return /23P01|TeachingSession_(teacher|class)_no_overlap/.test(message);
}

/**
 * Emplois du temps (020) : écritures de l'administration (séances, séries), conflits et audit. Les droits sont
 * ceux du suivi des présences (AttendanceGate). Le statut de présence d'une séance n'est jamais écrit ici : il
 * se calcule à la lecture (attendance/domain/session-status.ts).
 */
@Injectable()
export class TimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: AttendanceGate,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ---------------------------------------------------------------------------
  // Lecture (administration)
  // ---------------------------------------------------------------------------

  async listSessions(user: AuthenticatedUser, query: SessionsQuery, ctx: RequestContext): Promise<SessionView[]> {
    await this.gate.assertManager(user, ctx);
    if (query.to < query.from) throw fieldError('to', 'La fin doit être le même jour ou après le début.');
    if (query.to > addDays(query.from, LIST_MAX_DAYS)) throw fieldError('to', `Affichez au plus ${LIST_MAX_DAYS} jours à la fois.`);
    const rows = await this.prisma.teachingSession.findMany({
      where: {
        localDate: { gte: dayValue(query.from), lte: dayValue(query.to) },
        ...(query.teacherId ? { teacherId: query.teacherId } : {}),
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.includeCancelled === 'true' ? {} : { status: 'SCHEDULED' as const }),
      },
      include: SESSION_INCLUDE,
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => toSessionView(r, this.config.schoolTimezone));
  }

  async listSeries(user: AuthenticatedUser, query: SeriesQuery, ctx: RequestContext) {
    await this.gate.assertManager(user, ctx);
    const now = new Date();
    const rows = await this.prisma.timetableSeries.findMany({
      where: { ...(query.teacherId ? { teacherId: query.teacherId } : {}), ...(query.classId ? { classId: query.classId } : {}) },
      include: { ...SERIES_INCLUDE, _count: { select: { sessions: { where: { status: 'SCHEDULED', startAt: { gt: now } } } } } },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => toSeriesView(row, row._count.sessions));
  }

  // ---------------------------------------------------------------------------
  // Lecture (enseignant, US4)
  // ---------------------------------------------------------------------------

  /** « Mon emploi du temps » : 14 jours au plus ; l'enseignant est celui de la session, jamais un paramètre. */
  async mine(user: AuthenticatedUser, query: MineQuery, ctx: RequestContext): Promise<{ from: string; to: string; sessions: OwnSessionView[] }> {
    await this.gate.assertTeacher(user, ctx);
    if (query.to < query.from) throw fieldError('to', 'La fin doit être le même jour ou après le début.');
    if (query.to > addDays(query.from, MINE_MAX_DAYS - 1)) throw fieldError('to', `Affichez au plus ${MINE_MAX_DAYS} jours à la fois.`);
    return { from: query.from, to: query.to, sessions: await ownSessions(this.prisma, user.id, query.from, query.to, this.config.schoolTimezone) };
  }

  // ---------------------------------------------------------------------------
  // Création
  // ---------------------------------------------------------------------------

  async createSession(user: AuthenticatedUser, dto: CreateSessionDto, ctx: RequestContext): Promise<SessionView> {
    await this.gate.assertManager(user, ctx);
    const errors: FieldErrors = [...(await this.participantErrors(dto.teacherId, dto.classId)), ...this.slotErrors(dto.startTime, dto.endTime)];
    if (dto.date < this.today()) errors.push({ field: 'date', messages: ['Une séance se crée à partir d’aujourd’hui.'] });
    if (errors.length > 0) throw invalid(errors);

    const planned = this.plan(dto.teacherId, dto.classId, dto.date, dto.startTime, dto.endTime);
    await this.assertNoConflict(this.prisma, [planned]);
    const row = await this.write(async (tx) => {
      const created = await tx.teachingSession.create({
        data: this.sessionData(planned, { subject: dto.subject ?? null, room: dto.room ?? null }, user.id),
        include: SESSION_INCLUDE,
      });
      await this.audit.log(
        'TIMETABLE_CHANGED',
        { actorId: user.id, ip: ctx.ip, targetType: 'TeachingSession', targetId: created.id, details: { action: 'SESSION_CREATED', after: this.snapshot(created) } },
        tx,
      );
      return created;
    }, [planned]);
    await this.announce([dto.teacherId], [dto.date]);
    return toSessionView(row, this.config.schoolTimezone);
  }

  async createSeries(user: AuthenticatedUser, dto: CreateSeriesDto, ctx: RequestContext) {
    await this.gate.assertManager(user, ctx);
    const errors: FieldErrors = [...(await this.participantErrors(dto.teacherId, dto.classId)), ...this.slotErrors(dto.startTime, dto.endTime)];
    const period = periodError(dto.startDate, dto.endDate);
    if (period) errors.push({ field: 'endDate', messages: [period] });
    const dates = period ? [] : seriesDates(dto, this.today());
    if (!period && dates.length === 0) {
      errors.push({ field: 'endDate', messages: ['Cette période ne contient aucun jour à venir correspondant : allongez-la.'] });
    }
    if (errors.length > 0) throw invalid(errors);

    const planned = dates.map((date) => this.plan(dto.teacherId, dto.classId, date, dto.startTime, dto.endTime));
    await this.assertNoConflict(this.prisma, planned);
    const extra = { subject: dto.subject ?? null, room: dto.room ?? null };
    const series = await this.write(async (tx) => {
      const created = await tx.timetableSeries.create({
        data: {
          teacherId: dto.teacherId,
          classId: dto.classId,
          weekday: dto.weekday,
          startTime: dto.startTime,
          endTime: dto.endTime,
          ...extra,
          startDate: dayValue(dto.startDate),
          endDate: dayValue(dto.endDate),
          createdById: user.id,
        },
        include: SERIES_INCLUDE,
      });
      await tx.teachingSession.createMany({ data: planned.map((p) => ({ ...this.sessionData(p, extra, user.id), seriesId: created.id })) });
      await this.audit.log(
        'TIMETABLE_CHANGED',
        {
          actorId: user.id,
          ip: ctx.ip,
          targetType: 'TimetableSeries',
          targetId: created.id,
          details: {
            action: 'SERIES_CREATED',
            sessionCount: planned.length,
            after: { teacherId: dto.teacherId, classId: dto.classId, weekday: dto.weekday, startTime: dto.startTime, endTime: dto.endTime, ...extra, startDate: dto.startDate, endDate: dto.endDate },
          },
        },
        tx,
      );
      return created;
    }, planned);
    await this.announce([dto.teacherId], dates);
    return { series: toSeriesView(series), sessionCount: planned.length };
  }

  // ---------------------------------------------------------------------------
  // Changements exceptionnels (US2)
  // ---------------------------------------------------------------------------

  /**
   * Modifie une séance seule. Une séance commencée garde son enseignant, sa classe, sa date et ses heures ; une
   * séance annulée ne change plus. Une séance d'une série en est détachée : les changements de la série l'ignorent.
   */
  async updateSession(user: AuthenticatedUser, id: string, dto: UpdateSessionDto, ctx: RequestContext): Promise<SessionView> {
    await this.gate.assertManager(user, ctx);
    const row = UUID.test(id) ? await this.prisma.teachingSession.findUnique({ where: { id }, include: SESSION_INCLUDE }) : null;
    if (!row) throw new AppException('NOT_FOUND');
    if (row.status === 'CANCELLED') throw new AppException('SESSION_LOCKED');
    const structural = (['teacherId', 'classId', 'date', 'startTime', 'endTime'] as const).filter((k) => dto[k] !== undefined);
    if (structural.length === 0 && dto.subject === undefined && dto.room === undefined) {
      throw fieldError('startTime', 'Indiquez ce qui change : enseignant, classe, date, heures, matière ou salle.');
    }
    if (structural.length > 0 && row.startAt <= new Date()) throw new AppException('SESSION_LOCKED');

    const tz = this.config.schoolTimezone;
    const next = {
      teacherId: dto.teacherId ?? row.teacherId,
      classId: dto.classId ?? row.classId,
      date: dto.date ?? dayString(row.localDate),
      startTime: dto.startTime ?? localTime(row.startAt, tz),
      endTime: dto.endTime ?? localTime(row.endAt, tz),
    };
    const errors: FieldErrors = [
      ...(await this.participantErrors(dto.teacherId, dto.classId)),
      ...(structural.length > 0 ? this.slotErrors(next.startTime, next.endTime) : []),
    ];
    if (dto.date !== undefined && dto.date < this.today()) errors.push({ field: 'date', messages: ['Une séance se place à partir d’aujourd’hui.'] });
    if (errors.length > 0) throw invalid(errors);

    const planned = this.plan(next.teacherId, next.classId, next.date, next.startTime, next.endTime, row.id);
    if (structural.length > 0) await this.assertNoConflict(this.prisma, [planned]);
    const saved = await this.write(async (tx) => {
      const updated = await tx.teachingSession.update({
        where: { id },
        data: {
          ...(structural.length > 0
            ? { teacherId: planned.teacherId, classId: planned.classId, localDate: dayValue(planned.date), startAt: planned.startAt, endAt: planned.endAt }
            : {}),
          ...(dto.subject !== undefined ? { subject: dto.subject } : {}),
          ...(dto.room !== undefined ? { room: dto.room } : {}),
          ...(row.seriesId ? { detached: true } : {}),
        },
        include: SESSION_INCLUDE,
      });
      await this.audit.log(
        'TIMETABLE_CHANGED',
        {
          actorId: user.id,
          ip: ctx.ip,
          targetType: 'TeachingSession',
          targetId: id,
          details: { action: 'SESSION_UPDATED', ...(row.seriesId ? { seriesId: row.seriesId } : {}), before: this.snapshot(row), after: this.snapshot(updated) },
        },
        tx,
      );
      return updated;
    }, [planned]);
    await this.announce([row.teacherId, saved.teacherId], [dayString(row.localDate), dayString(saved.localDate)]);
    return toSessionView(saved, this.config.schoolTimezone);
  }

  /** Annule une séance, motif obligatoire ; possible jusqu'à 7 jours en arrière. La ligne reste. */
  async cancelSession(user: AuthenticatedUser, id: string, dto: CancelDto, ctx: RequestContext): Promise<SessionView> {
    await this.gate.assertManager(user, ctx);
    const row = UUID.test(id) ? await this.prisma.teachingSession.findUnique({ where: { id }, include: SESSION_INCLUDE }) : null;
    if (!row) throw new AppException('NOT_FOUND');
    if (row.status === 'CANCELLED' || dayString(row.localDate) < addDays(this.today(), -CANCEL_MAX_DAYS_BACK)) throw new AppException('SESSION_LOCKED');
    const now = new Date();
    const saved = await this.prisma.$transaction(async (tx) => {
      // Conditionnelle : deux annulations simultanées n'en font qu'une.
      const { count } = await tx.teachingSession.updateMany({
        where: { id, status: 'SCHEDULED' },
        data: { status: 'CANCELLED', cancelReason: dto.reason, cancelledAt: now, cancelledById: user.id },
      });
      if (count === 0) throw new AppException('SESSION_LOCKED');
      const updated = await tx.teachingSession.findUniqueOrThrow({ where: { id }, include: SESSION_INCLUDE });
      await this.audit.log(
        'TIMETABLE_CHANGED',
        {
          actorId: user.id,
          ip: ctx.ip,
          targetType: 'TeachingSession',
          targetId: id,
          details: { action: 'SESSION_CANCELLED', reason: dto.reason, before: this.snapshot(row), after: this.snapshot(updated) },
        },
        tx,
      );
      return updated;
    });
    await this.announce([row.teacherId], [dayString(row.localDate)]);
    return toSessionView(saved, this.config.schoolTimezone);
  }

  /**
   * Change une série à partir d'une date (R2) : les séances prévues, non détachées et pas encore commencées de cette
   * date changent sur place ; une fin repoussée crée les séances manquantes, une fin avancée annule celles d'après.
   * Tout ou rien : un seul conflit refuse l'ensemble.
   */
  async updateSeries(user: AuthenticatedUser, id: string, dto: UpdateSeriesDto, ctx: RequestContext) {
    await this.gate.assertManager(user, ctx);
    const row = UUID.test(id) ? await this.prisma.timetableSeries.findUnique({ where: { id }, include: SERIES_INCLUDE }) : null;
    if (!row) throw new AppException('NOT_FOUND');
    const current = {
      teacherId: row.teacherId,
      classId: row.classId,
      startTime: row.startTime,
      endTime: row.endTime,
      subject: row.subject,
      room: row.room,
      endDate: dayString(row.endDate),
    };
    const next = {
      teacherId: dto.teacherId ?? current.teacherId,
      classId: dto.classId ?? current.classId,
      startTime: dto.startTime ?? current.startTime,
      endTime: dto.endTime ?? current.endTime,
      subject: dto.subject !== undefined ? dto.subject : current.subject,
      room: dto.room !== undefined ? dto.room : current.room,
      endDate: dto.endDate ?? current.endDate,
    };
    const changedKeys = (Object.keys(next) as Array<keyof typeof next>).filter((k) => next[k] !== current[k]);
    if (changedKeys.length === 0) throw fieldError('from', 'Indiquez ce qui change dans la série.');
    const errors: FieldErrors = [...(await this.participantErrors(dto.teacherId, dto.classId)), ...this.slotErrors(next.startTime, next.endTime)];
    const period = periodError(dayString(row.startDate), next.endDate);
    if (period) errors.push({ field: 'endDate', messages: [period] });
    if (errors.length > 0) throw invalid(errors);

    const now = new Date();
    const from = dto.from > this.today() ? dto.from : this.today();
    const governed = await this.prisma.teachingSession.findMany({
      where: { seriesId: id, status: 'SCHEDULED', startAt: { gt: now }, localDate: { gte: dayValue(from) } },
      select: { id: true, localDate: true, detached: true },
    });
    const beyond = governed.filter((s) => dayString(s.localDate) > next.endDate);
    const kept = governed.filter((s) => !s.detached && dayString(s.localDate) <= next.endDate);
    const updated = kept.map((s) => this.plan(next.teacherId, next.classId, dayString(s.localDate), next.startTime, next.endTime, s.id));
    const createdDates =
      next.endDate > current.endDate
        ? seriesDates({ weekday: row.weekday, startDate: addDays(current.endDate, 1), endDate: next.endDate }, this.today(), from)
        : [];
    const created = createdDates.map((date) => this.plan(next.teacherId, next.classId, date, next.startTime, next.endTime));
    await this.assertNoConflict(this.prisma, [...updated, ...created]);

    const extra = { subject: next.subject, room: next.room };
    const series = await this.write(async (tx) => {
      const saved = await tx.timetableSeries.update({
        where: { id },
        data: { ...next, ...extra, endDate: dayValue(next.endDate) },
        include: SERIES_INCLUDE,
      });
      for (const p of updated) {
        await tx.teachingSession.update({
          where: { id: p.id },
          data: { teacherId: p.teacherId, classId: p.classId, startAt: p.startAt, endAt: p.endAt, ...extra },
        });
      }
      if (created.length > 0) await tx.teachingSession.createMany({ data: created.map((p) => ({ ...this.sessionData(p, extra, user.id), seriesId: id })) });
      if (beyond.length > 0) {
        await tx.teachingSession.updateMany({
          where: { id: { in: beyond.map((s) => s.id) }, status: 'SCHEDULED' },
          data: { status: 'CANCELLED', cancelReason: SHORTENED_REASON, cancelledAt: now, cancelledById: user.id },
        });
      }
      await this.audit.log(
        'TIMETABLE_CHANGED',
        {
          actorId: user.id,
          ip: ctx.ip,
          targetType: 'TimetableSeries',
          targetId: id,
          details: {
            action: 'SERIES_UPDATED',
            from,
            sessionCount: updated.length,
            count: created.length + beyond.length,
            before: Object.fromEntries(changedKeys.map((k) => [k, current[k]])),
            after: Object.fromEntries(changedKeys.map((k) => [k, next[k]])),
          },
        },
        tx,
      );
      return saved;
    }, [...updated, ...created]);
    await this.announce(
      [current.teacherId, next.teacherId],
      [...updated.map((p) => p.date), ...createdDates, ...beyond.map((s) => dayString(s.localDate))],
    );
    return { series: toSeriesView(series), updated: updated.length, created: created.length, cancelled: beyond.length };
  }

  /** Annule les séances prévues et pas encore commencées d'une série entre deux dates (vacances, sortie…). */
  async cancelSeriesRange(user: AuthenticatedUser, id: string, dto: CancelSeriesDto, ctx: RequestContext) {
    await this.gate.assertManager(user, ctx);
    const row = UUID.test(id) ? await this.prisma.timetableSeries.findUnique({ where: { id }, select: { id: true, teacherId: true } }) : null;
    if (!row) throw new AppException('NOT_FOUND');
    if (dto.to < dto.from) throw fieldError('to', 'La fin doit être le même jour ou après le début.');
    const now = new Date();
    const targets = await this.prisma.teachingSession.findMany({
      where: { seriesId: id, status: 'SCHEDULED', startAt: { gt: now }, localDate: { gte: dayValue(dto.from), lte: dayValue(dto.to) } },
      select: { id: true, localDate: true },
    });
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.teachingSession.updateMany({
        where: { id: { in: targets.map((t) => t.id) }, status: 'SCHEDULED' },
        data: { status: 'CANCELLED', cancelReason: dto.reason, cancelledAt: now, cancelledById: user.id },
      });
      await this.audit.log(
        'TIMETABLE_CHANGED',
        {
          actorId: user.id,
          ip: ctx.ip,
          targetType: 'TimetableSeries',
          targetId: id,
          details: { action: 'SERIES_CANCELLED_RANGE', reason: dto.reason, from: dto.from, to: dto.to, sessionCount: count },
        },
        tx,
      );
      return count;
    });
    await this.announce([row.teacherId], targets.map((t) => dayString(t.localDate)));
    return { cancelled };
  }

  // ---------------------------------------------------------------------------
  // Outils
  // ---------------------------------------------------------------------------

  private today(): string {
    return localDate(new Date(), this.config.schoolTimezone);
  }

  private plan(teacherId: string, classId: string, date: string, startTime: string, endTime: string, id?: string): Planned {
    return { id, teacherId, classId, date, ...sessionRange(date, startTime, endTime, this.config.schoolTimezone) };
  }

  private sessionData(p: Planned, extra: { subject: string | null; room: string | null }, authorId: string) {
    return { teacherId: p.teacherId, classId: p.classId, localDate: dayValue(p.date), startAt: p.startAt, endAt: p.endAt, ...extra, createdById: authorId };
  }

  private slotErrors(startTime: string, endTime: string): FieldErrors {
    const error = slotError(startTime, endTime);
    return error ? [{ field: 'endTime', messages: [error] }] : [];
  }

  /** Enseignant actif du groupe Enseignants, classe active. */
  private async participantErrors(teacherId: string | undefined, classId: string | undefined): Promise<FieldErrors> {
    const errors: FieldErrors = [];
    if (teacherId !== undefined) {
      const teacher = await this.prisma.user.findUnique({ where: { id: teacherId }, select: { active: true } });
      if (!teacher?.active || !(await groupFlagsOf(this.prisma, teacherId)).isTeacher) {
        errors.push({ field: 'teacherId', messages: ['Choisissez un enseignant actif du groupe Enseignants.'] });
      }
    }
    if (classId !== undefined) {
      const schoolClass = await this.prisma.schoolClass.findUnique({ where: { id: classId }, select: { active: true } });
      if (!schoolClass?.active) errors.push({ field: 'classId', messages: ['Choisissez une classe active.'] });
    }
    return errors;
  }

  /** Vérification préalable (lisible) ; la contrainte d'exclusion de la base reste la garantie. */
  private async assertNoConflict(db: Db, planned: readonly Planned[]): Promise<void> {
    if (planned.length === 0) return;
    const conflicts = await this.conflictsOf(db, planned);
    if (conflicts.length > 0) throw this.conflictError(conflicts);
  }

  private async conflictsOf(db: Db, planned: readonly Planned[]): Promise<ConflictFound<Loaded, Planned>[]> {
    const from = new Date(Math.min(...planned.map((p) => p.startAt.getTime())));
    const to = new Date(Math.max(...planned.map((p) => p.endAt.getTime())));
    const existing = await db.teachingSession.findMany({
      where: {
        status: 'SCHEDULED',
        startAt: { lt: to },
        endAt: { gt: from },
        OR: [{ teacherId: { in: [...new Set(planned.map((p) => p.teacherId))] } }, { classId: { in: [...new Set(planned.map((p) => p.classId))] } }],
      },
      select: {
        id: true,
        teacherId: true,
        classId: true,
        startAt: true,
        endAt: true,
        status: true,
        localDate: true,
        teacher: { select: { id: true, displayName: true } },
        class: { select: { id: true, name: true } },
      },
    });
    return findConflicts<Loaded, Planned>(planned, existing);
  }

  private conflictError(conflicts: readonly ConflictFound<Loaded, Planned>[]): AppException {
    return new AppException('TIMETABLE_CONFLICT', {
      conflicts: conflicts.map((c) => ({
        kind: c.kind,
        sessionId: c.existing.id,
        date: dayString(c.existing.localDate),
        startAt: c.existing.startAt,
        endAt: c.existing.endAt,
        teacher: c.existing.teacher,
        class: c.existing.class,
        proposed: { date: c.proposed.date, startAt: c.proposed.startAt, endAt: c.proposed.endAt },
      })),
    });
  }

  /**
   * Écriture en transaction. Si une écriture concurrente a pris le créneau entre la vérification et l'insertion,
   * la base refuse (23P01) : on relit les conflits pour les lister.
   */
  private async write<T>(work: (tx: Prisma.TransactionClient) => Promise<T>, planned: readonly Planned[]): Promise<T> {
    try {
      return await this.prisma.$transaction(work);
    } catch (error) {
      if (!isOverlapViolation(error)) throw error;
      const conflicts = await this.conflictsOf(this.prisma, planned);
      throw conflicts.length > 0 ? this.conflictError(conflicts) : new AppException('TIMETABLE_CONFLICT', { conflicts: [] });
    }
  }

  private snapshot(row: { teacherId: string; classId: string; localDate: Date; startAt: Date; endAt: Date; subject: string | null; room: string | null; status: string }) {
    return {
      teacherId: row.teacherId,
      classId: row.classId,
      date: dayString(row.localDate),
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      subject: row.subject,
      room: row.room,
      status: row.status,
    };
  }

  /**
   * `timetable:updated` vers l'administration et les enseignants concernés ; aucune donnée dans l'événement :
   * les écrans relisent par REST, où les droits sont revérifiés.
   */
  private async announce(teacherIds: readonly string[], dates: readonly string[]): Promise<void> {
    const managers = await this.prisma.user.findMany({ where: { active: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { id: true } });
    this.realtime.emitToUsers([...managers.map((m) => m.id), ...teacherIds], 'timetable:updated', { dates: [...new Set(dates)].sort() });
  }
}
