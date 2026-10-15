import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { canCreateInCategory } from '../requests/domain/access-policy';
import { RequestPolicyLoader, toPolicyCategory } from '../requests/request-policy.loader';
import type { RequestContext } from '../requests/requests.service';
import { SettingsService } from '../settings/settings.service';
import { CoverageAccessLoader, type CoverageRulesSnapshot } from './coverage-access.loader';
import { CoverageActionsService, formatCoverageReference } from './coverage-actions.service';
import { availabilityFor, availableMembers, groupMemberIds, type UnavailableReason } from './coverage-availability';
import type { CreateCoverageDto, ListCoverageQuery, OwnAvailabilityDto, SetAvailabilityDto } from './coverage.dto';
import {
  COVERAGE_INCLUDE,
  toCoverageDetail,
  toCoverageSummary,
  toLimitedCoverage,
  type CoverageDetail,
  type CoverageSummary,
  type HistoryEntry,
  type LimitedCoverage,
  type PresenceView,
} from './coverage.mapper';
import { broadcastDeadline } from './domain/coverage-deadlines';
import {
  canReadPresenceProof,
  coverageAccess,
  coverageActionsFor,
  isCoverageManager,
  slotsOverlap,
} from './domain/coverage-policy';
import { ACTIVE_GUARD_STATUSES, OPEN_STATUSES } from './domain/coverage-state-machine';
import { verifyQrToken } from './domain/qr-token';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINUTE_MS = 60_000;
/** Heure de début acceptée : de 12 h dans le passé à 7 jours dans le futur. */
const MAX_PAST_MS = 12 * 60 * MINUTE_MS;
const MAX_FUTURE_MS = 7 * 24 * 60 * MINUTE_MS;

function fieldError(field: string, message: string): AppException {
  return new AppException('VALIDATION_ERROR', { fields: [{ field, messages: [message] }] }, message);
}

export interface EmployeeOption {
  id: string;
  displayName: string;
  jobTitle: string | null;
  inTargetGroup: boolean;
  available: boolean;
  reason: UnavailableReason | null;
}

@Injectable()
export class CoverageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: RequestPolicyLoader,
    private readonly access: CoverageAccessLoader,
    private readonly actions: CoverageActionsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Création (responsables)
  // ---------------------------------------------------------------------------

  /** Données du formulaire de création rapide ; `availableCount` alimente l'avertissement « groupe vide ». */
  async formOptions(user: AuthenticatedUser) {
    const categories = (await this.policies.categories({ active: true, kind: 'COVERAGE' })).filter((c) =>
      canCreateInCategory(user, toPolicyCategory(c)),
    );
    if (categories.length === 0) throw new AppException('FORBIDDEN');
    const [classes, groups] = await Promise.all([
      this.prisma.schoolClass.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, room: true } }),
      this.prisma.employeeGroup.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ]);
    const now = new Date();
    const counted = await Promise.all(
      groups.map(async (g) => ({
        ...g,
        memberCount: (await groupMemberIds(this.prisma, [g.id])).length,
        availableCount: (await availableMembers(this.prisma, [g.id], { startAt: now, plannedEndAt: null })).length,
      })),
    );
    return {
      categories: categories.map((c) => ({ id: c.id, name: c.name, proofMode: c.proofMode })),
      classes,
      groups: counted,
    };
  }

  async create(
    user: AuthenticatedUser,
    dto: CreateCoverageDto,
    ctx: RequestContext,
  ): Promise<{ created: boolean; detail: CoverageDetail; notifiedCount: number }> {
    const existing = await this.prisma.request.findUnique({
      where: { requesterId_clientId: { requesterId: user.id, clientId: dto.clientId } },
    });
    if (existing) return { created: false, detail: (await this.detail(user, existing.id, ctx)) as CoverageDetail, notifiedCount: 0 };

    const category = await this.policies.category(dto.categoryId);
    if (!category || category.kind !== 'COVERAGE') throw fieldError('categoryId', 'Catégorie de couverture introuvable.');
    if (!canCreateInCategory(user, toPolicyCategory(category))) {
      await this.logDenied(user, dto.categoryId, ctx, 'FORBIDDEN_COVERAGE_CREATE');
      throw new AppException('FORBIDDEN');
    }

    const schoolClass = await this.prisma.schoolClass.findUnique({ where: { id: dto.classId } });
    if (!schoolClass || !schoolClass.active) throw fieldError('classId', 'Classe introuvable ou désactivée.');
    const groups = await this.prisma.employeeGroup.findMany({ where: { id: { in: dto.groupIds }, active: true } });
    if (groups.length !== dto.groupIds.length) throw fieldError('groupIds', 'Un des groupes est introuvable ou désactivé.');

    if (dto.voiceFileId) {
      const voice = await this.prisma.file.findUnique({ where: { id: dto.voiceFileId } });
      if (!voice || voice.uploaderId !== user.id || voice.kind !== 'VOICE' || voice.requestId !== null) {
        throw fieldError('voiceFileId', 'Message vocal introuvable. Enregistrez-le de nouveau.');
      }
    }

    // Heures de référence : toujours celles du serveur.
    const now = new Date();
    const startAt = dto.startAt ? new Date(dto.startAt) : now;
    if (startAt.getTime() < now.getTime() - MAX_PAST_MS || startAt.getTime() > now.getTime() + MAX_FUTURE_MS) {
      throw fieldError('startAt', 'L’heure de début doit être comprise entre 12 h avant et 7 jours après maintenant.');
    }
    const plannedEndAt = dto.estimatedMinutes ? new Date(startAt.getTime() + dto.estimatedMinutes * MINUTE_MS) : null;
    const priority = dto.priority ?? 'URGENT';
    const rule = await this.prisma.deadlineRule.findUnique({
      where: { categoryId_priority: { categoryId: category.id, priority } },
    });
    const rules: CoverageRulesSnapshot = {
      kind: 'COVERAGE',
      proofMode: category.proofMode,
      finalValidation: category.finalValidation,
      takeoverMinutes: rule?.takeoverMinutes ?? null,
      arrivalMinutes: rule?.arrivalMinutes ?? null,
    };
    const deadline = broadcastDeadline(rules, now, await this.settings.get('deadlineWarnPercent'));

    try {
      const { id, notifiedCount } = await this.actions.run(async (tx, effects) => {
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
            status: 'BROADCAST',
            rulesSnapshot: rules as unknown as Prisma.InputJsonValue,
            createdAt: now,
            submittedAt: now,
            ...deadline,
            coverage: {
              create: {
                classId: schoolClass.id,
                absentTeacher: dto.absentTeacher ?? null,
                startAt,
                estimatedMinutes: dto.estimatedMinutes ?? null,
                plannedEndAt,
                broadcastAt: now,
                targets: { create: dto.groupIds.map((groupId) => ({ groupId })) },
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
            toValue: { title: request.title, priority, classId: schoolClass.id, groupIds: dto.groupIds },
          },
        });
        await tx.requestEvent.create({
          data: { requestId: request.id, actorId: user.id, type: 'STATUS_CHANGED', fromValue: Prisma.JsonNull, toValue: { status: 'BROADCAST' } },
        });
        const notifiedCount = await this.actions.broadcastInTx(tx, request.id, user.id, effects);
        return { id: request.id, notifiedCount };
      });
      return { created: true, detail: (await this.detail(user, id, ctx)) as CoverageDetail, notifiedCount };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.request.findUnique({
          where: { requesterId_clientId: { requesterId: user.id, clientId: dto.clientId } },
        });
        if (duplicate) return { created: false, detail: (await this.detail(user, duplicate.id, ctx)) as CoverageDetail, notifiedCount: 0 };
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Employé
  // ---------------------------------------------------------------------------

  /** « À prendre » : couvertures diffusées ou non pourvues des groupes de l'employé. */
  async open(user: AuthenticatedUser) {
    const rows = await this.prisma.request.findMany({
      where: {
        kind: 'COVERAGE',
        status: { in: [...OPEN_STATUSES] },
        assigneeId: null,
        coverage: { targets: { some: { group: { active: true, members: { some: { userId: user.id } } } } } },
      },
      include: COVERAGE_INCLUDE,
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 100,
    });
    const me = await this.myAvailability(user);
    return {
      availability: me,
      items: rows.map((row) => ({
        ...toCoverageSummary(row),
        // Disponibilité pour ce créneau : le bouton « Je prends » est désactivé avec la raison.
        canAccept: me.availability === 'AVAILABLE' && !me.activeGuards.some((g) => slotsOverlap(g, row.coverage!)),
      })),
    };
  }

  /** Gardes en cours de l'employé (« Ma garde »). */
  async mine(user: AuthenticatedUser, ctx: RequestContext) {
    const rows = await this.prisma.request.findMany({
      where: { kind: 'COVERAGE', assigneeId: user.id, status: { in: [...ACTIVE_GUARD_STATUSES, 'DONE'] } },
      select: { id: true },
      orderBy: { acceptedAt: 'desc' },
      take: 10,
    });
    const items: CoverageDetail[] = [];
    for (const r of rows) items.push((await this.detail(user, r.id, ctx)) as CoverageDetail);
    return { availability: await this.myAvailability(user), items };
  }

  /** Historique personnel : gardes effectuées ou annulées, et désistements. */
  async history(user: AuthenticatedUser) {
    const [rows, releases] = await Promise.all([
      this.prisma.request.findMany({
        where: { kind: 'COVERAGE', assigneeId: user.id, status: { in: ['DONE', 'CLOSED', 'CANCELLED'] } },
        include: COVERAGE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.requestEvent.findMany({
        where: { type: 'RELEASED', request: { kind: 'COVERAGE' }, fromValue: { path: ['assigneeId'], equals: user.id } },
        select: {
          id: true,
          createdAt: true,
          comment: true,
          toValue: true,
          request: { select: { id: true, reference: true, coverage: { select: { class: { select: { name: true, room: true } } } } } },
        },
        orderBy: [{ createdAt: 'desc' }, { seq: 'desc' }],
        take: 100,
      }),
    ]);
    return {
      guards: rows.map(toCoverageSummary),
      releases: releases.map((e) => ({
        id: e.id,
        requestId: e.request.id,
        reference: e.request.reference,
        class: e.request.coverage?.class ?? null,
        at: e.createdAt,
        reason: e.comment,
        byManager: Boolean((e.toValue as { byManager?: boolean } | null)?.byManager),
      })),
    };
  }

  async myAvailability(user: AuthenticatedUser) {
    const [me, guards] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { availability: true } }),
      this.prisma.request.findMany({
        where: { kind: 'COVERAGE', assigneeId: user.id, status: { in: [...ACTIVE_GUARD_STATUSES] } },
        select: { id: true, coverage: { select: { startAt: true, plannedEndAt: true } } },
      }),
    ]);
    const inGroup = (await this.prisma.employeeGroupMember.count({ where: { userId: user.id, group: { active: true } } })) > 0;
    return {
      availability: me.availability,
      activeGuards: guards.map((g) => ({ requestId: g.id, startAt: g.coverage!.startAt, plannedEndAt: g.coverage!.plannedEndAt })),
      /** Membre d'un groupe de remplacement (onglets employé). */
      inGroup,
      /** Responsable d'une catégorie de couverture ou super administrateur (écrans de gestion). */
      canManage: await this.isCoverageManagerUser(user),
    };
  }

  /** Un employé se déclare disponible ou indisponible (« Absent » est réservé aux responsables). */
  async setOwnAvailability(user: AuthenticatedUser, dto: OwnAvailabilityDto, ctx: RequestContext) {
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { availability: true } });
    if (current.availability === 'ABSENT') {
      throw new AppException('FORBIDDEN', undefined, 'Vous êtes déclaré absent : seul un responsable peut modifier ce statut.');
    }
    await this.writeAvailability(user, user.id, current.availability, dto.availability, ctx);
    return this.myAvailability(user);
  }

  /** Responsable / super administrateur : disponibilité d'un employé, y compris « Absent ». */
  async setAvailability(user: AuthenticatedUser, userId: string, dto: SetAvailabilityDto, ctx: RequestContext) {
    await this.assertCoverageManager(user, ctx);
    const target = UUID.test(userId)
      ? await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, availability: true, active: true } })
      : null;
    if (!target || !target.active) throw new AppException('NOT_FOUND');
    await this.writeAvailability(user, target.id, target.availability, dto.availability, ctx);
    return { userId: target.id, availability: dto.availability };
  }

  /** Équipe : employés des groupes, avec disponibilité et garde en cours (responsables). */
  async team(user: AuthenticatedUser, ctx: RequestContext) {
    await this.assertCoverageManager(user, ctx);
    const members = await this.prisma.user.findMany({
      where: { active: true, groupMemberships: { some: { group: { active: true } } } },
      select: { id: true, displayName: true, jobTitle: true, groupMemberships: { select: { group: { select: { id: true, name: true } } } } },
      orderBy: { displayName: 'asc' },
    });
    const availability = await availabilityFor(
      this.prisma,
      members.map((m) => m.id),
      { startAt: new Date(), plannedEndAt: null },
    );
    return members.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      jobTitle: m.jobTitle,
      groups: m.groupMemberships.map((g) => g.group),
      availability: availability.get(m.id)?.availability ?? 'AVAILABLE',
      available: availability.get(m.id)?.available ?? false,
      reason: availability.get(m.id)?.reason ?? null,
      guardRequestId: availability.get(m.id)?.guardRequestId ?? null,
    }));
  }

  // ---------------------------------------------------------------------------
  // Lecture
  // ---------------------------------------------------------------------------

  async detail(user: AuthenticatedUser, id: string, ctx: RequestContext): Promise<CoverageDetail | LimitedCoverage> {
    const row = await this.actions.load(this.prisma, id);
    const facts = row && (await this.access.facts(row, user.id));
    const access = facts ? coverageAccess(user, facts) : 'none';
    if (!row || !facts || access === 'none') {
      await this.logDenied(user, id, ctx, 'NOT_VISIBLE');
      throw new AppException('NOT_FOUND');
    }
    if (access === 'limited') return toLimitedCoverage(row);

    const manager = isCoverageManager(user, facts);
    const presences = await this.prisma.coveragePresence.findMany({
      where: { requestId: row.id },
      include: { user: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const presenceViews: PresenceView[] = presences.map((p) => ({
      method: p.method,
      at: p.createdAt,
      by: p.user,
      fileId: p.fileId && canReadPresenceProof(user, facts, p.userId) ? p.fileId : null,
    }));
    const isParticipant = manager || row.assigneeId === user.id;
    return toCoverageDetail(row, {
      allowedActions: coverageActionsFor(user, facts),
      isManager: manager,
      presences: isParticipant ? presenceViews : [],
      history: isParticipant ? await this.historyOf(row.id) : null,
    });
  }

  /** Liste des couvertures gérées (responsables : leurs catégories ; super administrateur : toutes). */
  async list(user: AuthenticatedUser, query: ListCoverageQuery, ctx: RequestContext): Promise<CoverageSummary[]> {
    await this.assertCoverageManager(user, ctx);
    const rows = await this.prisma.request.findMany({
      where: { AND: [this.managedWhere(user), ...coverageFilters(query)] },
      include: COVERAGE_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 300,
    });
    return rows.map(toCoverageSummary);
  }

  /** Employés à qui un responsable peut confier la garde, avec leur disponibilité. */
  async candidates(user: AuthenticatedUser, id: string, ctx: RequestContext): Promise<EmployeeOption[]> {
    const row = await this.actions.load(this.prisma, id);
    const facts = row && (await this.access.facts(row, user.id));
    if (!row || !facts || !isCoverageManager(user, facts)) {
      await this.logDenied(user, id, ctx, 'FORBIDDEN_CANDIDATES');
      throw new AppException('NOT_FOUND');
    }
    const groupIds = row.coverage!.targets.map((t) => t.groupId);
    const inGroups = new Set(await groupMemberIds(this.prisma, groupIds));
    const employees = await this.prisma.user.findMany({
      where: { active: true, role: 'EMPLOYEE', id: row.assigneeId ? { not: row.assigneeId } : undefined },
      select: { id: true, displayName: true, jobTitle: true },
      orderBy: { displayName: 'asc' },
    });
    const availability = await availabilityFor(
      this.prisma,
      employees.map((e) => e.id),
      { startAt: row.coverage!.startAt, plannedEndAt: row.coverage!.plannedEndAt },
      row.id,
    );
    return employees
      .map((e) => ({
        ...e,
        inTargetGroup: inGroups.has(e.id),
        available: availability.get(e.id)?.available ?? false,
        reason: availability.get(e.id)?.reason ?? null,
      }))
      .sort((a, b) => Number(b.inTargetGroup) - Number(a.inTargetGroup) || Number(b.available) - Number(a.available));
  }

  /**
   * Page ouverte par le QR code : n'enregistre RIEN. Indique la classe et, si l'utilisateur est le
   * preneur d'une garde de cette classe, la garde concernée ; la présence se valide ensuite par un
   * POST explicite (action CONFIRM_PRESENCE) qui revérifie tout.
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
      /** Une garde en cours concerne une autre classe : le QR sera refusé. */
      otherClassGuard: !match && guards.length > 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Outils
  // ---------------------------------------------------------------------------

  /** Responsable d'au moins une catégorie de couverture, ou super administrateur. */
  async isCoverageManagerUser(user: AuthenticatedUser): Promise<boolean> {
    if (!user.active) return false;
    if (user.role === 'SUPER_ADMIN') return true;
    if (user.role !== 'MANAGER') return false;
    return (await this.prisma.categoryManager.count({ where: { userId: user.id, category: { kind: 'COVERAGE' } } })) > 0;
  }

  private async assertCoverageManager(user: AuthenticatedUser, ctx: RequestContext): Promise<void> {
    if (await this.isCoverageManagerUser(user)) return;
    await this.logDenied(user, 'coverage', ctx, 'NOT_COVERAGE_MANAGER');
    throw new AppException('FORBIDDEN');
  }

  managedWhere(user: AuthenticatedUser): Prisma.RequestWhereInput {
    if (user.role === 'SUPER_ADMIN') return { kind: 'COVERAGE' };
    return {
      kind: 'COVERAGE',
      OR: [{ requesterId: user.id }, { category: { managers: { some: { userId: user.id } } } }],
    };
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
      (await this.prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, displayName: true } })).map(
        (u) => [u.id, u.displayName],
      ),
    );
    const withName = (value: Prisma.JsonValue | null) => {
      const assigneeId = (value as { assigneeId?: unknown } | null)?.assigneeId;
      return typeof assigneeId === 'string'
        ? { ...(value as Prisma.JsonObject), assigneeName: names.get(assigneeId) ?? null }
        : value;
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

  private async writeAvailability(
    actor: AuthenticatedUser,
    userId: string,
    before: string,
    after: string,
    ctx: RequestContext,
  ): Promise<void> {
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

/** Filtres communs (liste des responsables, tableau du super administrateur, export). */
export function coverageFilters(query: ListCoverageQuery): Prisma.RequestWhereInput[] {
  const conditions: Prisma.RequestWhereInput[] = [];
  if (query.status?.length) conditions.push({ status: { in: query.status } });
  else if (query.includeFinished !== 'true') conditions.push({ status: { notIn: ['CLOSED', 'CANCELLED'] } });
  if (query.classId) conditions.push({ coverage: { classId: query.classId } });
  if (query.groupId) conditions.push({ coverage: { targets: { some: { groupId: query.groupId } } } });
  if (query.assigneeId) conditions.push({ assigneeId: query.assigneeId });
  if (query.from) conditions.push({ createdAt: { gte: new Date(query.from) } });
  if (query.to) {
    const end = new Date(query.to);
    if (query.to.length === 10) end.setUTCDate(end.getUTCDate() + 1);
    conditions.push({ createdAt: query.to.length === 10 ? { lt: end } : { lte: end } });
  }
  return conditions;
}

