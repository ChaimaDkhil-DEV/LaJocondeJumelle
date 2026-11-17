import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { buildPage, decodeCursor, MAX_PAGE_SIZE, parseLimit, type Page } from '../common/pagination';
import { PrismaService } from '../common/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { canReadRequest } from '../requests/domain/access-policy';
import { canClaim, isEligibleAdmin, isOwnable } from '../requests/domain/ownership';
import { RequestOwnershipService } from '../requests/request-ownership.service';
import { RequestPolicyLoader, toPolicyCategory, toPolicyRequest } from '../requests/request-policy.loader';
import { REQUEST_INCLUDE, toRequestSummary, type RequestDetail, type RequestSummary } from '../requests/requests.mapper';
import { RequestsService, type RequestContext } from '../requests/requests.service';
import type { OwnedRequestsQuery, OwnedScope, PageQuery } from './transfers.dto';
import { ASSIGNMENT_INCLUDE, toAssignmentView, type AssignmentView } from './transfers.mapper';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FINISHED = ['CLOSED', 'REJECTED', 'CANCELLED'] as const;

/** Demande de la file commune : le résumé habituel, la description (utile avant de prendre en charge) et la version à renvoyer. */
export type QueueItem = RequestSummary & { description: string | null; version: number };

export interface WorkspaceSummary {
  available: number;
  mine: number;
  active: number;
  finished: number;
  transfersReceivedPending: number;
  transfersSentPending: number;
}

/**
 * Espace de travail des administrateurs (018, US1) : file commune, prise en charge, demandes dont
 * l'utilisateur connecté est responsable, historique des responsables. L'identité vient toujours de la
 * session ; aucune méthode ne reçoit l'identifiant d'un autre administrateur.
 */
@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: RequestPolicyLoader,
    private readonly ownership: RequestOwnershipService,
    private readonly requests: RequestsService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * File commune : demandes de travail « via l'administration », en attente de validation, sans
   * responsable. Un admin n'y voit que ses catégories ; le super administrateur la voit entière.
   * Équivalent SQL de canSeeInCommonQueue (requests/domain/ownership.ts).
   */
  private queueWhere(user: AuthenticatedUser): Prisma.RequestWhereInput {
    if (!user.active || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) return { id: { in: [] } };
    return {
      kind: 'WORK',
      status: 'PENDING_ADMIN_VALIDATION',
      adminOwnerId: null,
      category: {
        routingMode: 'VIA_ADMIN',
        ...(user.role === 'ADMIN' ? { managers: { some: { userId: user.id } } } : {}),
      },
    };
  }

  private ownedWhere(user: AuthenticatedUser, scope: OwnedScope): Prisma.RequestWhereInput {
    return {
      adminOwnerId: user.id,
      ...(scope === 'active' ? { status: { notIn: [...FINISHED] } } : {}),
      ...(scope === 'finished' ? { status: { in: [...FINISHED] } } : {}),
    };
  }

  /**
   * Urgentes d'abord, puis les plus anciennes : l'ordre dans lequel les traiter. La file n'est pas
   * paginée par curseur ; au-delà de la taille de page maximale, le compteur donne le total.
   */
  async available(user: AuthenticatedUser, query: PageQuery): Promise<Page<QueueItem>> {
    const limit = query.limit ? parseLimit(query.limit) : MAX_PAGE_SIZE;
    const rows = await this.prisma.request.findMany({
      where: this.queueWhere(user),
      include: REQUEST_INCLUDE,
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    const unread = await this.unreadCounts(
      user.id,
      rows.map((r) => r.id),
    );
    return {
      items: rows.map((r) => ({ ...toRequestSummary(r, unread.get(r.id) ?? 0), description: r.description, version: r.version })),
      nextCursor: null,
    };
  }

  /** Demandes dont l'utilisateur connecté est le responsable actuel. */
  async mine(user: AuthenticatedUser, query: OwnedRequestsQuery): Promise<Page<RequestSummary>> {
    const limit = parseLimit(query.limit);
    const conditions: Prisma.RequestWhereInput[] = [this.ownedWhere(user, query.scope ?? 'all')];
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
    return { items: page.items.map((r) => toRequestSummary(r, unread.get(r.id) ?? 0)), nextCursor: page.nextCursor };
  }

  /** Compteurs du tableau de bord : chacun compte exactement la liste qu'il ouvre (FR-023). */
  async summary(user: AuthenticatedUser): Promise<WorkspaceSummary> {
    const [available, mine, active, finished, transfersReceivedPending, transfersSentPending] = await Promise.all([
      this.prisma.request.count({ where: this.queueWhere(user) }),
      this.prisma.request.count({ where: this.ownedWhere(user, 'all') }),
      this.prisma.request.count({ where: this.ownedWhere(user, 'active') }),
      this.prisma.request.count({ where: this.ownedWhere(user, 'finished') }),
      this.prisma.requestTransfer.count({ where: { recipientId: user.id, status: 'PENDING' } }),
      this.prisma.requestTransfer.count({ where: { initiatorId: user.id, status: 'PENDING' } }),
    ]);
    return { available, mine, active, finished, transfersReceivedPending, transfersSentPending };
  }

  /**
   * « Prendre en charge » (FR-003). Ordre des contrôles : demande lisible (sinon 404) → compte admin de
   * la catégorie (le super administrateur n'est jamais responsable : 403) → déjà prise (409 explicite) →
   * encore en attente → version. L'écriture elle-même est conditionnelle : de deux appels simultanés,
   * un seul gagne.
   */
  async claim(user: AuthenticatedUser, id: string, version: number, ctx: RequestContext): Promise<RequestDetail> {
    const request = UUID.test(id) ? await this.prisma.request.findUnique({ where: { id } }) : null;
    const category = request && (await this.policies.category(request.categoryId));
    const policyCategory = category && toPolicyCategory(category);
    if (!request || !category || !policyCategory || !canReadRequest(user, toPolicyRequest(request), policyCategory)) {
      await this.logDenied(user, id, ctx, 'NOT_VISIBLE');
      throw new AppException('NOT_FOUND');
    }
    if (!isEligibleAdmin(user, policyCategory)) {
      await this.logDenied(user, id, ctx, 'FORBIDDEN_CLAIM');
      throw new AppException('FORBIDDEN');
    }
    if (request.adminOwnerId !== null) throw new AppException('REQUEST_ALREADY_CLAIMED');
    if (!canClaim(user, request, policyCategory)) throw new AppException('INVALID_TRANSITION');
    if (version !== request.version) throw new AppException('STATE_CHANGED');

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (!(await this.ownership.claimInTx(tx, request, user.id, now))) {
        const current = await tx.request.findUnique({ where: { id }, select: { adminOwnerId: true } });
        throw new AppException(current?.adminOwnerId ? 'REQUEST_ALREADY_CLAIMED' : 'STATE_CHANGED');
      }
      await this.audit.log(
        'REQUEST_MANAGED',
        {
          actorId: user.id,
          ip: ctx.ip,
          targetType: 'Request',
          targetId: id,
          details: { action: 'CLAIM', before: { adminOwnerId: null }, after: { adminOwnerId: user.id } },
        },
        tx,
      );
    });
    // La demande quitte la file commune de tous les admins de la catégorie (relue par REST).
    this.realtime.emitRequestUpdated([request.requesterId, request.assigneeId, user.id, ...category.managers.map((m) => m.userId)], {
      requestId: id,
      status: request.status,
      version: request.version + 1,
      overdueStage: request.overdueStage,
    });
    return this.requests.detail(user, id, ctx);
  }

  /** Historique des responsables d'une demande : admins de sa catégorie et super administrateur. */
  async assignments(user: AuthenticatedUser, requestId: string, ctx: RequestContext): Promise<AssignmentView[]> {
    const request = UUID.test(requestId) ? await this.prisma.request.findUnique({ where: { id: requestId } }) : null;
    const category = request && (await this.policies.category(request.categoryId));
    const policyCategory = category && toPolicyCategory(category);
    const allowed =
      request &&
      policyCategory &&
      isOwnable(request, policyCategory) &&
      user.active &&
      (user.role === 'SUPER_ADMIN' || isEligibleAdmin(user, policyCategory));
    if (!allowed) {
      await this.logDenied(user, requestId, ctx, 'NOT_VISIBLE');
      throw new AppException('NOT_FOUND');
    }
    const rows = await this.prisma.requestAssignment.findMany({
      where: { requestId },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { seq: 'asc' },
    });
    return rows.map(toAssignmentView);
  }

  /** « Mon historique » : les opérations qui ont fait de l'utilisateur un responsable ou mis fin à sa responsabilité. */
  async myAssignments(user: AuthenticatedUser, query: PageQuery): Promise<Page<AssignmentView>> {
    const limit = parseLimit(query.limit);
    const conditions: Prisma.RequestAssignmentWhereInput[] = [{ OR: [{ adminId: user.id }, { previousAdminId: user.id }] }];
    if (query.cursor) {
      const { createdAt, id } = decodeCursor(query.cursor);
      conditions.push({ OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] });
    }
    const rows = await this.prisma.requestAssignment.findMany({
      where: { AND: conditions },
      include: ASSIGNMENT_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = buildPage(rows, limit);
    return { items: page.items.map(toAssignmentView), nextCursor: page.nextCursor };
  }

  private async unreadCounts(userId: string, requestIds: string[]): Promise<Map<string, number>> {
    if (requestIds.length === 0) return new Map();
    const rows = await this.prisma.notification.groupBy({
      by: ['requestId'],
      where: { userId, readAt: null, requestId: { in: requestIds } },
      _count: { _all: true },
    });
    return new Map(rows.flatMap((r) => (r.requestId ? [[r.requestId, r._count._all] as const] : [])));
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
