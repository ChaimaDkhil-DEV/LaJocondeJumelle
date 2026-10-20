import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { addDays, atLocalTime, localDate, localTime, relativeDay } from '../common/school-time';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import type { RequestContext } from '../requests/requests.service';
import { SettingsService } from '../settings/settings.service';
import { CoverageAccessLoader, type CoverageRulesSnapshot } from './coverage-access.loader';
import { CoverageActionsService, formatCoverageReference } from './coverage-actions.service';
import { adminRecipients } from './coverage-groups';
import { availabilityFor, supervisorCandidates, type SupervisorCandidate } from './coverage-availability';
import { groupFlagsOf, supervisorIds, teacherIds } from './coverage-groups';
import type {
  CreateCoverageDto,
  ListCoverageQuery,
  OwnAvailabilityDto,
  SlotCandidatesQuery,
  SetAvailabilityDto,
  TeacherRequestDto,
  UpdateTeacherRequestDto,
} from './coverage.dto';
import {
  COVERAGE_INCLUDE,
  coverageAlerts,
  toCoverageDetail,
  toCoverageSummary,
  type CoverageDetail,
  type CoverageSummary,
  type HistoryEntry,
  type PresenceView,
} from './coverage.mapper';
import { nextCoverageDeadline } from './domain/coverage-deadlines';
import {
  canReadPresenceProof,
  coverageActionsFor,
  coverageActors,
  coverageView,
  isCoverageAdmin,
  isEligibleAssignee,
  moduleCapabilities,
  nowSlot,
} from './domain/coverage-policy';
import { applyCoverageAction, applyCoverageCreation, ACTIVE_GUARD_STATUSES } from './domain/coverage-state-machine';
import { FINAL_STATUSES, MAIN_STATUS_VALUES } from './domain/coverage-status';
import { verifyQrToken } from './domain/qr-token';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINUTE_MS = 60_000;
/** Heure de début acceptée pour une affectation directe : de 12 h dans le passé à 7 jours dans le futur. */
const MAX_PAST_MS = 12 * 60 * MINUTE_MS;
const MAX_FUTURE_MS = 7 * 24 * 60 * MINUTE_MS;

function fieldError(field: string, message: string): AppException {
  return new AppException('VALIDATION_ERROR', { fields: [{ field, messages: [message] }] }, message);
}

@Injectable()
export class CoverageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CoverageAccessLoader,
    private readonly actions: CoverageActionsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ---------------------------------------------------------------------------
  // Demande d'un enseignant (US1, FR-012 à FR-014, FR-008g)
  // ---------------------------------------------------------------------------

  /** « Aujourd'hui » et « demain » dans le fuseau de l'école (formulaire de l'enseignant). */
  schoolDates(now = new Date()) {
    const today = localDate(now, this.config.schoolTimezone);
    return { timezone: this.config.schoolTimezone, today, tomorrow: addDays(today, 1) };
  }

  /** Toutes les classes actives, avec leur étage (FR-012 : choisie parmi toutes les classes). */
  async classes(user: AuthenticatedUser, ctx: RequestContext) {
    if (!moduleCapabilities(await this.access.viewer(user)).view) {
      await this.logDenied(user, 'coverage', ctx, 'NOT_IN_MODULE');
      throw new AppException('NOT_FOUND');
    }
    return this.prisma.schoolClass.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, room: true, floor: { select: { id: true, name: true } } },
    });
  }

  /** « Mes signalements » : demandes de l'enseignant, les plus récentes d'abord. */
  async myRequests(user: AuthenticatedUser, ctx: RequestContext): Promise<CoverageSummary[]> {
    await this.assertCanReport(user, ctx);
    const rows = await this.prisma.request.findMany({
      where: { kind: 'COVERAGE', requesterId: user.id, coverage: { source: 'TEACHER_REQUEST' } },
      include: COVERAGE_INCLUDE,
      orderBy: [{ coverage: { startAt: 'desc' } }, { id: 'desc' }],
      take: 100,
    });
    return rows.map(toCoverageSummary);
  }

  async createTeacherRequest(
    user: AuthenticatedUser,
    dto: TeacherRequestDto,
    ctx: RequestContext,
  ): Promise<{ created: boolean; detail: CoverageDetail }> {
    await this.assertCanReport(user, ctx);
    const existing = await this.prisma.request.findUnique({ where: { requesterId_clientId: { requesterId: user.id, clientId: dto.clientId } } });
    if (existing) return { created: false, detail: await this.detail(user, existing.id, ctx) };

    const category = await this.prisma.category.findFirst({ where: { kind: 'COVERAGE', active: true }, orderBy: { createdAt: 'asc' } });
    if (!category) throw new AppException('NOT_FOUND', undefined, 'Catégorie de garde introuvable ou désactivée.');
    const schoolClass = await this.prisma.schoolClass.findUnique({ where: { id: dto.classId } });
    if (!schoolClass || !schoolClass.active) throw new AppException('CLASS_INACTIVE');
    const now = new Date();
    const { startAt, plannedEndAt } = this.teacherSlot(dto.date, dto.startTime, dto.endTime, dto.durationMinutes, now);
    const creation = applyCoverageCreation('CREATE_TEACHER_REQUEST', { actors: ['REQUESTER_TEACHER'] });
    if (!creation.ok) throw new AppException(creation.code);

    const priority = 'URGENT';
    const rule = await this.prisma.deadlineRule.findUnique({ where: { categoryId_priority: { categoryId: category.id, priority } } });
    const rules: CoverageRulesSnapshot = {
      kind: 'COVERAGE',
      proofMode: category.proofMode,
      finalValidation: category.finalValidation,
      takeoverMinutes: rule?.takeoverMinutes ?? null,
      arrivalMinutes: rule?.arrivalMinutes ?? null,
    };

    try {
      const id = await this.actions.run(async (tx, effects) => {
        const [{ n }] = await tx.$queryRaw<Array<{ n: number }>>`
          SELECT nextval(pg_get_serial_sequence('"Request"', 'number'))::int AS n`;
        const request = await tx.request.create({
          data: {
            kind: 'COVERAGE',
            number: n,
            reference: formatCoverageReference(n, now),
            clientId: dto.clientId,
            title: `${dto.type === 'LATENESS' ? 'Retard' : 'Absence'} — ${schoolClass.name}`.slice(0, 120),
            categoryId: category.id,
            priority,
            requesterId: user.id,
            status: 'PENDING',
            rulesSnapshot: rules as unknown as Prisma.InputJsonValue,
            createdAt: now,
            submittedAt: now,
            coverage: {
              create: {
                classId: schoolClass.id,
                floorId: schoolClass.floorId,
                source: 'TEACHER_REQUEST',
                type: dto.type,
                teacherId: user.id,
                reason: dto.reason ?? null,
                startAt,
                plannedEndAt,
                estimatedMinutes: Math.round((plannedEndAt.getTime() - startAt.getTime()) / MINUTE_MS),
              },
            },
          },
        });
        // Historique sans motif (R5) : source, type et classe seulement.
        await tx.requestEvent.create({
          data: { requestId: request.id, actorId: user.id, type: 'CREATED', toValue: { source: 'TEACHER_REQUEST', type: dto.type, classId: schoolClass.id } },
        });
        await tx.requestEvent.create({
          data: { requestId: request.id, actorId: user.id, type: 'STATUS_CHANGED', fromValue: Prisma.JsonNull, toValue: { status: 'PENDING' } },
        });
        await this.actions.applyReminders(
          tx,
          request,
          { type: 'CREATED' },
          { status: 'PENDING', source: 'TEACHER_REQUEST', startAt, plannedEndAt, assigneeId: null },
          now,
        );
        await this.actions.notify(tx, effects, await adminRecipients(tx), user.id, 'COVERAGE_REQUESTED', request.id, priority);
        const row = await this.actions.load(tx, request.id);
        await this.actions.pushUpdate(tx, row!, 'PENDING', request.version, effects, []);
        return request.id;
      });
      return { created: true, detail: await this.detail(user, id, ctx) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.request.findUnique({ where: { requesterId_clientId: { requesterId: user.id, clientId: dto.clientId } } });
        if (duplicate) return { created: false, detail: await this.detail(user, duplicate.id, ctx) };
      }
      throw error;
    }
  }

  /** Modification par l'auteur tant que la demande est « en attente » ; tracée, échéances recalculées. */
  async updateTeacherRequest(user: AuthenticatedUser, id: string, dto: UpdateTeacherRequestDto, ctx: RequestContext): Promise<CoverageDetail> {
    const row = await this.actions.load(this.prisma, id);
    const facts = row && (await this.access.facts(row));
    const actors = facts ? coverageActors(await this.access.viewer(user), facts) : [];
    if (!row || !facts || !actors.includes('REQUESTER_TEACHER')) {
      await this.logDenied(user, id, ctx, 'NOT_VISIBLE');
      throw new AppException('NOT_FOUND');
    }
    if (row.status !== 'PENDING') throw new AppException('NOT_PENDING');
    if (dto.version !== row.version) throw new AppException('STATE_CHANGED');
    const result = applyCoverageAction(facts, 'UPDATE', { actors });
    if (!result.ok) throw new AppException(result.code);

    const coverage = row.coverage!;
    const tz = this.config.schoolTimezone;
    let classId = coverage.classId;
    let floorId = coverage.floorId;
    let className = coverage.class.name;
    if (dto.classId && dto.classId !== coverage.classId) {
      const schoolClass = await this.prisma.schoolClass.findUnique({ where: { id: dto.classId } });
      if (!schoolClass || !schoolClass.active) throw new AppException('CLASS_INACTIVE');
      ({ id: classId, floorId, name: className } = schoolClass);
    }
    const slotChanged = [dto.date, dto.startTime, dto.endTime, dto.durationMinutes].some((v) => v !== undefined);
    const now = new Date();
    const { startAt, plannedEndAt } = slotChanged
      ? this.teacherSlot(
          dto.date ?? localDate(coverage.startAt, tz),
          dto.startTime ?? localTime(coverage.startAt, tz),
          dto.endTime ?? (dto.durationMinutes === undefined && coverage.plannedEndAt ? localTime(coverage.plannedEndAt, tz) : undefined),
          dto.durationMinutes,
          now,
        )
      : { startAt: coverage.startAt, plannedEndAt: coverage.plannedEndAt! };
    const type = dto.type ?? coverage.type ?? 'LATENESS';
    const reasonChanged = dto.reason !== undefined && (dto.reason ?? null) !== coverage.reason;

    await this.actions.run(async (tx, effects) => {
      const { count } = await tx.request.updateMany({
        where: { id: row.id, status: 'PENDING', version: row.version },
        data: { version: { increment: 1 }, title: `${type === 'LATENESS' ? 'Retard' : 'Absence'} — ${className}`.slice(0, 120) },
      });
      if (count === 0) throw new AppException('STATE_CHANGED');
      await tx.coverageDetail.update({
        where: { requestId: row.id },
        data: {
          classId,
          floorId,
          type,
          startAt,
          plannedEndAt,
          estimatedMinutes: Math.round((plannedEndAt.getTime() - startAt.getTime()) / MINUTE_MS),
          ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
        },
      });
      // Historique sans motif (R5) : seulement le fait qu'il a changé.
      await tx.requestEvent.create({
        data: {
          requestId: row.id,
          actorId: user.id,
          type: 'UPDATED',
          fromValue: { classId: coverage.classId, type: coverage.type, startAt: coverage.startAt.toISOString(), plannedEndAt: coverage.plannedEndAt?.toISOString() ?? null },
          toValue: { classId, type, startAt: startAt.toISOString(), plannedEndAt: plannedEndAt.toISOString(), reasonChanged },
        },
      });
      await this.actions.applyReminders(
        tx,
        row,
        { type: 'TRANSITION', action: 'UPDATE' },
        { status: 'PENDING', source: coverage.source, startAt, plannedEndAt, assigneeId: null },
        now,
      );
      await this.actions.notify(tx, effects, await adminRecipients(tx), user.id, 'COVERAGE_UPDATED', row.id, row.priority);
      await this.actions.pushUpdate(tx, row, 'PENDING', row.version + 1, effects, []);
    });
    return this.detail(user, row.id, ctx);
  }

  /**
   * Plage d'une demande d'enseignant (FR-012) : date d'aujourd'hui ou de demain dans le fuseau de
   * l'école, fin (heure ou durée, l'une des deux) après le début, plage pas entièrement passée.
   */
  private teacherSlot(date: string, startTime: string, endTime: string | undefined, durationMinutes: number | undefined, now: Date) {
    if (endTime === undefined && durationMinutes === undefined) throw fieldError('endTime', 'Indiquez l’heure de fin ou une durée.');
    if (endTime !== undefined && durationMinutes !== undefined) {
      throw fieldError('durationMinutes', 'Indiquez l’heure de fin ou une durée, pas les deux.');
    }
    const tz = this.config.schoolTimezone;
    if (!relativeDay(date, now, tz)) throw new AppException('INVALID_DATE');
    const startAt = atLocalTime(date, startTime, tz);
    const plannedEndAt = endTime !== undefined ? atLocalTime(date, endTime, tz) : new Date(startAt.getTime() + durationMinutes! * MINUTE_MS);
    if (plannedEndAt <= startAt || plannedEndAt <= now) throw new AppException('INVALID_RANGE');
    return { startAt, plannedEndAt };
  }

  /** Signaler : membre du groupe Enseignants, ou super administrateur ; sinon 404 journalisé. */
  private async assertCanReport(user: AuthenticatedUser, ctx: RequestContext): Promise<void> {
    if (moduleCapabilities(await this.access.viewer(user)).report) return;
    await this.logDenied(user, 'coverage', ctx, 'NOT_TEACHER');
    throw new AppException('NOT_FOUND');
  }

  // ---------------------------------------------------------------------------
  // Affectation directe (admin, FR-019)
  // ---------------------------------------------------------------------------

  /** Formulaire d'affectation directe : classes (avec étage) et enseignants. */
  async formOptions(user: AuthenticatedUser, ctx: RequestContext) {
    await this.assertCoverageAdmin(user, ctx);
    const [classes, teachers] = await Promise.all([
      this.prisma.schoolClass.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, room: true, floor: { select: { id: true, name: true } } },
      }),
      this.teachers(),
    ]);
    return { classes, teachers };
  }

  /** Membres actifs du groupe Enseignants (choix de l'enseignant concerné). */
  async teachers() {
    return this.prisma.user.findMany({
      where: { id: { in: await teacherIds(this.prisma) } },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
    });
  }

  async create(user: AuthenticatedUser, dto: CreateCoverageDto, ctx: RequestContext): Promise<{ created: boolean; detail: CoverageDetail }> {
    await this.assertCoverageAdmin(user, ctx);
    const existing = await this.prisma.request.findUnique({ where: { requesterId_clientId: { requesterId: user.id, clientId: dto.clientId } } });
    if (existing) return { created: false, detail: await this.detail(user, existing.id, ctx) };

    const category = await this.prisma.category.findFirst({ where: { kind: 'COVERAGE', active: true }, orderBy: { createdAt: 'asc' } });
    if (!category) throw new AppException('NOT_FOUND', undefined, 'Catégorie de garde introuvable ou désactivée.');
    const schoolClass = await this.prisma.schoolClass.findUnique({ where: { id: dto.classId } });
    if (!schoolClass || !schoolClass.active) throw new AppException('CLASS_INACTIVE');
    if (dto.teacherId && !(await groupFlagsOf(this.prisma, dto.teacherId)).isTeacher) {
      throw fieldError('teacherId', 'Cet enseignant n’appartient pas au groupe Enseignants.');
    }
    if (dto.voiceFileId) {
      const voice = await this.prisma.file.findUnique({ where: { id: dto.voiceFileId } });
      if (!voice || voice.uploaderId !== user.id || voice.kind !== 'VOICE' || voice.requestId !== null) {
        throw fieldError('voiceFileId', 'Message vocal introuvable. Enregistrez-le de nouveau.');
      }
    }

    // Heures de référence : toujours celles du serveur.
    const now = new Date();
    const startAt = new Date(dto.startAt);
    const plannedEndAt = new Date(dto.endAt);
    if (startAt.getTime() < now.getTime() - MAX_PAST_MS || startAt.getTime() > now.getTime() + MAX_FUTURE_MS) {
      throw fieldError('startAt', 'L’heure de début doit être comprise entre 12 h avant et 7 jours après maintenant.');
    }
    if (plannedEndAt <= startAt || plannedEndAt <= now) throw new AppException('INVALID_RANGE');

    const slot = { startAt, plannedEndAt };
    const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId }, select: { id: true, active: true } });
    const flags = assignee ? await groupFlagsOf(this.prisma, assignee.id) : null;
    const availability = await availabilityFor(this.prisma, [dto.assigneeId], slot);
    const creation = applyCoverageCreation('CREATE_DIRECT', {
      actors: ['ADMIN'],
      assigneeId: dto.assigneeId,
      assigneeEligible: assignee !== null && isEligibleAssignee({ active: assignee.active, ...flags! }),
      available: availability.get(dto.assigneeId)?.available ?? false,
    });
    if (!creation.ok) throw new AppException(creation.code);

    const priority = 'URGENT';
    const rule = await this.prisma.deadlineRule.findUnique({ where: { categoryId_priority: { categoryId: category.id, priority } } });
    const rules: CoverageRulesSnapshot = {
      kind: 'COVERAGE',
      proofMode: category.proofMode,
      finalValidation: category.finalValidation,
      takeoverMinutes: rule?.takeoverMinutes ?? null,
      arrivalMinutes: rule?.arrivalMinutes ?? null,
    };
    const deadline = nextCoverageDeadline(
      { currentStage: null, currentDueAt: null, warnAt: null, overdueStage: null },
      [{ from: 'PENDING', to: 'ACCEPTED', action: 'ASSIGN', actor: 'ADMIN' }],
      rules,
      startAt,
      now,
      await this.settings.get('deadlineWarnPercent'),
    );

    try {
      const id = await this.actions.run(async (tx, effects) => {
        const [{ n }] = await tx.$queryRaw<Array<{ n: number }>>`
          SELECT nextval(pg_get_serial_sequence('"Request"', 'number'))::int AS n`;
        const request = await tx.request.create({
          data: {
            kind: 'COVERAGE',
            number: n,
            reference: formatCoverageReference(n, now),
            clientId: dto.clientId,
            title: `Garde — ${schoolClass.name}`.slice(0, 120),
            description: dto.note ?? null,
            voiceFileId: dto.voiceFileId ?? null,
            categoryId: category.id,
            priority,
            requesterId: user.id,
            assigneeId: dto.assigneeId,
            status: 'ACCEPTED',
            rulesSnapshot: rules as unknown as Prisma.InputJsonValue,
            createdAt: now,
            submittedAt: now,
            assignedAt: now,
            acceptedAt: now,
            ...deadline,
            coverage: {
              create: {
                classId: schoolClass.id,
                // Copie de l'étage de la classe : l'historique reste stable si la classe change d'étage.
                floorId: schoolClass.floorId,
                source: 'ADMIN_DIRECT',
                type: dto.type,
                teacherId: dto.teacherId ?? null,
                reason: dto.reason ?? null,
                startAt,
                plannedEndAt,
                estimatedMinutes: Math.round((plannedEndAt.getTime() - startAt.getTime()) / MINUTE_MS),
              },
            },
          },
        });
        if (dto.voiceFileId) await tx.file.update({ where: { id: dto.voiceFileId }, data: { requestId: request.id } });
        await tx.requestEvent.create({
          data: {
            requestId: request.id,
            actorId: user.id,
            type: 'CREATED',
            toValue: { source: 'ADMIN_DIRECT', type: dto.type, classId: schoolClass.id },
          },
        });
        await tx.requestEvent.create({
          data: { requestId: request.id, actorId: user.id, type: 'STATUS_CHANGED', fromValue: Prisma.JsonNull, toValue: { status: 'ACCEPTED' } },
        });
        await tx.requestEvent.create({
          data: { requestId: request.id, actorId: user.id, type: 'ASSIGNED', toValue: { assigneeId: dto.assigneeId } },
        });
        await this.audit.log(
          'COVERAGE_CREATED',
          {
            actorId: user.id,
            ip: ctx.ip,
            targetType: 'Request',
            targetId: request.id,
            details: { source: 'ADMIN_DIRECT', type: dto.type, classId: schoolClass.id, assigneeId: dto.assigneeId, status: 'ACCEPTED' },
          },
          tx,
        );
        await this.actions.applyReminders(
          tx,
          request,
          { type: 'CREATED' },
          { status: 'ACCEPTED', source: 'ADMIN_DIRECT', startAt, plannedEndAt, assigneeId: dto.assigneeId },
          now,
        );
        await this.actions.notify(tx, effects, [dto.assigneeId], user.id, 'ASSIGNED', request.id, priority);
        const row = await this.actions.load(tx, request.id);
        await this.actions.pushUpdate(tx, row!, 'ACCEPTED', request.version, effects, [dto.assigneeId]);
        return request.id;
      });
      return { created: true, detail: await this.detail(user, id, ctx) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.request.findUnique({
          where: { requesterId_clientId: { requesterId: user.id, clientId: dto.clientId } },
        });
        if (duplicate) return { created: false, detail: await this.detail(user, duplicate.id, ctx) };
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Surveillant
  // ---------------------------------------------------------------------------

  /** Affectations et renforts en cours du surveillant (« Mes affectations »). */
  async mine(user: AuthenticatedUser, ctx: RequestContext) {
    await this.assertSupervisorSpace(user, ctx);
    const rows = await this.prisma.request.findMany({
      where: {
        kind: 'COVERAGE',
        OR: [
          { assigneeId: user.id, status: { in: [...ACTIVE_GUARD_STATUSES, 'DONE'] } },
          { supports: { some: { userId: user.id, releasedAt: null } }, status: { in: [...ACTIVE_GUARD_STATUSES] } },
        ],
      },
      select: { id: true },
      orderBy: [{ acceptedAt: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    });
    const items: CoverageDetail[] = [];
    for (const r of rows) items.push(await this.detail(user, r.id, ctx));
    return { availability: await this.myAvailability(user), items };
  }

  /** Historique personnel : affectations effectuées ou annulées. */
  async history(user: AuthenticatedUser, ctx: RequestContext) {
    await this.assertSupervisorSpace(user, ctx);
    const rows = await this.prisma.request.findMany({
      where: { kind: 'COVERAGE', assigneeId: user.id, status: { in: ['DONE', 'CLOSED', 'CANCELLED'] } },
      include: COVERAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { guards: rows.map(toCoverageSummary) };
  }

  /** Disponibilité déclarée, affectations en cours et capacités dans le module (menu, onglets). */
  async myAvailability(user: AuthenticatedUser) {
    const viewer = await this.access.viewer(user);
    const [me, guards] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { availability: true } }),
      this.prisma.request.findMany({
        where: { kind: 'COVERAGE', assigneeId: user.id, status: { in: [...ACTIVE_GUARD_STATUSES] } },
        select: { id: true, coverage: { select: { startAt: true, plannedEndAt: true } } },
      }),
    ]);
    const capabilities = moduleCapabilities(viewer);
    return {
      availability: me.availability,
      activeGuards: guards.map((g) => ({ requestId: g.id, startAt: g.coverage!.startAt, plannedEndAt: g.coverage!.plannedEndAt })),
      isTeacher: viewer.isTeacher,
      isSupervisor: viewer.isSupervisor,
      /** Membre du groupe Surveillants (onglets surveillant). */
      inGroup: viewer.isSupervisor,
      /** Admin ou super administrateur (écrans de gestion). */
      canManage: capabilities.manage,
      capabilities,
      /** « Aujourd'hui » et « demain » de l'école (formulaire de l'enseignant). */
      schoolDates: this.schoolDates(),
    };
  }

  /** Un surveillant se déclare disponible ou indisponible (« Absent » est réservé aux admins). */
  async setOwnAvailability(user: AuthenticatedUser, dto: OwnAvailabilityDto, ctx: RequestContext) {
    await this.assertSupervisorSpace(user, ctx);
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { availability: true } });
    if (current.availability === 'ABSENT') {
      throw new AppException('FORBIDDEN', undefined, 'Vous êtes déclaré absent : seul un admin peut modifier ce statut.');
    }
    await this.writeAvailability(user, user.id, current.availability, dto.availability, ctx);
    return this.myAvailability(user);
  }

  /** Admin : disponibilité d'un surveillant, y compris « Absent ». */
  async setAvailability(user: AuthenticatedUser, userId: string, dto: SetAvailabilityDto, ctx: RequestContext) {
    await this.assertCoverageAdmin(user, ctx);
    const target = UUID.test(userId)
      ? await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, availability: true, active: true } })
      : null;
    if (!target || !target.active) throw new AppException('NOT_FOUND');
    await this.writeAvailability(user, target.id, target.availability, dto.availability, ctx);
    return { userId: target.id, availability: dto.availability };
  }

  /** Équipe : surveillants, avec étage, disponibilité et affectation en cours (admins). */
  async team(user: AuthenticatedUser, ctx: RequestContext) {
    await this.assertCoverageAdmin(user, ctx);
    const members = await this.prisma.user.findMany({
      where: { id: { in: await supervisorIds(this.prisma) } },
      select: { id: true, displayName: true, jobTitle: true, floor: { select: { id: true, name: true } } },
      orderBy: { displayName: 'asc' },
    });
    const availability = await availabilityFor(
      this.prisma,
      members.map((m) => m.id),
      nowSlot(),
    );
    return members.map((m) => ({
      ...m,
      availability: availability.get(m.id)?.availability ?? 'AVAILABLE',
      available: availability.get(m.id)?.available ?? false,
      reason: availability.get(m.id)?.reason ?? null,
      guardRequestId: availability.get(m.id)?.guardRequestId ?? null,
    }));
  }

  // ---------------------------------------------------------------------------
  // Lecture
  // ---------------------------------------------------------------------------

  async detail(user: AuthenticatedUser, id: string, ctx: RequestContext): Promise<CoverageDetail> {
    const row = await this.actions.load(this.prisma, id);
    const facts = row && (await this.access.facts(row));
    const viewer = await this.access.viewer(user);
    const view = facts ? coverageView(viewer, facts) : null;
    if (!row || !facts || !view) {
      await this.logDenied(user, id, ctx, 'NOT_VISIBLE');
      throw new AppException('NOT_FOUND');
    }
    const participant = view !== 'TEACHER';
    const presences = participant
      ? await this.prisma.coveragePresence.findMany({
          where: { requestId: row.id },
          include: { user: { select: { id: true, displayName: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const presenceViews: PresenceView[] = presences.map((p) => ({
      method: p.method,
      at: p.createdAt,
      by: p.user,
      fileId: p.fileId && canReadPresenceProof(viewer, facts, p.userId) ? p.fileId : null,
    }));
    return toCoverageDetail(row, {
      view,
      allowedActions: coverageActionsFor(viewer, facts),
      presences: presenceViews,
      history: participant ? await this.historyOf(row.id) : null,
    });
  }

  /** Liste des affectations (admins) : délais de prise en charge expirés d'abord, puis par début (FR-011e). */
  async list(user: AuthenticatedUser, query: ListCoverageQuery, ctx: RequestContext): Promise<CoverageSummary[]> {
    await this.assertCoverageAdmin(user, ctx);
    const rows = await this.prisma.request.findMany({
      where: { AND: [{ kind: 'COVERAGE' }, ...coverageFilters(query)] },
      include: COVERAGE_INCLUDE,
      orderBy: [{ coverage: { startAt: 'asc' } }, { id: 'asc' }],
      take: 300,
    });
    const rank = (r: (typeof rows)[number]) => (coverageAlerts(r).length > 0 ? 0 : r.status === 'PENDING' ? 1 : 2);
    return [...rows].sort((a, b) => rank(a) - rank(b)).map(toCoverageSummary);
  }

  /** Surveillants proposables pour l'affectation, avec leur disponibilité (FR-010). */
  async candidates(user: AuthenticatedUser, id: string, ctx: RequestContext): Promise<SupervisorCandidate[]> {
    const row = await this.actions.load(this.prisma, id);
    if (!row || !isCoverageAdmin(user)) {
      await this.logDenied(user, id, ctx, 'FORBIDDEN_CANDIDATES');
      throw new AppException('NOT_FOUND');
    }
    const floorId =
      row.coverage!.floorId ??
      (await this.prisma.schoolClass.findUnique({ where: { id: row.coverage!.classId }, select: { floorId: true } }))?.floorId ??
      null;
    const candidates = await supervisorCandidates(this.prisma, this.actions.slot(row), floorId, row.id);
    return candidates.filter((c) => c.id !== row.assigneeId);
  }

  /**
   * Surveillants proposables pour un créneau, avant création (FR-010, FR-019) : étage de la classe
   * d'abord, disponibles d'abord ; un surveillant occupé sur un créneau qui chevauche est indisponible.
   */
  async slotCandidates(user: AuthenticatedUser, query: SlotCandidatesQuery, ctx: RequestContext): Promise<SupervisorCandidate[]> {
    await this.assertCoverageAdmin(user, ctx);
    const schoolClass = await this.prisma.schoolClass.findUnique({ where: { id: query.classId }, select: { active: true, floorId: true } });
    if (!schoolClass || !schoolClass.active) throw new AppException('CLASS_INACTIVE');
    const slot = { startAt: new Date(query.startAt), plannedEndAt: new Date(query.endAt) };
    if (slot.plannedEndAt <= slot.startAt) throw new AppException('INVALID_RANGE');
    return supervisorCandidates(this.prisma, slot, schoolClass.floorId);
  }

  /**
   * Page ouverte par le QR code : n'enregistre RIEN. Indique la classe et, si l'utilisateur est le
   * surveillant d'une affectation de cette classe, l'affectation concernée ; la présence se valide
   * ensuite par un POST explicite (action CONFIRM_PRESENCE) qui revérifie tout.
   */
  async resolveQr(user: AuthenticatedUser, token: string, ctx: RequestContext) {
    // Page du QR : membres du module seulement (un employé hors module n'apprend même pas la classe).
    if (!moduleCapabilities(await this.access.viewer(user)).view) {
      await this.logDenied(user, 'coverage', ctx, 'NOT_IN_MODULE');
      throw new AppException('NOT_FOUND');
    }
    const parsed = verifyQrToken(this.actions.key, token);
    const schoolClass = parsed ? await this.prisma.schoolClass.findUnique({ where: { id: parsed.classId } }) : null;
    if (!parsed || !schoolClass || !schoolClass.active || schoolClass.qrVersion !== parsed.version) {
      throw new AppException('QR_INVALID');
    }
    const guards = await this.prisma.request.findMany({
      where: { kind: 'COVERAGE', assigneeId: user.id, status: { in: [...ACTIVE_GUARD_STATUSES] } },
      include: COVERAGE_INCLUDE,
      orderBy: { acceptedAt: 'desc' },
    });
    const match = guards.find((g) => g.coverage!.classId === schoolClass.id) ?? null;
    return {
      class: { id: schoolClass.id, name: schoolClass.name, room: schoolClass.room },
      coverage: match ? toCoverageSummary(match) : null,
      /** Une affectation en cours concerne une autre classe : le QR sera refusé. */
      otherClassGuard: !match && guards.length > 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Outils
  // ---------------------------------------------------------------------------

  /** Admin ou super administrateur (R9). */
  isCoverageManagerUser(user: AuthenticatedUser): boolean {
    return isCoverageAdmin(user);
  }

  /** Espace du surveillant (ses affectations, son historique, sa disponibilité) : groupe Surveillants ou super administrateur. */
  private async assertSupervisorSpace(user: AuthenticatedUser, ctx: RequestContext): Promise<void> {
    if (moduleCapabilities(await this.access.viewer(user)).declareEmptyClass) return;
    await this.logDenied(user, 'coverage', ctx, 'NOT_SUPERVISOR');
    throw new AppException('NOT_FOUND');
  }

  private async assertCoverageAdmin(user: AuthenticatedUser, ctx: RequestContext): Promise<void> {
    if (isCoverageAdmin(user)) return;
    await this.logDenied(user, 'coverage', ctx, 'NOT_COVERAGE_ADMIN');
    throw new AppException('NOT_FOUND');
  }

  private async historyOf(requestId: string): Promise<HistoryEntry[]> {
    const events = await this.prisma.requestEvent.findMany({
      where: { requestId },
      include: { actor: { select: { id: true, displayName: true } } },
      orderBy: [{ createdAt: 'asc' }, { seq: 'asc' }],
    });
    // Noms résolus à la lecture : l'historique ne stocke que des identifiants (R5).
    const NAMED = [
      ['assigneeId', 'assigneeName'],
      ['userId', 'userName'],
      ['teacherId', 'teacherName'],
    ] as const;
    const ids = new Set<string>();
    for (const e of events) {
      for (const v of [e.fromValue, e.toValue]) {
        for (const [key] of NAMED) {
          const value = (v as Record<string, unknown> | null)?.[key];
          if (typeof value === 'string') ids.add(value);
        }
      }
    }
    const names = new Map(
      (await this.prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, displayName: true } })).map((u) => [
        u.id,
        u.displayName,
      ]),
    );
    const withName = (value: Prisma.JsonValue | null) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
      const named: Prisma.JsonObject = { ...value };
      for (const [key, nameKey] of NAMED) {
        const id = value[key];
        if (typeof id === 'string') named[nameKey] = names.get(id) ?? null;
      }
      return named;
    };
    return events.map((e) => ({
      id: e.id,
      type: e.type,
      actor: e.actor,
      fromValue: withName(e.fromValue),
      toValue: withName(e.toValue),
      comment: e.comment,
      createdAt: e.createdAt,
    }));
  }

  private async writeAvailability(actor: AuthenticatedUser, userId: string, before: string, after: string, ctx: RequestContext) {
    if (before === after) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { availability: after as 'AVAILABLE' } });
      await this.audit.log(
        'AVAILABILITY_CHANGED',
        { actorId: actor.id, ip: ctx.ip, targetType: 'User', targetId: userId, details: { before, after } },
        tx,
      );
    });
  }

  private async logDenied(user: AuthenticatedUser, id: string, ctx: RequestContext, reason: string): Promise<void> {
    await this.audit.log('ACCESS_DENIED', {
      actorId: user.id,
      targetType: 'Request',
      targetId: id.slice(0, 64),
      ip: ctx.ip,
      details: { reason, route: ctx.route, method: ctx.method, channel: 'http' },
    });
  }
}

/** Filtres communs (liste des admins, tableau du super administrateur, export). */
export function coverageFilters(query: ListCoverageQuery): Prisma.RequestWhereInput[] {
  const conditions: Prisma.RequestWhereInput[] = [];
  if (query.mainStatus?.length) conditions.push({ status: { in: query.mainStatus.flatMap((m) => [...MAIN_STATUS_VALUES[m]]) } });
  else if (query.status?.length) conditions.push({ status: { in: query.status } });
  else if (query.includeFinished !== 'true') conditions.push({ status: { notIn: [...FINAL_STATUSES] } });
  const coverage: Prisma.CoverageDetailWhereInput = {};
  if (query.source) coverage.source = query.source;
  if (query.type) coverage.type = query.type;
  if (query.floorId) coverage.floorId = query.floorId;
  if (query.classId) coverage.classId = query.classId;
  if (query.teacherId) coverage.teacherId = query.teacherId;
  if (query.from || query.to) {
    const startAt: Prisma.DateTimeFilter = {};
    if (query.from) startAt.gte = new Date(query.from);
    if (query.to) {
      const end = new Date(query.to);
      if (query.to.length === 10) end.setUTCDate(end.getUTCDate() + 1);
      if (query.to.length === 10) startAt.lt = end;
      else startAt.lte = end;
    }
    coverage.startAt = startAt;
  }
  if (Object.keys(coverage).length > 0) conditions.push({ coverage });
  if (query.assigneeId) conditions.push({ assigneeId: query.assigneeId });
  return conditions;
}
