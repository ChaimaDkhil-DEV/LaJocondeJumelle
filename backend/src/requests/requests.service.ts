import { Injectable } from '@nestjs/common';
import { Prisma, type Request } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { buildPage, decodeCursor, parseLimit, type Page } from '../common/pagination';
import { PrismaService } from '../common/prisma.service';
import { FileStorageService } from '../files/file-storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { canCreateInCategory, canPickRecipient, canReadRequest } from './domain/access-policy';
import { applyAction, type TransitionResult } from './domain/request-state-machine';
import { visibleRequestsWhere } from './domain/visibility';
import { RequestTransitionsService } from './request-transitions.service';
import {
  RequestPolicyLoader,
  toPolicyCategory,
  toPolicyRequest,
  type CategoryWithMembers,
  type RequestRulesSnapshot,
} from './request-policy.loader';
import type { CreateRequestDto, ListRequestsQuery, UpdateDraftDto } from './requests.dto';
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
    if (!category) throw fieldError('categoryId', 'Catégorie introuvable.');
    const policyCategory = toPolicyCategory(category);
    if (!canCreateInCategory(user, policyCategory)) throw new AppException('FORBIDDEN');

    if (dto.asDraft && !(await this.settings.get('draftsEnabled'))) {
      throw fieldError('asDraft', 'Les brouillons sont désactivés.');
    }
    // En circuit B, le demandeur ne choisit pas l'agent : la demande va aux responsables.
    if (category.circuit === 'B_ADMIN_VALIDATION' && dto.recipientId) {
      throw new AppException('RECIPIENT_NOT_ALLOWED');
    }

    const voice = dto.voiceFileId ? await this.ownProvisionalVoice(user, dto.voiceFileId) : null;
    const recipientAllowed = await this.recipientAllowed(category, dto.recipientId);
    if (dto.asDraft && dto.recipientId && !recipientAllowed) throw new AppException('RECIPIENT_NOT_ALLOWED');

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
        { actors: ['REQUESTER'], now, assigneeId: dto.recipientId, assigneeAllowed: recipientAllowed },
      );
      if (!transition.ok) throw new AppException(transition.code);
    }

    try {
      const { request, pending } = await this.prisma.$transaction(async (tx) => {
        const number = await this.nextNumber(tx);
        const assigneeId = transition?.ok ? (transition.assigneeId ?? null) : (dto.recipientId ?? null);
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
    if (!category) throw fieldError('categoryId', 'Catégorie introuvable.');
    if (!canCreateInCategory(user, toPolicyCategory(category))) throw new AppException('FORBIDDEN');

    const recipientId = dto.recipientId === undefined ? draft.assigneeId : dto.recipientId;
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
