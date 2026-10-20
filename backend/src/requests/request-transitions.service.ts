import { Injectable } from '@nestjs/common';
import type { Notification, NotificationType, Prisma, Request } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SuperAdminAlertsService } from '../notifications/super-admin-alerts.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SettingsService } from '../settings/settings.service';
import { nextDeadlineState } from './domain/deadlines';
import { actorsFor, administrationActs, canPickRecipient, canReadRequest, isReadOnlyStatus } from './domain/access-policy';
import {
  applyAction,
  type ActionContext,
  type RequestAction,
  type TransitionResult,
} from './domain/request-state-machine';
import {
  readRulesSnapshot,
  RequestPolicyLoader,
  toPolicyCategory,
  toPolicyRequest,
  type CategoryWithMembers,
} from './request-policy.loader';
import type { RequestContext } from './requests.service';

type SuccessfulTransition = Extract<TransitionResult, { ok: true }>;

/** Origine de l'employé affecté à l'approbation, tracée dans l'historique (FR-008). */
export type AssigneeSource = 'SNAPSHOT' | 'CATEGORY_CURRENT' | 'MANAGER_CHOICE';

type AssigneeContext = Pick<ActionContext, 'assigneeId' | 'assigneeAllowed'> & {
  assigneeSource?: AssigneeSource;
  /** Mode automatique figé, personne prévue absente ou non affectable, aucun choix fourni (EXC-2). */
  autoAssigneeUnavailable?: boolean;
};

export interface ActionInput {
  action: RequestAction;
  version: number;
  reason?: string;
  assigneeId?: string;
  proofFileIds?: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Actions administratives journalisées (REQUEST_MANAGED), comme pour les gardes. Les actions
 * courantes de l'employé (accepter, commencer, terminer, décliner) restent dans l'historique seul.
 */
const AUDITED: readonly RequestAction[] = ['APPROVE', 'REJECT', 'REASSIGN', 'CANCEL', 'VALIDATE_FINAL', 'REQUEST_CORRECTION'];

/** Action à journaliser avec la transition, dans la même transaction. */
interface AuditedAction {
  action: RequestAction;
  ip: string | null;
}

/** Libellé du message système qui conserve le motif ou le commentaire dans le fil. */
const REASON_LABELS: Partial<Record<RequestAction, string>> = {
  REJECT: 'Motif du refus',
  DECLINE: 'Motif du refus',
  REQUEST_CORRECTION: 'À corriger',
};

function fieldError(field: string, message: string): AppException {
  return new AppException('VALIDATION_ERROR', { fields: [{ field, messages: [message] }] });
}

/** Horodatages et champs à mettre à jour pour chaque étape appliquée (FR-028). */
function updateFor(result: SuccessfulTransition, now: Date): Prisma.RequestUncheckedUpdateManyInput {
  const data: Prisma.RequestUncheckedUpdateManyInput = {
    status: result.to,
    autoCloseAt: result.autoCloseAt,
  };
  if (result.assigneeId) {
    data.assigneeId = result.assigneeId;
    data.assignedAt = now;
  }
  for (const step of result.steps) {
    switch (step.to) {
      case 'PENDING_ADMIN_VALIDATION':
        data.submittedAt = now;
        break;
      case 'SENT':
        if (step.action === 'SUBMIT') data.submittedAt = now;
        if (step.action === 'APPROVE') data.approvedAt = now;
        break;
      case 'ACCEPTED':
        data.acceptedAt = now;
        break;
      case 'IN_PROGRESS':
        data.startedAt = now;
        break;
      case 'DONE':
        data.doneAt = now;
        break;
      case 'CLOSED':
        data.closedAt = now;
        if (step.action === 'VALIDATE_FINAL') data.finalValidatedAt = now;
        break;
      case 'REJECTED':
        data.rejectedAt = now;
        data.rejectionReason = result.reason ?? null;
        break;
      case 'CANCELLED':
        data.cancelledAt = now;
        break;
      default:
        break;
    }
  }
  return data;
}

/**
 * Applique les transitions de la machine à états en base : verrouillage optimiste sur `version`,
 * horodatages, historique (RequestEvent), message du motif, notifications — en une transaction.
 * Les notifications ne sont diffusées qu'après validation de la transaction.
 */
@Injectable()
export class RequestTransitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: RequestPolicyLoader,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly settings: SettingsService,
    private readonly superAdminAlerts: SuperAdminAlertsService,
  ) {}

  /** Action d'un utilisateur (POST /requests/:id/actions). */
  async perform(user: AuthenticatedUser, id: string, input: ActionInput, ctx: RequestContext): Promise<void> {
    const request = UUID.test(id) ? await this.prisma.request.findUnique({ where: { id } }) : null;
    const category = request && (await this.policies.category(request.categoryId));
    const policyRequest = request && toPolicyRequest(request);
    if (!request || !category || !policyRequest || !canReadRequest(user, policyRequest, toPolicyCategory(category))) {
      await this.logDenied(user, id, ctx, 'NOT_VISIBLE');
      throw new AppException('NOT_FOUND');
    }
    if (input.version !== request.version) throw new AppException('STATE_CHANGED');

    const actors = actorsFor(user, policyRequest, toPolicyCategory(category));
    const now = new Date();
    const { assigneeSource, autoAssigneeUnavailable, ...assignee } = await this.assigneeContext(request, category, input);
    const context: ActionContext = {
      actors,
      now,
      reason: input.reason,
      ...assignee,
      proofPhotoCount: await this.validProofCount(user, request, input.proofFileIds),
    };

    const result = applyAction(policyRequest, input.action, context);
    const forbidden =
      (!result.ok && result.code === 'FORBIDDEN') ||
      // Réaffecter : permission, et seulement en mode « via l'administration » (ailleurs, lecture seule).
      (result.ok &&
        input.action === 'REASSIGN' &&
        (!user.permissions.has('REQUEST_REASSIGN') || !administrationActs(toPolicyCategory(category))));
    if (forbidden) {
      await this.logDenied(user, id, ctx, `FORBIDDEN_${input.action}`);
      throw new AppException('FORBIDDEN');
    }
    if (!result.ok) {
      // Personne figée indisponible : l'admin doit choisir l'employé (EXC-2, D8, FR-011).
      if (result.code === 'ASSIGNEE_REQUIRED' && autoAssigneeUnavailable) throw new AppException('AUTO_ASSIGNEE_UNAVAILABLE');
      throw new AppException(result.code);
    }

    const audited = AUDITED.includes(input.action) ? { action: input.action, ip: ctx.ip } : undefined;
    await this.commit(request, category, result, user.id, now, input.proofFileIds ?? [], assigneeSource, audited);
  }

  /** Transition déclenchée par le système (job planifié). Renvoie false si elle n'est pas applicable. */
  async performSystem(requestId: string, action: RequestAction): Promise<boolean> {
    const request = await this.prisma.request.findUnique({ where: { id: requestId } });
    const category = request && (await this.policies.category(request.categoryId));
    if (!request || !category) return false;
    const now = new Date();
    const result = applyAction(toPolicyRequest(request), action, { actors: ['SYSTEM'], now });
    if (!result.ok) return false;
    try {
      await this.commit(request, category, result, null, now, []);
      return true;
    } catch (error) {
      if (error instanceof AppException && error.code === 'STATE_CHANGED') return false;
      throw error;
    }
  }

  /**
   * Historique, message du motif et notifications d'une transition déjà écrite en base.
   * Utilisé aussi par la création directe d'une demande (SUBMIT depuis le formulaire).
   */
  async recordTransition(
    tx: Prisma.TransactionClient,
    before: Pick<Request, 'assigneeId'>,
    after: Request,
    category: CategoryWithMembers,
    result: SuccessfulTransition,
    actorId: string | null,
    assigneeSource?: AssigneeSource,
  ): Promise<Notification[]> {
    const action = result.steps[0].action;

    if (action === 'SUBMIT') {
      await tx.requestEvent.create({
        data: {
          requestId: after.id,
          actorId,
          type: 'CREATED',
          toValue: { title: after.title, priority: after.priority, categoryId: after.categoryId },
        },
      });
    }
    for (const [index, step] of result.steps.entries()) {
      await tx.requestEvent.create({
        data: {
          requestId: after.id,
          actorId: step.actor === 'SYSTEM' ? null : actorId,
          type: 'STATUS_CHANGED',
          fromValue: { status: step.from },
          toValue: { status: step.to },
          comment: index === 0 ? (result.reason ?? null) : null,
        },
      });
    }
    if (result.assigneeId) {
      await tx.requestEvent.create({
        data: {
          requestId: after.id,
          actorId,
          type: action === 'REASSIGN' ? 'REASSIGNED' : 'ASSIGNED',
          fromValue: before.assigneeId ? { assigneeId: before.assigneeId } : undefined,
          toValue: { assigneeId: result.assigneeId, ...(assigneeSource ? { assigneeSource } : {}) },
        },
      });
    }

    const reasonLabel = REASON_LABELS[action];
    if (reasonLabel && result.reason) {
      await tx.message.create({
        data: { requestId: after.id, authorId: actorId, kind: 'SYSTEM', text: `${reasonLabel} : ${result.reason}` },
      });
    }

    const notified = await this.notify(tx, before, after, category, result, actorId);
    // Super administrateur : alerte « urgente » une seule fois (envoi d'une demande urgente) ;
    // fin de demande : ses notifications de supervision deviennent caduques.
    const alerts = after.priority === 'URGENT' ? await this.superAdminAlerts.alertInTx(tx, after.id, 'URGENT', actorId) : [];
    if (isReadOnlyStatus(after.status)) await this.superAdminAlerts.clearOnFinishInTx(tx, after);
    return [...notified, ...alerts];
  }

  // ---------------------------------------------------------------------------

  private async commit(
    request: Request,
    category: CategoryWithMembers,
    result: SuccessfulTransition,
    actorId: string | null,
    now: Date,
    proofFileIds: string[],
    assigneeSource?: AssigneeSource,
    audited?: AuditedAction,
  ): Promise<void> {
    // Délais : l'étape suivie démarre, continue ou s'arrête selon la transition (US6).
    const deadline = nextDeadlineState(
      {
        currentStage: request.currentStage,
        currentDueAt: request.currentDueAt,
        warnAt: request.warnAt,
        overdueStage: request.overdueStage,
      },
      result.steps,
      readRulesSnapshot(request),
      now,
      await this.settings.get('deadlineWarnPercent'),
    );
    const { pending, after } = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.request.updateMany({
        where: { id: request.id, status: result.from, version: request.version },
        data: { ...updateFor(result, now), ...deadline, version: { increment: 1 } },
      });
      if (count === 0) throw new AppException('STATE_CHANGED');

      if (proofFileIds.length > 0) {
        await tx.file.updateMany({
          where: { id: { in: proofFileIds } },
          data: { requestId: request.id, isCompletionProof: true },
        });
      }
      const after = await tx.request.findUniqueOrThrow({ where: { id: request.id } });
      if (audited) {
        await this.audit.log(
          'REQUEST_MANAGED',
          {
            actorId,
            ip: audited.ip,
            targetType: 'Request',
            targetId: request.id,
            details: {
              action: audited.action,
              status: result.to,
              ...(result.reason ? { reasonGiven: true } : {}),
              ...(result.assigneeId !== undefined
                ? { before: { assigneeId: request.assigneeId }, after: { assigneeId: result.assigneeId } }
                : {}),
            },
          },
          tx,
        );
      }
      return { after, pending: await this.recordTransition(tx, request, after, category, result, actorId, assigneeSource) };
    });
    await this.notifications.flushAfterCommit(pending);
    // Les lecteurs de la demande rafraîchissent liste et détail (contracts/realtime-events.md).
    this.realtime.emitRequestUpdated([after.requesterId, after.assigneeId, ...category.managers.map((m) => m.userId)], {
      requestId: after.id,
      status: after.status,
      version: after.version,
      overdueStage: after.overdueStage,
    });
  }

  /**
   * Employé visé par SUBMIT (circuit A), APPROVE ou REASSIGN, et s'il est autorisé dans la catégorie.
   * APPROVE suit le mode et la personne figés dans le snapshot (D1, FR-008, data-model §Résolution).
   */
  private async assigneeContext(request: Request, category: CategoryWithMembers, input: ActionInput): Promise<AssigneeContext> {
    let assigneeId: string | undefined;
    let assigneeSource: AssigneeSource | undefined;
    if (input.action === 'SUBMIT') assigneeId = request.assigneeId ?? undefined;
    if (input.action === 'REASSIGN') assigneeId = input.assigneeId;
    if (input.action === 'APPROVE') {
      const rules = readRulesSnapshot(request);
      if (rules.assignmentMode === 'AUTO') {
        // Clé absente : demande soumise avant la correction, personne lue dans la catégorie (EXC-1, D9).
        const fromSnapshot = 'autoAssigneeId' in rules;
        const planned = fromSnapshot ? rules.autoAssigneeId : category.autoAssigneeId;
        if (planned && (await this.isAssignable(category, planned))) {
          // Un employé proposé par l'admin est ignoré (FR-008).
          return { assigneeId: planned, assigneeAllowed: true, assigneeSource: fromSnapshot ? 'SNAPSHOT' : 'CATEGORY_CURRENT' };
        }
        if (!input.assigneeId) return { autoAssigneeUnavailable: true };
      }
      assigneeId = input.assigneeId;
      assigneeSource = 'MANAGER_CHOICE';
    }
    if (!assigneeId) return {};
    return { assigneeId, assigneeAllowed: await this.isAssignable(category, assigneeId), assigneeSource };
  }

  /** Compte actif et destinataire actuel de la catégorie. */
  private async isAssignable(category: CategoryWithMembers, userId: string): Promise<boolean> {
    const candidate = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, active: true } });
    return canPickRecipient(toPolicyCategory(category), candidate);
  }

  /** Photos de preuve : téléversées par l'utilisateur, provisoires ou déjà rattachées à cette demande. */
  private async validProofCount(
    user: AuthenticatedUser,
    request: Request,
    proofFileIds: string[] | undefined,
  ): Promise<number> {
    if (!proofFileIds?.length) return 0;
    const files = await this.prisma.file.findMany({ where: { id: { in: proofFileIds } } });
    const valid = files.filter(
      (f) =>
        f.kind === 'PHOTO' &&
        f.uploaderId === user.id &&
        (f.requestId === null || f.requestId === request.id),
    );
    if (valid.length !== new Set(proofFileIds).size) {
      throw fieldError('proofFileIds', 'Photo introuvable. Reprenez la photo puis réessayez.');
    }
    return valid.length;
  }

  /** Destinataires des notifications — contracts/realtime-events.md §Qui est notifié. */
  private async notify(
    tx: Prisma.TransactionClient,
    before: Pick<Request, 'assigneeId'>,
    after: Request,
    category: CategoryWithMembers,
    result: SuccessfulTransition,
    actorId: string | null,
  ): Promise<Notification[]> {
    const managers = category.managers.map((m) => m.userId);
    const urgent = after.priority === 'URGENT';
    const send = (users: Array<string | null>, type: NotificationType) =>
      this.notifications.notifyInTx(tx, users, actorId, { type, requestId: after.id, priority: after.priority });

    switch (result.steps[0].action) {
      case 'SUBMIT':
        return result.to === 'SENT'
          ? send([after.assigneeId], urgent ? 'URGENT' : 'REQUEST_NEW')
          : send(managers, urgent ? 'URGENT' : 'REQUEST_NEW');
      case 'APPROVE':
      case 'REASSIGN':
        return [
          ...(await send([after.requesterId], 'STATUS_CHANGED')),
          ...(await send([after.assigneeId], urgent ? 'URGENT' : 'ASSIGNED')),
        ];
      case 'REJECT':
      case 'DECLINE':
        return send([after.requesterId], 'REJECTED');
      case 'CANCEL':
        return send(before.assigneeId ? [before.assigneeId] : managers, 'CANCELLED');
      case 'REQUEST_CORRECTION':
        return send([after.assigneeId], 'TO_CORRECT');
      case 'CLOSE':
      case 'VALIDATE_FINAL':
        return send([after.requesterId, after.assigneeId], 'CLOSED');
      case 'COMPLETE':
        if (result.to === 'CLOSED') return send([after.requesterId, after.assigneeId], 'CLOSED');
        return [
          ...(await send([after.requesterId], 'STATUS_CHANGED')),
          ...(result.to === 'PENDING_FINAL_VALIDATION' ? await send(managers, 'STATUS_CHANGED') : []),
        ];
      default:
        return send([after.requesterId], 'STATUS_CHANGED');
    }
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
