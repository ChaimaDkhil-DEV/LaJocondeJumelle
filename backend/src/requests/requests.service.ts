import { Injectable } from '@nestjs/common';
import { Prisma, type Request } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { buildPage, decodeCursor, parseLimit, type Page } from '../common/pagination';
import { PrismaService } from '../common/prisma.service';
import { FileStorageService } from '../files/file-storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SuperAdminAlertsService } from '../notifications/super-admin-alerts.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SettingsService } from '../settings/settings.service';
import { allowedActions, canCreateInCategory, canPickRecipient, canReadRequest } from './domain/access-policy';
import { applyAction, type TransitionResult } from './domain/request-state-machine';
import { NO_DEADLINE, nextDeadlineState } from './domain/deadlines';
import { visibleRequestsWhere } from './domain/visibility';
import { RequestTransitionsService } from './request-transitions.service';
import {
  RequestPolicyLoader,
  toPolicyCategory,
  toPolicyRequest,
  type CategoryWithMembers,
  type RequestRulesSnapshot,
} from './request-policy.loader';
import type { ChangePriorityDto, CreateRequestDto, ListRequestsQuery, UpdateDraftDto } from './requests.dto';
import {
  REQUEST_INCLUDE,
  toRequestDetail,
  toRequestSummary,
  type RequestDetail,
  type RequestSummary,
} from './requests.mapper';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RequestContext {
  ip: string | null;
  route: string;
  method: string;
}

function fieldError(field: string, message: string): AppException {
  return new AppException('VALIDATION_ERROR', { fields: [{ field, messages: [message] }] });
}

function formatReference(number: number, date: Date): string {
  return `D-${date.getUTCFullYear()}-${String(number).padStart(6, '0')}`;
}

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: RequestPolicyLoader,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly storage: FileStorageService,
    private readonly transitions: RequestTransitionsService,
    private readonly realtime: RealtimeService,
    private readonly superAdminAlerts: SuperAdminAlertsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Création (US1)
  // ---------------------------------------------------------------------------

  /** Crée une demande (brouillon ou envoyée). Renvoie `created: false` pour un renvoi du même clientId. */
  async create(
    user: AuthenticatedUser,
    dto: CreateRequestDto,
    ctx: RequestContext,
  ): Promise<{ created: boolean; detail: RequestDetail }> {
    const existing = await this.findByClientId(user.id, dto.clientId);
    if (existing) return { created: false, detail: await this.detail(user, existing.id, ctx) };

    const category = await this.policies.category(dto.categoryId);
    if (!category || category.kind !== 'WORK') throw fieldError('categoryId', 'Catégorie introuvable.');
    const policyCategory = toPolicyCategory(category);
    if (!canCreateInCategory(user, policyCategory)) throw new AppException('FORBIDDEN');

    if (dto.asDraft && !(await this.settings.get('draftsEnabled'))) {
      throw fieldError('asDraft', 'Les brouillons sont désactivés.');
    }
    // En circuit B, le demandeur ne choisit pas l'agent : la demande va aux responsables.
    if (category.circuit === 'B_ADMIN_VALIDATION' && dto.recipientId) {
      throw new AppException('RECIPIENT_NOT_ALLOWED');
    }
    const recipientId = await this.routedRecipient(user, category, dto.recipientId);

    const voice = dto.voiceFileId ? await this.ownProvisionalVoice(user, dto.voiceFileId) : null;
    const recipientAllowed = await this.recipientAllowed(category, recipientId);
    if (dto.asDraft && recipientId && !recipientAllowed) throw new AppException('RECIPIENT_NOT_ALLOWED');

    const rules = await this.policies.rulesSnapshot(category, dto.priority);
    const now = new Date();
    let transition: TransitionResult | null = null;
    if (!dto.asDraft) {
      transition = applyAction(
        {
          status: 'DRAFT',
          rules,
          hasVoice: voice !== null,
          hasDescription: Boolean(dto.description),
          assigneeId: null,
          autoCloseAt: null,
        },
        'SUBMIT',
        { actors: ['REQUESTER'], now, assigneeId: recipientId ?? undefined, assigneeAllowed: recipientAllowed },
      );
      if (!transition.ok) throw new AppException(transition.code);
    }

    const deadline = transition?.ok
      ? nextDeadlineState(NO_DEADLINE, transition.steps, rules, now, await this.settings.get('deadlineWarnPercent'))
      : NO_DEADLINE;

    try {
      const { request, pending } = await this.prisma.$transaction(async (tx) => {
        const number = await this.nextNumber(tx);
        const assigneeId = transition?.ok ? (transition.assigneeId ?? null) : (recipientId ?? null);
        const request = await tx.request.create({
          data: {
            number,
            reference: formatReference(number, now),
            clientId: dto.clientId,
            title: dto.title,
            description: dto.description ?? null,
            voiceFileId: voice?.id ?? null,
            categoryId: category.id,
            priority: dto.priority,
            requesterId: user.id,
            assigneeId,
            status: transition?.ok ? transition.to : 'DRAFT',
            rulesSnapshot: rules as unknown as Prisma.InputJsonValue,
            createdAt: now,
            submittedAt: transition ? now : null,
            assignedAt: transition?.ok && transition.assigneeId ? now : null,
            ...deadline,
          },
        });
        if (voice) await tx.file.update({ where: { id: voice.id }, data: { requestId: request.id } });
        const pending = transition?.ok
          ? await this.transitions.recordTransition(tx, { assigneeId: null }, request, category, transition, user.id)
          : [];
        return { request, pending };
      });
      await this.notifications.flushAfterCommit(pending);
      return { created: true, detail: await this.detail(user, request.id, ctx) };
    } catch (error) {
      // Deux envois simultanés du même clientId : on renvoie la demande déjà créée.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.findByClientId(user.id, dto.clientId);
        if (duplicate) return { created: false, detail: await this.detail(user, duplicate.id, ctx) };
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Lecture
  // ---------------------------------------------------------------------------

  async detail(user: AuthenticatedUser, id: string, ctx: RequestContext): Promise<RequestDetail> {
    const request = UUID.test(id)
      ? await this.prisma.request.findUnique({ where: { id }, include: REQUEST_INCLUDE })
      : null;
    const category = request && (await this.policies.category(request.categoryId));
    if (!request || !category) {
      await this.logDenied(user, id, ctx);
      throw new AppException('NOT_FOUND');
    }
    const policyCategory = toPolicyCategory(category);
    if (!canReadRequest(user, toPolicyRequest(request), policyCategory)) {
      await this.logDenied(user, id, ctx);
      throw new AppException('NOT_FOUND');
    }
    const unread = await this.unreadCounts(user.id, [request.id]);
    return toRequestDetail(request, user, policyCategory, unread.get(request.id) ?? 0);
  }

  async list(user: AuthenticatedUser, query: ListRequestsQuery): Promise<Page<RequestSummary>> {
    const limit = parseLimit(query.limit);
    const conditions: Prisma.RequestWhereInput[] = [visibleRequestsWhere(user)];

    switch (query.scope ?? 'all') {
      case 'mine':
        conditions.push({ requesterId: user.id });
        break;
      case 'assigned':
        conditions.push({ assigneeId: user.id, status: { not: 'DRAFT' } });
        break;
      case 'managed':
        if (user.role !== 'SUPER_ADMIN') conditions.push({ category: { managers: { some: { userId: user.id } } } });
        break;
      case 'all':
        break;
    }
    if (query.status?.length) conditions.push({ status: { in: query.status } });
    if (query.priority?.length) conditions.push({ priority: { in: query.priority } });
    if (query.categoryId?.length) conditions.push({ categoryId: { in: query.categoryId } });
    if (query.assigneeId) conditions.push({ assigneeId: query.assigneeId });
    if (query.requesterId) conditions.push({ requesterId: query.requesterId });
    if (query.from) conditions.push({ createdAt: { gte: new Date(query.from) } });
    if (query.to) {
      // Une date seule (AAAA-MM-JJ) inclut toute la journée.
      const end = new Date(query.to);
      if (query.to.length === 10) end.setUTCDate(end.getUTCDate() + 1);
      conditions.push({ createdAt: query.to.length === 10 ? { lt: end } : { lte: end } });
    }
    if (query.overdue) conditions.push({ overdueStage: query.overdue === 'true' ? { not: null } : null });
    if (query.q) conditions.push({ title: { contains: query.q, mode: 'insensitive' } });
    if (query.cursor) {
      const { createdAt, id } = decodeCursor(query.cursor);
      conditions.push({ OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] });
    }

    const rows = await this.prisma.request.findMany({
      where: { AND: conditions },
      include: REQUEST_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = buildPage(rows, limit);
    const unread = await this.unreadCounts(
      user.id,
      page.items.map((r) => r.id),
    );
    return {
      items: page.items.map((r) => toRequestSummary(r, unread.get(r.id) ?? 0)),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * Employés auxquels un responsable peut confier la demande (approbation en circuit B, réaffectation) :
   * utilisateurs actifs parmi les destinataires de la catégorie.
   */
  async assignees(
    user: AuthenticatedUser,
    id: string,
    ctx: RequestContext,
  ): Promise<Array<{ id: string; displayName: string; jobTitle: string | null }>> {
    const request = UUID.test(id) ? await this.prisma.request.findUnique({ where: { id } }) : null;
    const category = request && (await this.policies.category(request.categoryId));
    const policyCategory = category && toPolicyCategory(category);
    if (!request || !policyCategory || !canReadRequest(user, toPolicyRequest(request), policyCategory)) {
      await this.logDenied(user, id, ctx);
      throw new AppException('NOT_FOUND');
    }
    const actions = allowedActions(user, toPolicyRequest(request), policyCategory);
    if (!actions.includes('APPROVE') && !actions.includes('REASSIGN')) {
      await this.audit.log('ACCESS_DENIED', {
        actorId: user.id,
        targetType: 'Request',
        targetId: id,
        ip: ctx.ip,
        details: { reason: 'FORBIDDEN_ASSIGNEES', route: ctx.route, method: ctx.method, channel: 'http' },
      });
      throw new AppException('FORBIDDEN');
    }
    return this.prisma.user.findMany({
      where: { active: true, recipientOf: { some: { categoryId: request.categoryId } } },
      select: { id: true, displayName: true, jobTitle: true },
      orderBy: { displayName: 'asc' },
    });
  }

  // ---------------------------------------------------------------------------
  // Historique et priorité (US7)
  // ---------------------------------------------------------------------------

  /**
   * Historique complet et chronologique (FR-029) : auteur (null = système), valeurs avant/après ;
   * les noms des employés affectés sont ajoutés aux identifiants pour l'affichage.
   */
  async history(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    await this.readableRequest(user, id, ctx);
    const events = await this.prisma.requestEvent.findMany({
      where: { requestId: id },
      include: { actor: { select: { id: true, displayName: true } } },
      orderBy: [{ createdAt: 'asc' }, { seq: 'asc' }],
    });

    const assigneeOf = (value: Prisma.JsonValue | null): string | null =>
      value && typeof value === 'object' && !Array.isArray(value) && typeof value.assigneeId === 'string'
        ? value.assigneeId
        : null;
    const ids = new Set(events.flatMap((e) => [assigneeOf(e.fromValue), assigneeOf(e.toValue)]).filter((v): v is string => v !== null));
    const names = new Map(
      (await this.prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, displayName: true } })).map(
        (u) => [u.id, u.displayName],
      ),
    );
    const withName = (value: Prisma.JsonValue | null) => {
      const assigneeId = assigneeOf(value);
      return assigneeId ? { ...(value as Prisma.JsonObject), assigneeName: names.get(assigneeId) ?? null } : value;
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

  /**
   * Changement de priorité (hors machine à états) : demandeur avec PRIORITY_CHANGE_OWN avant
   * acceptation, responsable avec PRIORITY_CHANGE_MANAGED tant que la demande n'est ni terminée ni
   * finale. Les échéances en cours ne sont pas recalculées (instantané des règles, FR-022).
   */
  async changePriority(user: AuthenticatedUser, id: string, dto: ChangePriorityDto, ctx: RequestContext): Promise<RequestDetail> {
    const { request, category } = await this.readableRequest(user, id, ctx);
    if (!allowedActions(user, toPolicyRequest(request), toPolicyCategory(category)).includes('CHANGE_PRIORITY')) {
      await this.audit.log('ACCESS_DENIED', {
        actorId: user.id,
        targetType: 'Request',
        targetId: id,
        ip: ctx.ip,
        details: { reason: 'FORBIDDEN_CHANGE_PRIORITY', route: ctx.route, method: ctx.method, channel: 'http' },
      });
      throw new AppException('FORBIDDEN');
    }
    if (dto.version !== request.version) throw new AppException('STATE_CHANGED');
    if (dto.priority === request.priority) throw fieldError('priority', 'Choisissez une priorité différente.');

    const pending = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.request.updateMany({
        where: { id, version: request.version },
        data: { priority: dto.priority, version: { increment: 1 } },
      });
      if (count === 0) throw new AppException('STATE_CHANGED');
      await tx.requestEvent.create({
        data: {
          requestId: id,
          actorId: user.id,
          type: 'PRIORITY_CHANGED',
          fromValue: { priority: request.priority },
          toValue: { priority: dto.priority },
        },
      });
      // Passage en « Urgente » : alerte du super administrateur, une seule fois par demande.
      return dto.priority === 'URGENT' ? this.superAdminAlerts.alertInTx(tx, id, 'URGENT', user.id) : [];
    });
    await this.notifications.flushAfterCommit(pending);
    this.realtime.emitToUsers(
      [request.requesterId, request.assigneeId, ...category.managers.map((m) => m.userId)],
      'request:updated',
      { requestId: id, status: request.status, version: request.version + 1, overdueStage: request.overdueStage },
    );
    return this.detail(user, id, ctx);
  }

  private async readableRequest(
    user: AuthenticatedUser,
    id: string,
    ctx: RequestContext,
  ): Promise<{ request: Request; category: CategoryWithMembers }> {
    const request = UUID.test(id) ? await this.prisma.request.findUnique({ where: { id } }) : null;
    const category = request && (await this.policies.category(request.categoryId));
    if (!request || !category || !canReadRequest(user, toPolicyRequest(request), toPolicyCategory(category))) {
      await this.logDenied(user, id, ctx);
      throw new AppException('NOT_FOUND');
    }
    return { request, category };
  }

  // ---------------------------------------------------------------------------
  // Brouillons
  // ---------------------------------------------------------------------------

  async updateDraft(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateDraftDto,
    ctx: RequestContext,
  ): Promise<RequestDetail> {
    const draft = await this.ownDraft(user, id, ctx);

    const categoryId = dto.categoryId ?? draft.categoryId;
    const category = await this.policies.category(categoryId);
    if (!category || category.kind !== 'WORK') throw fieldError('categoryId', 'Catégorie introuvable.');
    if (!canCreateInCategory(user, toPolicyCategory(category))) throw new AppException('FORBIDDEN');

    const recipientId = await this.routedRecipient(user, category, dto.recipientId === undefined ? draft.assigneeId : dto.recipientId);
    if (recipientId && !(await this.recipientAllowed(category, recipientId))) {
      throw new AppException('RECIPIENT_NOT_ALLOWED');
    }

    const replaceVoice = dto.voiceFileId !== undefined && dto.voiceFileId !== draft.voiceFileId;
    const newVoice = replaceVoice && dto.voiceFileId ? await this.ownProvisionalVoice(user, dto.voiceFileId) : null;
    const oldVoice = replaceVoice && draft.voiceFileId
      ? await this.prisma.file.findUnique({ where: { id: draft.voiceFileId } })
      : null;

    const priority = dto.priority ?? draft.priority;
    const rules: RequestRulesSnapshot = await this.policies.rulesSnapshot(category, priority);

    await this.prisma.$transaction(async (tx) => {
      await tx.request.update({
        where: { id: draft.id },
        data: {
          title: dto.title ?? draft.title,
          description: dto.description === undefined ? draft.description : dto.description || null,
          categoryId: category.id,
          priority,
          assigneeId: category.circuit === 'A_DIRECT' ? recipientId : null,
          voiceFileId: replaceVoice ? (newVoice?.id ?? null) : draft.voiceFileId,
          rulesSnapshot: rules as unknown as Prisma.InputJsonValue,
        },
      });
      if (newVoice) await tx.file.update({ where: { id: newVoice.id }, data: { requestId: draft.id } });
      if (oldVoice) await tx.file.delete({ where: { id: oldVoice.id } });
    });
    if (oldVoice) await this.storage.remove(oldVoice.storagePath);

    return this.detail(user, draft.id, ctx);
  }

  /** Seul cas de suppression (T19) : un brouillon, par son auteur, avec ses fichiers. */
  async deleteDraft(user: AuthenticatedUser, id: string, ctx: RequestContext): Promise<void> {
    const draft = await this.ownDraft(user, id, ctx);
    const files = await this.prisma.file.findMany({ where: { requestId: draft.id } });
    await this.prisma.$transaction(async (tx) => {
      await tx.request.update({ where: { id: draft.id }, data: { voiceFileId: null } });
      await tx.file.deleteMany({ where: { requestId: draft.id } });
      await tx.request.delete({ where: { id: draft.id } });
    });
    for (const file of files) await this.storage.remove(file.storagePath);
  }

  // ---------------------------------------------------------------------------
  // Outils
  // ---------------------------------------------------------------------------

  private async ownDraft(user: AuthenticatedUser, id: string, ctx: RequestContext): Promise<Request> {
    const request = UUID.test(id) ? await this.prisma.request.findUnique({ where: { id } }) : null;
    if (!request || request.requesterId !== user.id) {
      await this.logDenied(user, id, ctx);
      throw new AppException('NOT_FOUND');
    }
    if (request.status !== 'DRAFT') throw new AppException('INVALID_TRANSITION');
    return request;
  }

  private findByClientId(requesterId: string, clientId: string) {
    return this.prisma.request.findUnique({ where: { requesterId_clientId: { requesterId, clientId } } });
  }

  /** Le vocal doit être un fichier VOICE provisoire téléversé par l'utilisateur lui-même. */
  private async ownProvisionalVoice(user: AuthenticatedUser, fileId: string) {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.uploaderId !== user.id || file.kind !== 'VOICE' || file.requestId !== null) {
      throw fieldError('voiceFileId', 'Message vocal introuvable. Enregistrez-le de nouveau.');
    }
    return file;
  }

  /**
   * Destinataire selon le mode de routage : en DIRECT, le service de la catégorie quand il est seul
   * (destinataire actif unique) et que le demandeur n'en a pas choisi ; en PEER, un autre enseignant
   * que le demandeur, toujours choisi. En VIA_ADMIN, l'administration affecte à l'approbation.
   */
  private async routedRecipient(user: AuthenticatedUser, category: CategoryWithMembers, requested: string | null | undefined) {
    if (category.routingMode === 'PEER' && requested === user.id) {
      throw fieldError('recipientId', 'Choisissez un autre enseignant que vous-même.');
    }
    if (category.routingMode !== 'DIRECT' || requested) return requested ?? null;
    const service = await this.prisma.user.findMany({
      where: { active: true, recipientOf: { some: { categoryId: category.id } } },
      select: { id: true },
      take: 2,
    });
    return service.length === 1 ? service[0].id : null;
  }

  private async recipientAllowed(category: CategoryWithMembers, recipientId: string | null | undefined) {
    if (!recipientId) return false;
    const candidate = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, active: true },
    });
    return canPickRecipient(toPolicyCategory(category), candidate);
  }

  private async nextNumber(tx: Prisma.TransactionClient): Promise<number> {
    const [row] = await tx.$queryRaw<Array<{ n: number }>>`
      SELECT nextval(pg_get_serial_sequence('"Request"', 'number'))::int AS n`;
    return row.n;
  }

  private async unreadCounts(userId: string, requestIds: string[]): Promise<Map<string, number>> {
    if (requestIds.length === 0) return new Map();
    const groups = await this.prisma.notification.groupBy({
      by: ['requestId'],
      where: { userId, readAt: null, requestId: { in: requestIds } },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.requestId, g._count._all]));
  }

  private async logDenied(user: AuthenticatedUser, id: string, ctx: RequestContext): Promise<void> {
    await this.audit.log('ACCESS_DENIED', {
      actorId: user.id,
      targetType: 'Request',
      targetId: id.slice(0, 64),
      ip: ctx.ip,
      details: { reason: 'NOT_VISIBLE', route: ctx.route, method: ctx.method, channel: 'http' },
    });
  }
}
