import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import type { RequestContext } from '../requests/requests.service';
import { SettingsService } from '../settings/settings.service';
import { CoverageAccessLoader, type CoverageRulesSnapshot } from './coverage-access.loader';
import { CoverageActionsService, formatCoverageReference } from './coverage-actions.service';
import { availabilityFor, supervisorCandidates, type SupervisorCandidate } from './coverage-availability';
import { groupFlagsOf, supervisorIds, teacherIds } from './coverage-groups';
import type { CreateCoverageDto, ListCoverageQuery, OwnAvailabilityDto, SetAvailabilityDto } from './coverage.dto';
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
  coverageView,
  isCoverageAdmin,
  isEligibleAssignee,
  moduleCapabilities,
} from './domain/coverage-policy';
import { applyCoverageCreation, ACTIVE_GUARD_STATUSES } from './domain/coverage-state-machine';
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
  ) {}

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
  async history(user: AuthenticatedUser) {
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
    };
  }

  /** Un surveillant se déclare disponible ou indisponible (« Absent » est réservé aux admins). */
  async setOwnAvailability(user: AuthenticatedUser, dto: OwnAvailabilityDto, ctx: RequestContext) {
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
      { startAt: new Date(), plannedEndAt: null },
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
   * Page ouverte par le QR code : n'enregistre RIEN. Indique la classe et, si l'utilisateur est le
   * surveillant d'une affectation de cette classe, l'affectation concernée ; la présence se valide
   * ensuite par un POST explicite (action CONFIRM_PRESENCE) qui revérifie tout.
   */
  async resolveQr(user: AuthenticatedUser, token: string) {
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
    const ids = new Set<string>();
    for (const e of events) {
      for (const v of [e.fromValue, e.toValue]) {
        const assigneeId = (v as { assigneeId?: unknown } | null)?.assigneeId;
        if (typeof assigneeId === 'string') ids.add(assigneeId);
      }
    }
    const names = new Map(
      (await this.prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, displayName: true } })).map((u) => [
        u.id,
        u.displayName,
      ]),
    );
    const withName = (value: Prisma.JsonValue | null) => {
      const assigneeId = (value as { assigneeId?: unknown } | null)?.assigneeId;
      return typeof assigneeId === 'string' ? { ...(value as Prisma.JsonObject), assigneeName: names.get(assigneeId) ?? null } : value;
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
