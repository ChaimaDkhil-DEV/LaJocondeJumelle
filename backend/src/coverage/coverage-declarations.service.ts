import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type RequestStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { endOfLocalDay } from '../common/school-time';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import type { RequestContext } from '../requests/requests.service';
import { CoverageAccessLoader, type CoverageRulesSnapshot } from './coverage-access.loader';
import { CoverageActionsService, formatCoverageReference, type Effects, type Tx } from './coverage-actions.service';
import { availabilityFor } from './coverage-availability';
import { adminRecipients, groupFlagsOf } from './coverage-groups';
import type { EmptyClassDto, ListMergeProposalsQuery, MergeDecisionDto } from './coverage.dto';
import { COVERAGE_INCLUDE, toCoverageSummary, type CoverageDetail, type CoverageRow } from './coverage.mapper';
import { CoverageService } from './coverage.service';
import { resolveDeclaration, type DeclarationOutcome } from './domain/coverage-duplicates';
import { isCoverageAdmin, moduleCapabilities } from './domain/coverage-policy';
import { ACTIVE_GUARD_STATUSES } from './domain/coverage-state-machine';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Affectations non finales prises en compte pour le rattachement (data-model §6). */
const OPEN_STATUSES: readonly RequestStatus[] = ['PENDING', ...ACTIVE_GUARD_STATUSES];
const ON_SITE: readonly RequestStatus[] = ['ON_DUTY', 'RELIEF_PENDING'];

export interface DeclarationResult {
  outcome: DeclarationOutcome;
  /** Vue surveillant de l'affectation créée ou rejointe ; null si rien n'a été modifié (ALREADY_ASSIGNED). */
  coverage: CoverageDetail | null;
  /** Surveillant responsable de la classe. */
  assignedTo: { id: string; displayName: string } | null;
  /** Le déclarant avait déjà une affectation active ou un renfort sur ce créneau (FR-015j). */
  doubleAssignment: boolean;
}

function fieldError(field: string, message: string): AppException {
  return new AppException('VALIDATION_ERROR', { fields: [{ field, messages: [message] }] }, message);
}

/**
 * Classe vide déclarée par un surveillant pendant son tour (US2, FR-015 à FR-015j) et propositions
 * de rattachement à décider par l'admin (FR-015g, FR-015h, R6).
 */
@Injectable()
export class CoverageDeclarationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CoverageAccessLoader,
    private readonly actions: CoverageActionsService,
    private readonly coverage: CoverageService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ---------------------------------------------------------------------------
  // Déclaration
  // ---------------------------------------------------------------------------

  async declareEmptyClass(user: AuthenticatedUser, dto: EmptyClassDto, ctx: RequestContext): Promise<{ created: boolean; result: DeclarationResult }> {
    if (!moduleCapabilities(await this.access.viewer(user)).declareEmptyClass) {
      await this.logDenied(user, 'coverage', ctx, 'NOT_SUPERVISOR');
      throw new AppException('NOT_FOUND');
    }
    const replay = await this.replay(user, dto.clientId, ctx);
    if (replay) return { created: false, result: replay };

    const teacherId = dto.teacherId ?? null;
    if (teacherId !== null) {
      const teacher = await this.prisma.user.findUnique({ where: { id: teacherId }, select: { active: true } });
      const flags = teacher ? await groupFlagsOf(this.prisma, teacherId) : null;
      if (!teacher || !flags?.isTeacher) throw fieldError('teacherId', 'Cet enseignant n’appartient pas au groupe Enseignants.');
    }
    const schoolClass = await this.prisma.schoolClass.findUnique({ where: { id: dto.classId } });
    if (!schoolClass || !schoolClass.active) throw new AppException('CLASS_INACTIVE');
    if (dto.qrToken !== undefined) await this.actions.verifyQr(dto.qrToken, schoolClass.id);
    const category = await this.prisma.category.findFirst({ where: { kind: 'COVERAGE', active: true }, orderBy: { createdAt: 'asc' } });
    if (!category) throw new AppException('NOT_FOUND', undefined, 'Catégorie de garde introuvable ou désactivée.');
    const rule = await this.prisma.deadlineRule.findUnique({ where: { categoryId_priority: { categoryId: category.id, priority: 'URGENT' } } });
    const rules: CoverageRulesSnapshot = {
      kind: 'COVERAGE',
      proofMode: category.proofMode,
      finalValidation: category.finalValidation,
      takeoverMinutes: rule?.takeoverMinutes ?? null,
      arrivalMinutes: rule?.arrivalMinutes ?? null,
    };
    const now = new Date();
    const qr = dto.qrToken !== undefined;

    let outcome: DeclarationOutcome;
    let coverageId: string | null;
    let doubleAssignment = false;
    let assignedTo: DeclarationResult['assignedTo'] = null;
    try {
      ({ outcome, coverageId, doubleAssignment, assignedTo } = await this.actions.run(async (tx, effects) => {
        // Une déclaration à la fois par classe : deux surveillants qui déclarent ensemble ne créent pas de doublon.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`coverage-class:${schoolClass.id}`}))`;
        const existing = await tx.request.findMany({
          where: { kind: 'COVERAGE', status: { in: [...OPEN_STATUSES] }, coverage: { classId: schoolClass.id, mergedIntoId: null } },
          select: {
            id: true,
            status: true,
            assigneeId: true,
            assignee: { select: { id: true, displayName: true } },
            coverage: { select: { teacherId: true, startAt: true, plannedEndAt: true } },
          },
        });
        const resolution = resolveDeclaration(
          { teacherId, window: { startAt: now, plannedEndAt: endOfLocalDay(now, this.config.schoolTimezone) } },
          existing.map((r) => ({ id: r.id, status: r.status, ...r.coverage! })),
        );
        const target = resolution.outcome === 'CREATED' ? null : existing.find((r) => r.id === resolution.targetId)!;
        const admins = await adminRecipients(tx);

        if (resolution.outcome === 'ALREADY_ASSIGNED') {
          // Rien n'est modifié : le surveillant assigné reste responsable, l'admin décide (FR-015e).
          const row = (await this.actions.load(tx, target!.id))!;
          await this.actions.notify(tx, effects, admins, user.id, 'COVERAGE_DUPLICATE', row.id, row.priority);
          return { outcome: resolution.outcome, coverageId: null, doubleAssignment: false, assignedTo: target!.assignee };
        }

        if (resolution.outcome === 'ATTACHED') {
          const busy = await this.busy(tx, user.id, target!.coverage!, target!.id);
          const ok = await this.actions.performSystemInTx(tx, target!.id, 'ATTACH_DECLARATION', effects, { now, assigneeId: user.id, actorId: user.id });
          if (!ok) throw new AppException('STATE_CHANGED');
          await this.recordDeclaration(tx, target!.id, user.id, dto.clientId, 'ATTACHED', 'UPDATED', {});
          if (qr) await this.recordQrPresence(tx, target!.id, user.id, now);
          const row = (await this.actions.load(tx, target!.id))!;
          await this.actions.notify(tx, effects, admins, user.id, 'COVERAGE_DUPLICATE', row.id, row.priority);
          if (busy) await this.actions.notify(tx, effects, admins, user.id, 'COVERAGE_DOUBLE_ASSIGNMENT', row.id, 'URGENT');
          return { outcome: resolution.outcome, coverageId: row.id, doubleAssignment: busy, assignedTo: row.assignee && { id: row.assignee.id, displayName: row.assignee.displayName } };
        }

        if (resolution.outcome === 'SUPPORT') {
          const row = (await this.actions.load(tx, target!.id))!;
          const responsible = row.assignee && { id: row.assignee.id, displayName: row.assignee.displayName };
          // Déjà responsable ou déjà en renfort de cette classe : rien de plus.
          if (row.assigneeId === user.id || row.supports.some((s) => s.user.id === user.id)) {
            return { outcome: resolution.outcome, coverageId: row.id, doubleAssignment: false, assignedTo: responsible };
          }
          const busy = await this.busy(tx, user.id, row.coverage!, row.id);
          const support = await tx.coverageSupport.create({ data: { requestId: row.id, userId: user.id, joinedAt: now } });
          await tx.request.update({ where: { id: row.id }, data: { version: { increment: 1 } } });
          await this.recordDeclaration(tx, row.id, user.id, dto.clientId, 'SUPPORT', 'SUPPORT_JOINED', { supportId: support.id, userId: user.id });
          if (qr) await this.recordQrPresence(tx, row.id, user.id, now);
          await this.actions.applyReminders(
            tx,
            row,
            { type: 'SUPPORT_JOINED', supportId: support.id },
            { status: row.status, source: row.coverage!.source, startAt: row.coverage!.startAt, plannedEndAt: row.coverage!.plannedEndAt, assigneeId: row.assigneeId },
            now,
          );
          await this.actions.notify(tx, effects, admins, user.id, 'COVERAGE_DUPLICATE', row.id, row.priority);
          if (busy) await this.actions.notify(tx, effects, admins, user.id, 'COVERAGE_DOUBLE_ASSIGNMENT', row.id, 'URGENT');
          await this.actions.pushUpdate(tx, row, row.status, row.version + 1, effects, [row.assigneeId, user.id]);
          return { outcome: resolution.outcome, coverageId: row.id, doubleAssignment: busy, assignedTo: responsible };
        }

        // CREATED ou MERGE_PROPOSED : nouvelle affectation « en cours » au nom du déclarant (FR-015).
        const busy = await this.busy(tx, user.id, { startAt: now, plannedEndAt: null });
        const [{ n }] = await tx.$queryRaw<Array<{ n: number }>>`
          SELECT nextval(pg_get_serial_sequence('"Request"', 'number'))::int AS n`;
        const created = await tx.request.create({
          data: {
            kind: 'COVERAGE',
            number: n,
            reference: formatCoverageReference(n, now),
            clientId: dto.clientId,
            title: `Classe vide — ${schoolClass.name}`.slice(0, 120),
            categoryId: category.id,
            priority: 'URGENT',
            requesterId: user.id,
            assigneeId: user.id,
            status: 'ON_DUTY',
            rulesSnapshot: rules as unknown as Prisma.InputJsonValue,
            createdAt: now,
            submittedAt: now,
            assignedAt: now,
            acceptedAt: now,
            coverage: {
              create: {
                classId: schoolClass.id,
                floorId: schoolClass.floorId,
                source: 'SUPERVISOR_REPORT',
                type: 'EMPTY_CLASS',
                teacherId,
                startAt: now,
                plannedEndAt: null,
                presenceAt: now,
              },
            },
          },
        });
        const event = (type: Prisma.RequestEventCreateManyInput['type'], extra: Partial<Prisma.RequestEventCreateManyInput>) =>
          tx.requestEvent.create({ data: { requestId: created.id, actorId: user.id, type, ...extra } });
        await event('CREATED', { toValue: { source: 'SUPERVISOR_REPORT', type: 'EMPTY_CLASS', classId: schoolClass.id, doubleAssignment: busy } });
        await event('STATUS_CHANGED', { fromValue: Prisma.JsonNull, toValue: { status: 'ON_DUTY' } });
        await event('ASSIGNED', { toValue: { assigneeId: user.id } });
        if (qr) await this.recordQrPresence(tx, created.id, user.id, now);
        await this.actions.applyReminders(
          tx,
          created,
          { type: 'CREATED' },
          { status: 'ON_DUTY', source: 'SUPERVISOR_REPORT', startAt: now, plannedEndAt: null, assigneeId: user.id },
          now,
        );
        await this.actions.notify(tx, effects, admins, user.id, 'COVERAGE_EMPTY_CLASS', created.id, 'URGENT');
        if (busy) await this.actions.notify(tx, effects, admins, user.id, 'COVERAGE_DOUBLE_ASSIGNMENT', created.id, 'URGENT');

        if (resolution.outcome === 'MERGE_PROPOSED') {
          // Sans enseignant précisé, pas de rattachement automatique : l'admin confirme ou refuse (FR-015g).
          const proposal = await tx.coverageMergeProposal.create({
            data: { sourceRequestId: created.id, targetRequestId: target!.id, createdAt: now },
          });
          await event('MERGE_PROPOSED', { toValue: { proposalId: proposal.id, targetRequestId: target!.id } });
          await tx.requestEvent.create({
            data: { requestId: target!.id, actorId: user.id, type: 'MERGE_PROPOSED', toValue: { proposalId: proposal.id, sourceRequestId: created.id } },
          });
          const targetRow = (await this.actions.load(tx, target!.id))!;
          await this.actions.notify(tx, effects, admins, user.id, 'COVERAGE_DUPLICATE', targetRow.id, targetRow.priority);
          await this.actions.pushUpdate(tx, targetRow, targetRow.status, targetRow.version, effects, [targetRow.assigneeId]);
        }
        const row = (await this.actions.load(tx, created.id))!;
        await this.actions.pushUpdate(tx, row, 'ON_DUTY', row.version, effects, [user.id]);
        return { outcome: resolution.outcome, coverageId: created.id, doubleAssignment: busy, assignedTo: { id: user.id, displayName: row.assignee!.displayName } };
      }));
    } catch (error) {
      // Renvoi simultané du même clientId : la première déclaration fait foi.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const again = await this.replay(user, dto.clientId, ctx);
        if (again) return { created: false, result: again };
      }
      throw error;
    }
    return {
      created: true,
      result: { outcome, coverage: coverageId ? await this.coverage.detail(user, coverageId, ctx) : null, assignedTo, doubleAssignment },
    };
  }

  /** Membres du groupe Enseignants, pour le surveillant qui déclare et pour l'admin. */
  async teachers(user: AuthenticatedUser, ctx: RequestContext) {
    const capabilities = moduleCapabilities(await this.access.viewer(user));
    if (!capabilities.declareEmptyClass && !capabilities.manage) {
      await this.logDenied(user, 'coverage', ctx, 'NOT_IN_MODULE');
      throw new AppException('NOT_FOUND');
    }
    return this.coverage.teachers();
  }

  /** Renvoi d'une déclaration déjà traitée (même clientId) : même réponse, rien de recréé. */
  private async replay(user: AuthenticatedUser, clientId: string, ctx: RequestContext): Promise<DeclarationResult | null> {
    const own = await this.prisma.request.findUnique({
      where: { requesterId_clientId: { requesterId: user.id, clientId } },
      include: { mergeSources: { select: { id: true } }, events: { where: { type: 'CREATED' }, select: { toValue: true }, take: 1 } },
    });
    if (own) {
      const detail = await this.coverage.detail(user, own.id, ctx);
      const created = own.events[0]?.toValue as { doubleAssignment?: boolean } | undefined;
      return {
        outcome: own.mergeSources.length > 0 ? 'MERGE_PROPOSED' : 'CREATED',
        coverage: detail,
        assignedTo: detail.assignee,
        doubleAssignment: Boolean(created?.doubleAssignment),
      };
    }
    const marker = await this.prisma.requestEvent.findFirst({
      where: { actorId: user.id, toValue: { path: ['declarationClientId'], equals: clientId } },
      select: { requestId: true, toValue: true },
    });
    if (!marker) return null;
    const detail = await this.coverage.detail(user, marker.requestId, ctx);
    const value = marker.toValue as { outcome: DeclarationOutcome; doubleAssignment?: boolean };
    return { outcome: value.outcome, coverage: detail, assignedTo: detail.assignee, doubleAssignment: Boolean(value.doubleAssignment) };
  }

  /** Trace de la déclaration sur l'affectation rejointe ; porte le clientId pour un renvoi idempotent. */
  private async recordDeclaration(
    tx: Tx,
    requestId: string,
    userId: string,
    clientId: string,
    outcome: DeclarationOutcome,
    type: 'UPDATED' | 'SUPPORT_JOINED',
    extra: Record<string, string>,
  ): Promise<void> {
    await tx.requestEvent.create({
      data: { requestId, actorId: userId, type, toValue: { ...extra, declaration: true, outcome, declarationClientId: clientId } },
    });
  }

  /** QR scanné à la déclaration : présence du déclarant (R10). */
  private async recordQrPresence(tx: Tx, requestId: string, userId: string, now: Date): Promise<void> {
    await tx.coveragePresence.create({ data: { requestId, userId, method: 'QR', createdAt: now } });
    await tx.requestEvent.create({ data: { requestId, actorId: userId, type: 'PRESENCE_CONFIRMED', toValue: { methods: ['QR'] } } });
  }

  /** Le déclarant a déjà une affectation active ou un renfort qui chevauche ce créneau (FR-015j). */
  private async busy(tx: Tx, userId: string, slot: { startAt: Date; plannedEndAt: Date | null }, excludeRequestId?: string): Promise<boolean> {
    const availability = (await availabilityFor(tx, [userId], slot, excludeRequestId)).get(userId);
    return availability?.reason === 'ON_GUARD' || availability?.reason === 'SUPPORT';
  }

  // ---------------------------------------------------------------------------
  // Propositions de rattachement (FR-015g, FR-015h)
  // ---------------------------------------------------------------------------

  async mergeProposals(user: AuthenticatedUser, query: ListMergeProposalsQuery, ctx: RequestContext) {
    await this.assertAdmin(user, ctx);
    const rows = await this.prisma.coverageMergeProposal.findMany({
      where: query.status ? { status: query.status } : {},
      include: { source: { include: COVERAGE_INCLUDE }, target: { include: COVERAGE_INCLUDE } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((p) => this.toProposal(p, p.source, p.target));
  }

  /** Décision de l'admin, à tout moment, y compris après coup (FR-015h) ; une seule décision par proposition. */
  async decideMerge(user: AuthenticatedUser, id: string, dto: MergeDecisionDto, ctx: RequestContext) {
    await this.assertAdmin(user, ctx);
    const proposal = UUID.test(id) ? await this.prisma.coverageMergeProposal.findUnique({ where: { id } }) : null;
    if (!proposal) throw new AppException('NOT_FOUND');
    const now = new Date();
    const status = dto.decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED';

    await this.actions.run(async (tx, effects) => {
      const { count } = await tx.coverageMergeProposal.updateMany({
        where: { id: proposal.id, status: 'PENDING' },
        data: { status, decidedAt: now, decidedById: user.id },
      });
      if (count === 0) throw new AppException('STATE_CHANGED');
      const source = (await this.actions.load(tx, proposal.sourceRequestId))!;
      const target = (await this.actions.load(tx, proposal.targetRequestId))!;
      const afterTheFact = proposal.finalPresentedAt !== null || !OPEN_STATUSES.includes(source.status);

      if (dto.decision === 'CONFIRM') {
        await tx.coverageDetail.update({ where: { requestId: source.id }, data: { mergedIntoId: target.id } });
        // Affectation absorbée encore active : annulée, le déclarant est reporté sur la demande conservée (R6).
        const declarerId = OPEN_STATUSES.includes(source.status) ? source.assigneeId : null;
        if (OPEN_STATUSES.includes(source.status)) {
          await this.actions.performSystemInTx(tx, source.id, 'CANCEL', effects, {
            now,
            actorId: user.id,
            reason: `Rattachée à ${target.reference}.`,
          });
        }
        if (declarerId) await this.carryOver(tx, target, declarerId, user.id, now, effects);
      }
      for (const requestId of [source.id, target.id]) {
        await tx.requestEvent.create({
          data: { requestId, actorId: user.id, type: 'MERGE_DECIDED', toValue: { proposalId: proposal.id, decision: dto.decision } },
        });
      }
      await this.audit.log(
        'COVERAGE_MERGE_DECIDED',
        {
          actorId: user.id,
          ip: ctx.ip,
          targetType: 'CoverageMergeProposal',
          targetId: proposal.id,
          details: { decision: dto.decision, sourceRequestId: source.id, targetRequestId: target.id, afterTheFact },
        },
        tx,
      );
      for (const id of [source.id, target.id]) {
        const row = (await this.actions.load(tx, id))!;
        await this.actions.pushUpdate(tx, row, row.status, row.version, effects, [row.assigneeId]);
      }
    });

    const decided = await this.prisma.coverageMergeProposal.findUniqueOrThrow({
      where: { id: proposal.id },
      include: { source: { include: COVERAGE_INCLUDE }, target: { include: COVERAGE_INCLUDE } },
    });
    return this.toProposal(decided, decided.source, decided.target);
  }

  /** Déclarant reporté sur la demande conservée : prise en charge si « en attente », renfort si sur place (FR-015d, FR-015f). */
  private async carryOver(tx: Tx, target: CoverageRow, declarerId: string, actorId: string, now: Date, effects: Effects): Promise<void> {
    const current = (await this.actions.load(tx, target.id))!;
    if (current.status === 'PENDING') {
      await this.actions.performSystemInTx(tx, current.id, 'ATTACH_DECLARATION', effects, { now, assigneeId: declarerId, actorId });
      return;
    }
    if (!ON_SITE.includes(current.status) || current.assigneeId === declarerId || current.supports.some((s) => s.user.id === declarerId)) return;
    const support = await tx.coverageSupport.create({ data: { requestId: current.id, userId: declarerId, joinedAt: now } });
    await tx.request.update({ where: { id: current.id }, data: { version: { increment: 1 } } });
    await tx.requestEvent.create({
      data: { requestId: current.id, actorId, type: 'SUPPORT_JOINED', toValue: { supportId: support.id, userId: declarerId } },
    });
    const c = current.coverage!;
    await this.actions.applyReminders(
      tx,
      current,
      { type: 'SUPPORT_JOINED', supportId: support.id },
      { status: current.status, source: c.source, startAt: c.startAt, plannedEndAt: c.plannedEndAt, assigneeId: current.assigneeId },
      now,
    );
  }

  private toProposal(
    p: { id: string; status: string; createdAt: Date; decidedAt: Date | null; finalPresentedAt: Date | null },
    source: CoverageRow,
    target: CoverageRow,
  ) {
    return {
      id: p.id,
      status: p.status,
      createdAt: p.createdAt,
      decidedAt: p.decidedAt,
      finalPresentedAt: p.finalPresentedAt,
      /** « Non tranché » : sans décision après la dernière présentation (FR-015h). */
      unresolved: p.status === 'PENDING' && p.finalPresentedAt !== null,
      source: toCoverageSummary(source),
      target: toCoverageSummary(target),
    };
  }

  // ---------------------------------------------------------------------------
  // Outils
  // ---------------------------------------------------------------------------

  private async assertAdmin(user: AuthenticatedUser, ctx: RequestContext): Promise<void> {
    if (isCoverageAdmin(user)) return;
    await this.logDenied(user, 'merge-proposals', ctx, 'NOT_COVERAGE_ADMIN');
    throw new AppException('NOT_FOUND');
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
