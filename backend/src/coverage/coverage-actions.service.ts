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
import { availabilityFor, lockEmployee } from './coverage-availability';
import { adminRecipients, groupFlagsOf, superAdminRecipients } from './coverage-groups';
import { COVERAGE_INCLUDE, type CoverageRow } from './coverage.mapper';
import { nextCoverageDeadline } from './domain/coverage-deadlines';
import { coverageActors, coverageView, isEligibleAssignee } from './domain/coverage-policy';
import {
  reminderChanges,
  type CoverageTiming,
  type OpenReminder,
  type ReminderEvent,
  type ReminderSettings,
} from './domain/coverage-reminders';
import {
  applyCoverageAction,
  isCoverageStatus,
  USER_COVERAGE_ACTIONS,
  type CoverageAction,
  type CoverageContext,
  type CoverageResult,
  type CoverageStatus,
} from './domain/coverage-state-machine';
import { qrKeyFrom, verifyQrToken } from './domain/qr-token';

type Success = Extract<CoverageResult, { ok: true }>;
export type Tx = Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINUTE_MS = 60_000;

export interface CoverageActionInput {
  action: string;
  version?: number;
  reason?: string;
  assigneeId?: string;
  teacherId?: string | null;
  supportId?: string;
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
export interface Effects {
  notifications: Notification[];
  updated: Array<{ userIds: string[]; requestId: string; status: string; version: number }>;
}

/** Actions d'administration tracées dans le journal d'audit. */
const AUDITED: readonly CoverageAction[] = [
  'ASSIGN',
  'REASSIGN',
  'RELEASE_BY_MANAGER',
  'VALIDATE',
  'CANCEL',
  'SET_TEACHER',
  'RELEASE_SUPPORT',
];

/** Actions de la route `POST /coverage/:id/actions` ; la modification passe par `PATCH …/teacher-request`. */
const ROUTE_ACTIONS: readonly string[] = USER_COVERAGE_ACTIONS.filter((a) => a !== 'UPDATE');

const BEFORE_PRESENCE: readonly CoverageStatus[] = ['ACCEPTED', 'EN_ROUTE', 'LATE'];
const RELIEF_OPEN: readonly CoverageStatus[] = ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'LATE'];

function fieldError(field: string, message: string): AppException {
  return new AppException('VALIDATION_ERROR', { fields: [{ field, messages: [message] }] }, message);
}

/** Enseignant auteur d'une demande (seul destinataire « enseignant » des notifications, FR-017a). */
export function teacherAuthorOf(row: Pick<CoverageRow, 'requesterId' | 'coverage'>): string | null {
  return row.coverage?.source === 'TEACHER_REQUEST' ? row.requesterId : null;
}

/**
 * Applique la machine à états des affectations en base, dans une transaction : mise à jour
 * conditionnelle (statut + version), historique en ajout seul, échéances (CoverageReminder),
 * renforts, relève en cascade, notifications et temps réel publiés après validation.
 */
@Injectable()
export class CoverageActionsService {
  private readonly qrKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CoverageAccessLoader,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
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
    if (!ROUTE_ACTIONS.includes(input.action)) throw new AppException('UNKNOWN_ACTION');
    const action = input.action as CoverageAction;
    const row = await this.load(this.prisma, id);
    const facts = row && (await this.access.facts(row));
    const viewer = await this.access.viewer(user);
    if (!row || !facts || !coverageView(viewer, facts)) {
      await this.logDenied(user, id, ctx, 'NOT_VISIBLE');
      throw new AppException('NOT_FOUND');
    }
    if (input.version !== undefined && input.version !== row.version) throw new AppException('STATE_CHANGED');

    const now = new Date();
    const { context, proof } = await this.buildContext(user, row, action, input, coverageActors(viewer, facts));
    const result = applyCoverageAction(facts, action, context);
    if (!result.ok) {
      if (result.code === 'FORBIDDEN') {
        await this.logDenied(user, id, ctx, `FORBIDDEN_${action}`);
        throw new AppException('FORBIDDEN');
      }
      throw new AppException(result.code);
    }

    await this.run(async (tx, effects) => {
      // Assignation : verrou par surveillant puis revérification de la disponibilité dans la
      // transaction, pour que deux assignations simultanées du même surveillant ne réussissent pas toutes deux.
      const target = typeof result.assigneeId === 'string' ? result.assigneeId : result.reliefAssigneeId;
      if (target && action !== 'ATTACH_DECLARATION') {
        await lockEmployee(tx, target);
        const again = await availabilityFor(tx, [target], this.slot(row), row.id);
        if (!again.get(target)?.available) throw new AppException('NOT_AVAILABLE');
      }
      await this.commit(tx, row, result, { actorId: user.id, now, input, proof, effects });
      if (AUDITED.includes(action)) {
        await this.audit.log(
          'COVERAGE_MANAGED',
          {
            actorId: user.id,
            ip: ctx.ip,
            targetType: 'Request',
            targetId: row.id,
            details: {
              action,
              status: result.to,
              ...(result.assigneeId !== undefined
                ? { before: { assigneeId: row.assigneeId }, after: { assigneeId: result.assigneeId } }
                : {}),
              ...(result.reliefAssigneeId ? { reliefAssigneeId: result.reliefAssigneeId } : {}),
              ...(input.supportId ? { supportId: input.supportId } : {}),
            },
          },
          tx,
        );
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Actions du système (jobs, relève en cascade)
  // ---------------------------------------------------------------------------

  /** Applique une action système dans une transaction déjà ouverte ; false si elle n'est plus applicable. */
  async performSystemInTx(
    tx: Tx,
    requestId: string,
    action: CoverageAction,
    effects: Effects,
    opts: { reason?: string; now?: Date; assigneeId?: string } = {},
  ): Promise<boolean> {
    const row = await this.load(tx, requestId);
    if (!row || !isCoverageStatus(row.status)) return false;
    const rules = readCoverageRules(row);
    const result = applyCoverageAction({ status: row.status, assigneeId: row.assigneeId, rules }, action, {
      actors: ['SYSTEM'],
      reason: opts.reason,
      assigneeId: opts.assigneeId,
    });
    if (!result.ok) return false;
    await this.commit(tx, row, result, { actorId: null, now: opts.now ?? new Date(), effects });
    return true;
  }

  /** Exécute `fn` dans une transaction puis publie notifications et événements temps réel. */
  async run<T>(fn: (tx: Tx, effects: Effects) => Promise<T>): Promise<T> {
    const effects: Effects = { notifications: [], updated: [] };
    const value = await this.prisma.$transaction((tx) => fn(tx, effects), { timeout: 15_000 });
    await this.publish(effects);
    return value;
  }

  async publish(effects: Effects): Promise<void> {
    await this.notifications.flushAfterCommit(effects.notifications);
    for (const u of effects.updated) {
      this.realtime.emitToUsers(u.userIds, 'coverage:updated', { requestId: u.requestId, status: u.status, version: u.version });
    }
  }

  /** Notification dans la transaction (jamais à l'auteur de l'action). */
  async notify(
    tx: Tx,
    effects: Effects,
    users: ReadonlyArray<string | null | undefined>,
    actorId: string | null,
    type: NotificationType,
    requestId: string,
    priority: Priority,
  ): Promise<void> {
    effects.notifications.push(...(await this.notifications.notifyInTx(tx, users, actorId, { type, requestId, priority })));
  }

  // ---------------------------------------------------------------------------
  // Échéances (CoverageReminder)
  // ---------------------------------------------------------------------------

  async reminderSettings(row: Pick<CoverageRow, 'rulesSnapshot'>): Promise<ReminderSettings> {
    const s = await this.settings.getAll();
    return {
      timezone: this.config.schoolTimezone,
      takeoverMinutes: readCoverageRules(row).takeoverMinutes ?? 2,
      urgencyThresholdMinutes: s.coverageUrgencyThresholdMinutes,
      escalationMinutes: s.coverageEscalationMinutes,
      morningReminderTime: s.coverageMorningReminderTime,
      closeReminderMinutes: s.coverageCloseReminderMinutes,
      closeEscalationMinutes: s.coverageCloseEscalationMinutes,
      supportReminderMinutes: s.coverageSupportReminderMinutes,
      supportReminderMax: s.coverageSupportReminderMax,
    };
  }

  /** Crée, recalcule ou résout les échéances d'une affectation après un changement (même transaction). */
  async applyReminders(
    tx: Tx,
    row: Pick<CoverageRow, 'id' | 'rulesSnapshot'>,
    event: ReminderEvent,
    timing: CoverageTiming,
    now: Date,
  ): Promise<void> {
    const open = await tx.coverageReminder.findMany({ where: { requestId: row.id, resolvedAt: null } });
    const changes = reminderChanges(event, timing, open.map(toOpenReminder), now, await this.reminderSettings(row));
    for (const r of changes.resolve) {
      await tx.coverageReminder.update({ where: { id: r.id }, data: { resolvedAt: now, resolution: r.resolution } });
    }
    if (changes.create.length > 0) {
      await tx.coverageReminder.createMany({ data: changes.create.map((plan) => ({ requestId: row.id, ...plan })) });
    }
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
        : nextCoverageDeadline(previousDeadline, result.steps, rules, coverage.startAt, now, await this.settings.get('deadlineWarnPercent'));

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

    // Détail de l'affectation : horodatages serveur et compteurs.
    const coverageData: Prisma.CoverageDetailUncheckedUpdateInput = {};
    let plannedEndAt = coverage.plannedEndAt;
    switch (action) {
      case 'DEPART':
        coverageData.departedAt = now;
        break;
      case 'REASSIGN':
        if (BEFORE_PRESENCE.includes(result.from)) coverageData.departedAt = null;
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
      case 'WITHDRAW':
        coverageData.cancelReason = result.reason ?? null;
        break;
      case 'SET_TEACHER':
        coverageData.teacherId = input?.teacherId ?? null;
        break;
      default:
        break;
    }
    if (result.to === 'ON_DUTY' && result.from !== 'ON_DUTY' && !coverage.presenceAt) coverageData.presenceAt = now;
    const done = result.steps.some((s) => s.to === 'DONE');
    if (done) {
      coverageData.relievedAt = now;
      coverageData.durationMinutes = coverage.presenceAt
        ? Math.max(0, Math.round((now.getTime() - coverage.presenceAt.getTime()) / MINUTE_MS))
        : null;
    }
    if (Object.keys(coverageData).length > 0) {
      await tx.coverageDetail.update({ where: { requestId: row.id }, data: coverageData });
    }

    // Historique (ajout seul ; jamais de nom ni de motif d'enseignant dans les valeurs, R5).
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
          comment:
            index === 0 && action !== 'REQUEST_RELIEF' && action !== 'RELEASE_BY_MANAGER' ? (result.reason ?? null) : null,
        },
      });
    }
    if (typeof result.assigneeId === 'string') {
      await event(action === 'REASSIGN' ? 'REASSIGNED' : 'ASSIGNED', {
        fromValue: row.assigneeId ? { assigneeId: row.assigneeId } : undefined,
        toValue: { assigneeId: result.assigneeId },
      });
    }
    if (action === 'RELEASE_BY_MANAGER') {
      await event('RELEASED', { fromValue: { assigneeId: row.assigneeId }, toValue: { byManager: true }, comment: result.reason ?? null });
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
    if (action === 'SET_TEACHER') {
      await event('TEACHER_SET', { fromValue: { teacherId: coverage.teacherId }, toValue: { teacherId: input?.teacherId ?? null } });
    }

    if (action === 'CONFIRM_PRESENCE' && opts.proof && actorId) {
      const methods: Array<'PHOTO' | 'QR'> = [];
      if (opts.proof.photoFileId) {
        await tx.file.update({ where: { id: opts.proof.photoFileId }, data: { requestId: row.id, isCompletionProof: true } });
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

    // Renforts : libération par l'admin, ou de tous à la fin et à l'annulation (FR-015i).
    const released: string[] = [];
    if (action === 'RELEASE_SUPPORT' && input?.supportId) released.push(input.supportId);
    if (done || result.to === 'CANCELLED') released.push(...row.supports.map((s) => s.id));
    for (const supportId of released) {
      const support = row.supports.find((s) => s.id === supportId);
      await tx.coverageSupport.update({
        where: { id: supportId },
        data: { releasedAt: now, releasedById: action === 'RELEASE_SUPPORT' || action === 'CANCEL' ? actorId : null },
      });
      await event('SUPPORT_RELEASED', { toValue: { supportId, userId: support?.user.id ?? null } });
    }

    let reliefRequestId: string | null = null;
    if (action === 'REQUEST_RELIEF') {
      reliefRequestId = await this.createRelief(tx, row, now, actorId, result.reason ?? '', null, effects);
      await event('RELIEF_REQUESTED', { toValue: { reliefRequestId }, comment: result.reason ?? null });
    }
    if (action === 'REASSIGN' && result.reliefAssigneeId) {
      // Sur site : relève assignée au nouveau surveillant ; l'ancien est libéré à sa présence (FR-008j).
      reliefRequestId = await this.createRelief(tx, row, now, actorId, result.reason ?? '', result.reliefAssigneeId, effects);
      await event('REASSIGNED', {
        fromValue: { assigneeId: row.assigneeId },
        toValue: { assigneeId: result.reliefAssigneeId, reliefRequestId },
      });
    }

    const after = await tx.request.findUniqueOrThrow({ where: { id: row.id }, select: { version: true, assigneeId: true } });

    // Échéances, dans la même transaction que la transition.
    const timing: CoverageTiming = {
      status: result.to,
      source: coverage.source,
      startAt: coverage.startAt,
      plannedEndAt,
      assigneeId: after.assigneeId,
    };
    if (action === 'RELEASE_SUPPORT' && input?.supportId) {
      await this.applyReminders(tx, row, { type: 'SUPPORT_RELEASED', supportId: input.supportId }, timing, now);
    } else {
      await this.applyReminders(tx, row, { type: 'TRANSITION', action }, timing, now);
    }

    // Notifications (contracts/realtime-events.md ; jamais à l'auteur de l'action).
    const send = (users: Array<string | null | undefined>, type: NotificationType, priority: Priority = row.priority) =>
      this.notify(tx, effects, users, actorId, type, row.id, priority);
    const admins = await adminRecipients(tx);
    const superAdmins = await superAdminRecipients(tx);
    const teacher = teacherAuthorOf(row);

    switch (action) {
      case 'ASSIGN':
      case 'ATTACH_DECLARATION':
        await send([after.assigneeId, teacher], 'ASSIGNED');
        break;
      case 'REASSIGN':
        if (typeof result.assigneeId === 'string') {
          await send([result.assigneeId, teacher], 'ASSIGNED');
          await send([row.assigneeId], 'COVERAGE_LIFTED');
        }
        break;
      case 'CONFIRM_PRESENCE':
        if (result.from !== result.to) await send(admins, 'COVERAGE_PRESENCE');
        break;
      case 'REQUEST_RELIEF':
        await send([...admins, ...superAdmins], 'COVERAGE_RELIEF_REQUESTED', 'URGENT');
        break;
      case 'RELEASE_BY_MANAGER':
        await send([row.assigneeId, ...admins, ...superAdmins], 'COVERAGE_RELIEVED');
        break;
      case 'RELIEVE':
        await send([row.assigneeId, ...admins], 'COVERAGE_RELIEVED');
        break;
      case 'EXTEND':
        await send([row.assigneeId, ...admins], 'COVERAGE_EXTENDED');
        break;
      case 'VALIDATE':
        await send([row.assigneeId], 'CLOSED');
        break;
      case 'CANCEL':
        await send([teacher], 'CANCELLED');
        await send([row.assigneeId], 'COVERAGE_LIFTED');
        break;
      case 'WITHDRAW':
        await send(admins, 'CANCELLED');
        break;
      case 'RELEASE_SUPPORT': {
        const support = row.supports.find((s) => s.id === input?.supportId);
        await send([support?.user.id], 'COVERAGE_LIFTED');
        break;
      }
      case 'EXPIRE':
        await send([...admins, ...superAdmins, row.assigneeId], 'COVERAGE_LATE');
        break;
      case 'EXPIRE_UNFILLED':
        await send([...admins, teacher], 'COVERAGE_UNFILLED');
        break;
      case 'RELIEF_ABANDONED':
        await send([row.assigneeId], 'STATUS_CHANGED');
        break;
      default:
        break;
    }
    if (result.to === 'CANCELLED' || done) {
      const supportUsers = row.supports.map((s) => s.user.id);
      if (action !== 'RELEASE_SUPPORT') await send(supportUsers, 'COVERAGE_LIFTED');
    }

    await this.pushUpdate(tx, row, result.to, after.version, effects, [row.assigneeId, after.assigneeId]);

    // Relève en cascade, dans la même transaction.
    if (result.to === 'ON_DUTY' && result.from !== 'ON_DUTY' && coverage.reliefForId) {
      // Le remplaçant a confirmé sa présence : le premier surveillant est relevé automatiquement.
      await this.performSystemInTx(tx, coverage.reliefForId, 'RELIEVE', effects, { now });
    }
    if (done) {
      const pending = await tx.coverageDetail.findMany({
        where: { reliefForId: row.id, request: { status: { in: [...RELIEF_OPEN] } } },
        select: { requestId: true },
      });
      for (const child of pending) {
        await this.performSystemInTx(tx, child.requestId, 'CANCEL', effects, {
          reason: 'Affectation d’origine terminée : relève annulée.',
          now,
        });
      }
    }
    if (result.to === 'CANCELLED' && coverage.reliefForId) {
      // Relève annulée : l'affectation d'origine redevient « en cours » (le surveillant reste en charge de la classe).
      await this.performSystemInTx(tx, coverage.reliefForId, 'RELIEF_ABANDONED', effects, { now });
    }
  }

  /**
   * Relève liée à la même classe : « en attente » d'assignation par l'admin (demande de relève), ou
   * déjà assignée au surveillant désigné (réassignation sur site, FR-008j).
   */
  private async createRelief(
    tx: Tx,
    row: CoverageRow,
    now: Date,
    actorId: string | null,
    reason: string,
    assigneeId: string | null,
    effects: Effects,
  ): Promise<string> {
    const coverage = row.coverage!;
    const [{ n }] = await tx.$queryRaw<Array<{ n: number }>>`
      SELECT nextval(pg_get_serial_sequence('"Request"', 'number'))::int AS n`;
    const plannedEndAt = coverage.plannedEndAt && coverage.plannedEndAt > now ? coverage.plannedEndAt : null;
    const rules = readCoverageRules(row);
    const urgentRule = await tx.deadlineRule.findUnique({
      where: { categoryId_priority: { categoryId: row.categoryId, priority: 'URGENT' } },
    });
    const snapshot = {
      ...rules,
      takeoverMinutes: urgentRule?.takeoverMinutes ?? rules.takeoverMinutes,
      arrivalMinutes: urgentRule?.arrivalMinutes ?? rules.arrivalMinutes,
    };
    const status: CoverageStatus = assigneeId ? 'ACCEPTED' : 'PENDING';
    const deadline = assigneeId
      ? nextCoverageDeadline(
          { currentStage: null, currentDueAt: null, warnAt: null, overdueStage: null },
          [{ from: 'PENDING', to: 'ACCEPTED', action: 'ASSIGN', actor: 'ADMIN' }],
          snapshot,
          now,
          now,
          await this.settings.get('deadlineWarnPercent'),
        )
      : {};
    const child = await tx.request.create({
      data: {
        kind: 'COVERAGE',
        number: n,
        reference: formatCoverageReference(n, now),
        clientId: randomUUID(),
        title: `Relève — ${coverage.class.name}`.slice(0, 120),
        description: reason ? `Relève demandée : ${reason}`.slice(0, 4000) : null,
        categoryId: row.categoryId,
        priority: 'URGENT',
        requesterId: actorId ?? row.requesterId,
        assigneeId,
        status,
        rulesSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        createdAt: now,
        submittedAt: now,
        ...(assigneeId ? { assignedAt: now, acceptedAt: now } : {}),
        ...deadline,
        coverage: {
          create: {
            classId: coverage.classId,
            floorId: coverage.floorId,
            source: 'ADMIN_DIRECT',
            type: coverage.type,
            teacherId: coverage.teacherId,
            absentTeacher: coverage.absentTeacher,
            startAt: now,
            plannedEndAt,
            estimatedMinutes: plannedEndAt ? Math.max(1, Math.round((plannedEndAt.getTime() - now.getTime()) / MINUTE_MS)) : null,
            reliefForId: row.id,
          },
        },
      },
    });
    await tx.requestEvent.create({
      data: { requestId: child.id, actorId, type: 'CREATED', toValue: { title: child.title, priority: child.priority, reliefForId: row.id } },
    });
    await tx.requestEvent.create({
      data: { requestId: child.id, actorId, type: 'STATUS_CHANGED', fromValue: Prisma.JsonNull, toValue: { status } },
    });
    if (assigneeId) {
      await tx.requestEvent.create({ data: { requestId: child.id, actorId, type: 'ASSIGNED', toValue: { assigneeId } } });
    }
    await this.applyReminders(
      tx,
      child,
      { type: 'CREATED' },
      { status, source: 'ADMIN_DIRECT', startAt: now, plannedEndAt, assigneeId },
      now,
    );
    if (assigneeId) {
      await this.notify(tx, effects, [assigneeId, teacherAuthorOf(row)], actorId, 'ASSIGNED', child.id, 'URGENT');
    }
    return child.id;
  }

  // ---------------------------------------------------------------------------
  // Contexte de l'action (assignation, enseignant, renfort, preuves)
  // ---------------------------------------------------------------------------

  private async buildContext(
    user: AuthenticatedUser,
    row: CoverageRow,
    action: CoverageAction,
    input: CoverageActionInput,
    actors: CoverageContext['actors'],
  ): Promise<{ context: CoverageContext; proof?: VerifiedProof }> {
    const context: CoverageContext = { actors, userId: user.id, reason: input.reason, minutes: input.minutes };

    if ((action === 'ASSIGN' || action === 'REASSIGN') && input.assigneeId) {
      const candidate = await this.prisma.user.findUnique({ where: { id: input.assigneeId }, select: { id: true, active: true } });
      const flags = candidate ? await groupFlagsOf(this.prisma, candidate.id) : null;
      context.assigneeId = input.assigneeId;
      context.assigneeEligible = candidate !== null && isEligibleAssignee({ active: candidate.active, ...flags! });
      const availability = await availabilityFor(this.prisma, [input.assigneeId], this.slot(row), row.id);
      context.available = availability.get(input.assigneeId)?.available ?? false;
    }
    if (action === 'SET_TEACHER') {
      if (input.teacherId === undefined) throw fieldError('teacherId', 'Choisissez l’enseignant concerné, ou « non précisé ».');
      if (input.teacherId !== null) {
        const teacher = await this.prisma.user.findUnique({ where: { id: input.teacherId }, select: { active: true } });
        const flags = teacher ? await groupFlagsOf(this.prisma, input.teacherId) : null;
        if (!teacher || !flags?.isTeacher) throw fieldError('teacherId', 'Cet enseignant n’appartient pas au groupe Enseignants.');
      }
    }
    if (action === 'RELEASE_SUPPORT' && !row.supports.some((s) => s.id === input.supportId)) {
      throw fieldError('supportId', 'Ce renfort est introuvable ou déjà libéré.');
    }

    let proof: VerifiedProof | undefined;
    if (action === 'CONFIRM_PRESENCE') {
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

  /** Photo de présence : fichier PHOTO provisoire téléversé par le surveillant lui-même (déjà validé et nettoyé de l'EXIF). */
  private async verifyPhoto(user: AuthenticatedUser, fileId: string): Promise<string> {
    const file = UUID.test(fileId) ? await this.prisma.file.findUnique({ where: { id: fileId } }) : null;
    if (!file || file.kind !== 'PHOTO' || file.uploaderId !== user.id || file.requestId !== null) {
      throw fieldError('photoFileId', 'Photo introuvable. Reprenez la photo puis réessayez.');
    }
    return file.id;
  }

  /** QR : signature, version en cours (non révoquée) et classe de l'affectation. */
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

  slot(row: CoverageRow) {
    return { startAt: row.coverage!.startAt, plannedEndAt: row.coverage!.plannedEndAt };
  }

  /** Les lecteurs rafraîchissent listes et détail (charge utile : identifiants seulement). */
  async pushUpdate(
    tx: Tx,
    row: CoverageRow,
    status: string,
    version: number,
    effects: Effects,
    extra: Array<string | null>,
  ): Promise<void> {
    const [admins, superAdmins] = await Promise.all([adminRecipients(tx), superAdminRecipients(tx)]);
    effects.updated.push({
      userIds: [
        ...new Set(
          [...admins, ...superAdmins, teacherAuthorOf(row), ...row.supports.map((s) => s.user.id), ...extra].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ],
      requestId: row.id,
      status,
      version,
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

function toOpenReminder(r: {
  id: string;
  kind: OpenReminder['kind'];
  dueAt: Date;
  targetUserId: string | null;
  supportId: string | null;
  attempts: number;
  maxAttempts: number;
  intervalMinutes: number | null;
}): OpenReminder {
  return {
    id: r.id,
    kind: r.kind,
    dueAt: r.dueAt,
    targetUserId: r.targetUserId,
    supportId: r.supportId,
    attempts: r.attempts,
    maxAttempts: r.maxAttempts,
    intervalMinutes: r.intervalMinutes,
  };
}

export { toOpenReminder };

export function formatCoverageReference(number: number, date: Date): string {
  return `G-${date.getUTCFullYear()}-${String(number).padStart(6, '0')}`;
}
