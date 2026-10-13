import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type Notification, type NotificationType, type Priority } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { DeadlineState } from '../requests/domain/deadlines';
import type { RequestContext } from '../requests/requests.service';
import { SettingsService } from '../settings/settings.service';
import { CoverageAccessLoader, readCoverageRules } from './coverage-access.loader';
import { availabilityFor, availableMembers, groupMemberIds, lockEmployee } from './coverage-availability';
import { COVERAGE_INCLUDE, type CoverageRow } from './coverage.mapper';
import { broadcastDeadline, nextCoverageDeadline } from './domain/coverage-deadlines';
import { coverageAccess, coverageActors } from './domain/coverage-policy';
import {
  applyCoverageAction,
  isCoverageStatus,
  OPEN_STATUSES,
  type CoverageAction,
  type CoverageContext,
  type CoverageResult,
} from './domain/coverage-state-machine';
import { qrKeyFrom, verifyQrToken } from './domain/qr-token';

type Success = Extract<CoverageResult, { ok: true }>;
type Tx = Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINUTE_MS = 60_000;

export interface CoverageActionInput {
  action: CoverageAction;
  version?: number;
  reason?: string;
  assigneeId?: string;
  force?: boolean;
  groupId?: string;
  minutes?: number;
  photoFileId?: string;
  qrToken?: string;
}

/** Preuves vérifiées pour CONFIRM_PRESENCE. */
interface VerifiedProof {
  photoFileId: string | null;
  qr: boolean;
}

/** Effets à publier après validation de la transaction (rien n'est émis pour une écriture annulée). */
interface Effects {
  notifications: Notification[];
  updated: Array<{ userIds: string[]; requestId: string; status: string; version: number }>;
  taken: Array<{ userIds: string[]; requestId: string; takenBy: string }>;
}

/** Actions de gestion tracées dans le journal d'audit. */
const AUDITED: readonly CoverageAction[] = ['ASSIGN', 'REASSIGN', 'WIDEN', 'RELEASE_BY_MANAGER', 'VALIDATE', 'CANCEL'];

/** Limite de débit de « Je prends » : 10 tentatives par minute et par employé. */
export class AcceptRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max = 10,
    private readonly windowMs = 60_000,
  ) {}

  allow(userId: string, now = Date.now()): boolean {
    const recent = (this.hits.get(userId) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(userId, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(userId, recent);
    return true;
  }

  reset(): void {
    this.hits.clear();
  }
}

function fieldError(field: string, message: string): AppException {
  return new AppException('VALIDATION_ERROR', { fields: [{ field, messages: [message] }] }, message);
}

/**
 * Applique la machine à états des couvertures en base : mise à jour conditionnelle (statut + version)
 * qui garantit qu'un seul employé obtient la garde, historique, preuves, relève en cascade,
 * notifications et temps réel — le tout dans une transaction.
 */
@Injectable()
export class CoverageActionsService {
  private readonly qrKey: Buffer;
  readonly limiter = new AcceptRateLimiter();

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CoverageAccessLoader,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.qrKey = qrKeyFrom(config.sessionSecret);
  }

  get key(): Buffer {
    return this.qrKey;
  }

  // ---------------------------------------------------------------------------
  // Action d'un utilisateur
  // ---------------------------------------------------------------------------

  async perform(user: AuthenticatedUser, id: string, input: CoverageActionInput, ctx: RequestContext): Promise<void> {
    // Limitation de débit de « Je prends », avant tout autre contrôle.
    if (input.action === 'ACCEPT' && !this.limiter.allow(user.id)) throw new AppException('RATE_LIMITED');
    const row = await this.load(this.prisma, id);
    const facts = row && (await this.access.facts(row, user.id));
    const access = facts ? coverageAccess(user, facts) : 'none';
    if (!row || !facts || access === 'none') {
      await this.logDenied(user, id, ctx, 'NOT_VISIBLE');
      throw new AppException('NOT_FOUND');
    }
    if (access === 'limited') {
      if (input.action === 'ACCEPT') throw this.alreadyTaken(row.assignee?.displayName);
      await this.logDenied(user, id, ctx, 'COVERAGE_TAKEN');
      throw new AppException('NOT_FOUND');
    }
    if (input.version !== undefined && input.action !== 'ACCEPT' && input.version !== row.version) {
      throw new AppException('STATE_CHANGED');
    }

    const now = new Date();
    const actors = coverageActors(user, facts);
    const { context, proof } = await this.buildContext(user, row, input, actors);
    const result = applyCoverageAction(facts, input.action, context);
    if (!result.ok) {
      if (result.code === 'FORBIDDEN') {
        await this.logDenied(user, id, ctx, `FORBIDDEN_${input.action}`);
        throw new AppException('FORBIDDEN');
      }
      if (result.code === 'INVALID_TRANSITION' && input.action === 'ACCEPT' && row.assigneeId) {
        throw this.alreadyTaken(row.assignee?.displayName);
      }
      throw new AppException(result.code);
    }

    try {
      await this.run(async (tx, effects) => {
        // Prise de garde : verrou par employé puis revérification de la disponibilité dans la transaction,
        // pour que deux acceptations simultanées du même employé ne puissent pas toutes deux réussir.
        if (typeof result.assigneeId === 'string' && !result.forced) {
          await lockEmployee(tx, result.assigneeId);
          const slot = { startAt: row.coverage!.startAt, plannedEndAt: row.coverage!.plannedEndAt };
          const again = await availabilityFor(tx, [result.assigneeId], slot, row.id);
          if (!again.get(result.assigneeId)?.available) throw new AppException('NOT_AVAILABLE');
        }
        await this.commit(tx, row, result, { actorId: user.id, now, input, proof, effects });
        if (AUDITED.includes(input.action)) {
          await this.audit.log(
            'COVERAGE_MANAGED',
            {
              actorId: user.id,
              ip: ctx.ip,
              targetType: 'Request',
              targetId: row.id,
              details: {
                action: input.action,
                status: result.to,
                ...(result.reason ? { reason: result.reason } : {}),
                ...(result.forced ? { forced: true } : {}),
                ...(result.assigneeId !== undefined
                  ? { before: { assigneeId: row.assigneeId }, after: { assigneeId: result.assigneeId } }
                  : {}),
                ...(input.groupId ? { groupId: input.groupId } : {}),
              },
            },
            tx,
          );
        }
      });
    } catch (error) {
      if (error instanceof AppException && error.code === 'STATE_CHANGED' && input.action === 'ACCEPT') {
        // Course perdue : un autre employé a été plus rapide.
        const fresh = await this.load(this.prisma, id);
        if (fresh?.assigneeId && fresh.assigneeId !== user.id) throw this.alreadyTaken(fresh.assignee?.displayName);
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Actions du système (tâche de délais)
  // ---------------------------------------------------------------------------

  /** Applique une action système dans une transaction déjà ouverte ; false si elle n'est plus applicable. */
  async performSystemInTx(
    tx: Tx,
    requestId: string,
    action: CoverageAction,
    effects: Effects,
    reason?: string,
  ): Promise<boolean> {
    const row = await this.load(tx, requestId);
    if (!row || !isCoverageStatus(row.status)) return false;
    const rules = readCoverageRules(row);
    const result = applyCoverageAction(
      { status: row.status, assigneeId: row.assigneeId, rules },
      action,
      { actors: ['SYSTEM'], reason },
    );
    if (!result.ok) return false;
    await this.commit(tx, row, result, { actorId: null, now: new Date(), effects });
    return true;
  }

  /** Exécute `fn` dans une transaction puis publie notifications et événements temps réel. */
  async run<T>(fn: (tx: Tx, effects: Effects) => Promise<T>): Promise<T> {
    const effects: Effects = { notifications: [], updated: [], taken: [] };
    const value = await this.prisma.$transaction((tx) => fn(tx, effects), { timeout: 15_000 });
    await this.publish(effects);
    return value;
  }

  async publish(effects: Effects): Promise<void> {
    await this.notifications.flushAfterCommit(effects.notifications);
    for (const u of effects.updated) {
      this.realtime.emitToUsers(u.userIds, 'coverage:updated', { requestId: u.requestId, status: u.status, version: u.version });
    }
    for (const t of effects.taken) {
      this.realtime.emitToUsers(t.userIds, 'coverage:taken', { requestId: t.requestId, takenBy: t.takenBy });
    }
  }

  /** Diffusion d'une nouvelle couverture (création ou demande de relève) : notifie le groupe disponible. */
  async broadcastInTx(tx: Tx, requestId: string, actorId: string | null, effects: Effects): Promise<number> {
    const row = await this.load(tx, requestId);
    if (!row) return 0;
    const groupIds = row.coverage!.targets.map((t) => t.groupId);
    const recipients = await availableMembers(tx, groupIds, this.slot(row), row.id);
    effects.notifications.push(
      ...(await this.notifications.notifyInTx(tx, recipients, actorId, {
        type: 'COVERAGE_NEW',
        requestId: row.id,
        priority: row.priority,
      })),
    );
    await this.pushUpdate(tx, row, row.status, row.version, effects, []);
    return recipients.filter((id) => id !== actorId).length;
  }

  // ---------------------------------------------------------------------------
  // Écriture d'une transition
  // ---------------------------------------------------------------------------

  private async commit(
    tx: Tx,
    row: CoverageRow,
    result: Success,
    opts: { actorId: string | null; now: Date; input?: CoverageActionInput; proof?: VerifiedProof; effects: Effects },
  ): Promise<void> {
    const { actorId, now, input, effects } = opts;
    const action = result.steps[0].action;
    const coverage = row.coverage!;
    const rules = readCoverageRules(row);
    const previousDeadline: DeadlineState = {
      currentStage: row.currentStage,
      currentDueAt: row.currentDueAt,
      warnAt: row.warnAt,
      overdueStage: row.overdueStage,
    };
    const deadline =
      action === 'EXPIRE'
        ? { ...previousDeadline, overdueStage: row.currentStage } // marqueur persisté : une seule alerte par étape
        : nextCoverageDeadline(
            previousDeadline,
            result.steps,
            rules,
            coverage.startAt,
            now,
            await this.settings.get('deadlineWarnPercent'),
          );

    const data: Prisma.RequestUncheckedUpdateManyInput = { status: result.to, ...deadline, version: { increment: 1 } };
    if (result.assigneeId !== undefined) data.assigneeId = result.assigneeId;
    if (typeof result.assigneeId === 'string') {
      data.assignedAt = now;
      data.acceptedAt = now;
    }
    for (const step of result.steps) {
      if (step.to === 'DONE' && step.from !== 'DONE') data.doneAt = now;
      if (step.to === 'CLOSED') data.closedAt = now;
      if (step.to === 'CANCELLED') data.cancelledAt = now;
    }

    const where: Prisma.RequestWhereInput = { id: row.id, status: result.from, version: row.version };
    if (action === 'EXPIRE') where.overdueStage = null;
    const { count } = await tx.request.updateMany({ where, data });
    if (count === 0) throw new AppException('STATE_CHANGED');

    // Détail de la couverture : horodatages serveur et compteurs.
    const coverageData: Prisma.CoverageDetailUncheckedUpdateInput = {};
    let plannedEndAt = coverage.plannedEndAt;
    switch (action) {
      case 'DEPART':
        coverageData.departedAt = now;
        break;
      case 'RELEASE':
        coverageData.releaseCount = { increment: 1 };
        coverageData.departedAt = null;
        break;
      case 'REASSIGN':
        coverageData.departedAt = null;
        break;
      case 'EXTEND': {
        const base = coverage.plannedEndAt ?? now;
        plannedEndAt = new Date(base.getTime() + (input?.minutes ?? 0) * MINUTE_MS);
        coverageData.plannedEndAt = plannedEndAt;
        coverageData.estimatedMinutes = Math.round((plannedEndAt.getTime() - coverage.startAt.getTime()) / MINUTE_MS);
        coverageData.extensionCount = { increment: 1 };
        break;
      }
      case 'CANCEL':
        coverageData.cancelReason = result.reason ?? null;
        break;
      default:
        break;
    }
    if (result.to === 'ON_DUTY' && result.from !== 'ON_DUTY' && !coverage.presenceAt) coverageData.presenceAt = now;
    if (result.steps.some((s) => s.to === 'DONE')) {
      coverageData.relievedAt = now;
      coverageData.durationMinutes = coverage.presenceAt
        ? Math.max(0, Math.round((now.getTime() - coverage.presenceAt.getTime()) / MINUTE_MS))
        : null;
    }
    if (Object.keys(coverageData).length > 0) {
      await tx.coverageDetail.update({ where: { requestId: row.id }, data: coverageData });
    }

    // Historique (ajout seul).
    const event = (type: Prisma.RequestEventCreateManyInput['type'], extra: Partial<Prisma.RequestEventCreateManyInput> = {}) =>
      tx.requestEvent.create({ data: { requestId: row.id, actorId, type, ...extra } });

    for (const [index, step] of result.steps.entries()) {
      if (step.from === step.to) continue;
      await tx.requestEvent.create({
        data: {
          requestId: row.id,
          actorId: step.actor === 'SYSTEM' ? null : actorId,
          type: 'STATUS_CHANGED',
          fromValue: { status: step.from },
          toValue: { status: step.to },
          comment: index === 0 && action !== 'RELEASE' && action !== 'REQUEST_RELIEF' && action !== 'RELEASE_BY_MANAGER'
            ? (result.reason ?? null)
            : null,
        },
      });
    }
    if (typeof result.assigneeId === 'string') {
      await event(action === 'REASSIGN' ? 'REASSIGNED' : 'ASSIGNED', {
        fromValue: row.assigneeId ? { assigneeId: row.assigneeId } : undefined,
        toValue: { assigneeId: result.assigneeId, ...(action === 'ACCEPT' ? { selfAccepted: true } : {}), ...(result.forced ? { forced: true } : {}) },
      });
    }
    if (action === 'RELEASE' || action === 'RELEASE_BY_MANAGER') {
      await event('RELEASED', {
        fromValue: { assigneeId: row.assigneeId },
        toValue: { byManager: action === 'RELEASE_BY_MANAGER' },
        comment: result.reason ?? null,
      });
    }
    if (action === 'EXTEND') {
      await event('EXTENDED', {
        fromValue: { plannedEndAt: coverage.plannedEndAt?.toISOString() ?? null },
        toValue: { plannedEndAt: plannedEndAt?.toISOString() ?? null, minutes: input?.minutes ?? null },
      });
    }
    if (action === 'EXPIRE') {
      await event('OVERDUE', { toValue: { stage: row.currentStage, ...(row.assigneeId ? { assigneeId: row.assigneeId } : {}) } });
    }

    let groupIds = coverage.targets.map((t) => t.groupId);
    let addedGroupIds: string[] = [];
    if (action === 'WIDEN' && input?.groupId) {
      await tx.coverageTarget.create({ data: { requestId: row.id, groupId: input.groupId } });
      const group = await tx.employeeGroup.findUnique({ where: { id: input.groupId }, select: { name: true } });
      await event('GROUP_ADDED', { toValue: { groupId: input.groupId, groupName: group?.name ?? null } });
      addedGroupIds = [input.groupId];
      groupIds = [...groupIds, input.groupId];
    }

    if (action === 'CONFIRM_PRESENCE' && opts.proof && actorId) {
      const methods: Array<'PHOTO' | 'QR'> = [];
      if (opts.proof.photoFileId) {
        await tx.file.update({
          where: { id: opts.proof.photoFileId },
          data: { requestId: row.id, isCompletionProof: true },
        });
        await tx.coveragePresence.create({
          data: { requestId: row.id, userId: actorId, method: 'PHOTO', fileId: opts.proof.photoFileId, createdAt: now },
        });
        methods.push('PHOTO');
      }
      if (opts.proof.qr) {
        await tx.coveragePresence.create({ data: { requestId: row.id, userId: actorId, method: 'QR', createdAt: now } });
        methods.push('QR');
      }
      await event('PRESENCE_CONFIRMED', { toValue: { methods } });
    }

    let reliefRequestId: string | null = null;
    if (action === 'REQUEST_RELIEF') {
      reliefRequestId = await this.createRelief(tx, row, now, actorId, result.reason ?? '');
      await event('RELIEF_REQUESTED', { toValue: { reliefRequestId }, comment: result.reason ?? null });
    }

    const after = await tx.request.findUniqueOrThrow({ where: { id: row.id }, select: { version: true, assigneeId: true, priority: true } });

    // Notifications (jamais à l'auteur de l'action ; uniquement à des personnes qui ont accès à la demande).
    const managers = await this.managersOf(tx, row);
    const superAdmins = await this.superAdmins(tx);
    const send = async (users: Array<string | null | undefined>, type: NotificationType, priority: Priority = row.priority) => {
      effects.notifications.push(
        ...(await this.notifications.notifyInTx(tx, users, actorId, { type, requestId: row.id, priority })),
      );
    };
    const assignee = typeof result.assigneeId === 'string' ? result.assigneeId : row.assigneeId;
    const slot = { startAt: coverage.startAt, plannedEndAt };

    switch (action) {
      case 'ACCEPT':
      case 'ASSIGN':
      case 'REASSIGN': {
        await send(managers, 'COVERAGE_ACCEPTED');
        if (action !== 'ACCEPT') await send([assignee], 'ASSIGNED');
        if (action === 'REASSIGN') await send([row.assigneeId], 'COVERAGE_RELEASED');
        if (OPEN_STATUSES.includes(result.from)) {
          // Les membres déjà prévenus apprennent que la garde est prise (sans autre détail).
          const notified = await this.notifiedUsers(tx, row.id);
          const others = notified.filter((id) => id !== assignee && !managers.includes(id));
          await send(others, 'COVERAGE_TAKEN');
          const takenBy = await tx.user.findUnique({ where: { id: assignee! }, select: { displayName: true } });
          const members = await groupMemberIds(tx, groupIds);
          effects.taken.push({
            userIds: members.filter((id) => id !== assignee),
            requestId: row.id,
            takenBy: takenBy?.displayName ?? '',
          });
        }
        break;
      }
      case 'WIDEN': {
        const recipients = await availableMembers(tx, addedGroupIds, slot, row.id);
        await send(recipients, 'COVERAGE_NEW');
        break;
      }
      case 'CONFIRM_PRESENCE':
        if (result.from !== result.to) await send([...managers, ...superAdmins], 'COVERAGE_PRESENCE');
        break;
      case 'RELEASE': {
        await send([...managers, ...superAdmins], 'COVERAGE_RELEASED');
        const recipients = await availableMembers(tx, groupIds, slot, row.id);
        await send(recipients.filter((id) => id !== row.assigneeId), 'COVERAGE_NEW');
        break;
      }
      case 'REQUEST_RELIEF':
        await send([...managers, ...superAdmins], 'COVERAGE_RELIEF_REQUESTED', 'URGENT');
        break;
      case 'RELEASE_BY_MANAGER':
        await send([row.assigneeId, ...managers, ...superAdmins], 'COVERAGE_RELIEVED');
        break;
      case 'RELIEVE':
        await send([row.assigneeId, ...managers], 'COVERAGE_RELIEVED');
        break;
      case 'EXTEND':
        await send([row.assigneeId, ...managers], 'COVERAGE_EXTENDED');
        break;
      case 'VALIDATE':
        await send([row.assigneeId], 'CLOSED');
        break;
      case 'CANCEL': {
        // Tous les notifiés sont prévenus, et l'employé qui avait accepté est libéré.
        const notified = await this.notifiedUsers(tx, row.id);
        await send([...notified, row.assigneeId, ...managers], 'CANCELLED');
        break;
      }
      case 'EXPIRE':
        if (result.to === 'UNFILLED') {
          await send([...managers, ...superAdmins], 'COVERAGE_UNFILLED');
          // Relance du groupe.
          await send(await availableMembers(tx, groupIds, slot, row.id), 'COVERAGE_NEW');
        } else {
          await send([...managers, ...superAdmins, row.assigneeId], 'COVERAGE_LATE');
        }
        break;
      case 'RELIEF_ABANDONED':
        await send([row.assigneeId], 'STATUS_CHANGED');
        break;
      default:
        break;
    }

    await this.pushUpdate(tx, row, result.to, after.version, effects, [row.assigneeId, after.assigneeId], groupIds);

    // Relève en cascade, dans la même transaction.
    if (reliefRequestId) {
      await this.broadcastInTx(tx, reliefRequestId, actorId, effects);
    }
    if (result.to === 'ON_DUTY' && result.from !== 'ON_DUTY' && coverage.reliefForId) {
      // Le remplaçant a confirmé sa présence : le premier employé est relevé automatiquement.
      await this.performSystemInTx(tx, coverage.reliefForId, 'RELIEVE', effects);
    }
    if (result.steps.some((s) => s.to === 'DONE')) {
      const pending = await tx.coverageDetail.findMany({
        where: { reliefForId: row.id, request: { status: { in: ['BROADCAST', 'UNFILLED', 'ACCEPTED', 'EN_ROUTE', 'LATE'] } } },
        select: { requestId: true },
      });
      for (const child of pending) {
        await this.performSystemInTx(tx, child.requestId, 'CANCEL', effects, 'Garde d’origine terminée : relève annulée.');
      }
    }
    if (action === 'CANCEL' && coverage.reliefForId) {
      // Relève annulée : la garde d'origine redevient une garde normale (l'employé reste responsable).
      await this.performSystemInTx(tx, coverage.reliefForId, 'RELIEF_ABANDONED', effects);
    }
  }

  /** Demande de relève urgente liée à la même classe et aux mêmes groupes. */
  private async createRelief(tx: Tx, row: CoverageRow, now: Date, actorId: string | null, reason: string): Promise<string> {
    const coverage = row.coverage!;
    const [{ n }] = await tx.$queryRaw<Array<{ n: number }>>`
      SELECT nextval(pg_get_serial_sequence('"Request"', 'number'))::int AS n`;
    const remaining = coverage.plannedEndAt
      ? Math.max(5, Math.round((coverage.plannedEndAt.getTime() - now.getTime()) / MINUTE_MS))
      : null;
    const rules = readCoverageRules(row);
    const urgentRule = await tx.deadlineRule.findUnique({
      where: { categoryId_priority: { categoryId: row.categoryId, priority: 'URGENT' } },
    });
    const snapshot = {
      ...rules,
      takeoverMinutes: urgentRule?.takeoverMinutes ?? rules.takeoverMinutes,
      arrivalMinutes: urgentRule?.arrivalMinutes ?? rules.arrivalMinutes,
    };
    // La demande de relève est diffusée immédiatement : le délai de prise en charge démarre.
    const deadline = broadcastDeadline(snapshot, now, await this.settings.get('deadlineWarnPercent'));
    const child = await tx.request.create({
      data: {
        kind: 'COVERAGE',
        number: n,
        reference: formatCoverageReference(n, now),
        clientId: randomUUID(),
        title: `Relève — ${coverage.class.name}`.slice(0, 120),
        description: `Relève demandée : ${reason}`.slice(0, 4000),
        categoryId: row.categoryId,
        priority: 'URGENT',
        requesterId: row.requesterId,
        status: 'BROADCAST',
        rulesSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        createdAt: now,
        submittedAt: now,
        ...deadline,
        coverage: {
          create: {
            classId: coverage.classId,
            absentTeacher: coverage.absentTeacher,
            startAt: now,
            estimatedMinutes: remaining,
            plannedEndAt: remaining ? new Date(now.getTime() + remaining * MINUTE_MS) : null,
            broadcastAt: now,
            reliefForId: row.id,
            targets: { create: coverage.targets.map((t) => ({ groupId: t.groupId })) },
          },
        },
      },
    });
    await tx.requestEvent.create({
      data: {
        requestId: child.id,
        actorId,
        type: 'CREATED',
        toValue: { title: child.title, priority: child.priority, reliefForId: row.id },
        comment: reason,
      },
    });
    await tx.requestEvent.create({
      data: { requestId: child.id, actorId, type: 'STATUS_CHANGED', fromValue: Prisma.JsonNull, toValue: { status: 'BROADCAST' } },
    });
    return child.id;
  }

  // ---------------------------------------------------------------------------
  // Contexte de l'action (disponibilité, preuves, groupe)
  // ---------------------------------------------------------------------------

  private async buildContext(
    user: AuthenticatedUser,
    row: CoverageRow,
    input: CoverageActionInput,
    actors: CoverageContext['actors'],
  ): Promise<{ context: CoverageContext; proof?: VerifiedProof }> {
    const context: CoverageContext = {
      actors,
      userId: user.id,
      reason: input.reason,
      minutes: input.minutes,
      force: input.force === true,
    };
    const slot = this.slot(row);

    if (input.action === 'ACCEPT') {
      const availability = await availabilityFor(this.prisma, [user.id], slot, row.id);
      context.available = availability.get(user.id)?.available ?? false;
    }
    if ((input.action === 'ASSIGN' || input.action === 'REASSIGN') && input.assigneeId) {
      const candidate = await this.prisma.user.findUnique({
        where: { id: input.assigneeId },
        select: { id: true, active: true, role: true },
      });
      context.assigneeId = input.assigneeId;
      context.assigneeEligible = candidate !== null && candidate.active && candidate.role === 'EMPLOYEE';
      const availability = await availabilityFor(this.prisma, [input.assigneeId], slot, row.id);
      context.available = availability.get(input.assigneeId)?.available ?? false;
    }
    if (input.action === 'WIDEN') {
      const group = input.groupId
        ? await this.prisma.employeeGroup.findUnique({ where: { id: input.groupId }, select: { id: true, active: true } })
        : null;
      if (!group || !group.active) throw fieldError('groupId', 'Groupe introuvable ou désactivé.');
      if (row.coverage!.targets.some((t) => t.groupId === group.id)) {
        throw fieldError('groupId', 'Ce groupe est déjà ciblé par la demande.');
      }
      context.groupAdded = true;
    }

    let proof: VerifiedProof | undefined;
    if (input.action === 'CONFIRM_PRESENCE') {
      proof = { photoFileId: null, qr: false };
      if (input.photoFileId) proof.photoFileId = await this.verifyPhoto(user, input.photoFileId);
      if (input.qrToken !== undefined) {
        await this.verifyQr(input.qrToken, row.coverage!.classId);
        proof.qr = true;
      }
      context.proof = { photo: proof.photoFileId !== null, qr: proof.qr };
    }
    return { context, proof };
  }

  /** Photo de présence : fichier PHOTO provisoire téléversé par l'employé lui-même (déjà validé et nettoyé de l'EXIF). */
  private async verifyPhoto(user: AuthenticatedUser, fileId: string): Promise<string> {
    const file = UUID.test(fileId) ? await this.prisma.file.findUnique({ where: { id: fileId } }) : null;
    if (!file || file.kind !== 'PHOTO' || file.uploaderId !== user.id || file.requestId !== null) {
      throw fieldError('photoFileId', 'Photo introuvable. Reprenez la photo puis réessayez.');
    }
    return file.id;
  }

  /** QR : signature, version en cours (non révoquée) et classe de la garde. */
  async verifyQr(token: string, expectedClassId: string): Promise<void> {
    const parsed = verifyQrToken(this.qrKey, token);
    if (!parsed) throw new AppException('QR_INVALID');
    const schoolClass = await this.prisma.schoolClass.findUnique({ where: { id: parsed.classId } });
    if (!schoolClass || !schoolClass.active || schoolClass.qrVersion !== parsed.version) throw new AppException('QR_INVALID');
    if (schoolClass.id !== expectedClassId) throw new AppException('QR_CLASS_MISMATCH');
  }

  // ---------------------------------------------------------------------------
  // Outils
  // ---------------------------------------------------------------------------

  load(db: Tx | PrismaService, id: string): Promise<CoverageRow | null> {
    if (!UUID.test(id)) return Promise.resolve(null);
    return db.request.findFirst({ where: { id, kind: 'COVERAGE' }, include: COVERAGE_INCLUDE });
  }

  private slot(row: CoverageRow) {
    return { startAt: row.coverage!.startAt, plannedEndAt: row.coverage!.plannedEndAt };
  }

  /** Responsables de la catégorie et auteur de la demande. */
  private async managersOf(tx: Tx, row: Pick<CoverageRow, 'categoryId' | 'requesterId'>): Promise<string[]> {
    const managers = await tx.categoryManager.findMany({ where: { categoryId: row.categoryId }, select: { userId: true } });
    return [...new Set([row.requesterId, ...managers.map((m) => m.userId)])];
  }

  private async superAdmins(tx: Tx): Promise<string[]> {
    const rows = await tx.user.findMany({ where: { role: 'SUPER_ADMIN', active: true }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  /** Utilisateurs déjà notifiés pour cette demande. */
  private async notifiedUsers(tx: Tx, requestId: string): Promise<string[]> {
    const rows = await tx.notification.findMany({ where: { requestId }, distinct: ['userId'], select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  /** Les lecteurs rafraîchissent listes et détail (charge utile : identifiants seulement). */
  private async pushUpdate(
    tx: Tx,
    row: CoverageRow,
    status: string,
    version: number,
    effects: Effects,
    extra: Array<string | null>,
    groupIds = row.coverage!.targets.map((t) => t.groupId),
  ): Promise<void> {
    const [managers, superAdmins, members] = await Promise.all([
      this.managersOf(tx, row),
      this.superAdmins(tx),
      groupMemberIds(tx, groupIds),
    ]);
    effects.updated.push({
      userIds: [...new Set([...managers, ...superAdmins, ...members, ...extra.filter((id): id is string => Boolean(id))])],
      requestId: row.id,
      status,
      version,
    });
  }

  private alreadyTaken(name: string | undefined | null): AppException {
    return new AppException(
      'ALREADY_TAKEN',
      name ? { takenBy: name } : undefined,
      name ? `Déjà prise par ${name}.` : 'Cette garde a déjà été prise.',
    );
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

export function formatCoverageReference(number: number, date: Date): string {
  return `G-${date.getUTCFullYear()}-${String(number).padStart(6, '0')}`;
}
