import { Injectable } from '@nestjs/common';
import type { Notification, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { buildPage, decodeCursor, parseLimit, type Page } from '../common/pagination';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { isEligibleAdmin, isFinishedStatus, isOwnable } from '../requests/domain/ownership';
import { RequestOwnershipService } from '../requests/request-ownership.service';
import { RequestPolicyLoader, toPolicyCategory } from '../requests/request-policy.loader';
import { REQUEST_INCLUDE, toRequestSummary, type RequestDetail, type RequestSummary } from '../requests/requests.mapper';
import { RequestsService, type RequestContext } from '../requests/requests.service';
import type { AllTransfersQuery, ReassignOwnerDto, SupervisedRequestsQuery } from './transfers.dto';
import { TRANSFER_INCLUDE, toTransferView, type TransferView } from './transfers.mapper';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FINISHED = ['CLOSED', 'REJECTED', 'CANCELLED'] as const;

/** Demande vue par le super administrateur : le résumé habituel et l'état du compte qui en a la charge. */
export type SupervisedRequest = RequestSummary & {
  /** Vrai si le compte responsable est désactivé, n'est plus Admin ou n'est plus admin de la catégorie. */
  adminOwnerUnavailable: boolean;
};

export interface AdministratorLoad {
  id: string;
  displayName: string;
  jobTitle: string | null;
  active: boolean;
  ownedActive: number;
  ownedFinished: number;
  transfersPending: number;
  lastOperationAt: Date | null;
}

/** Demandes qui peuvent avoir un responsable : équivalent SQL de isOwnable (requests/domain/ownership.ts). */
const OWNABLE: Prisma.RequestWhereInput = { kind: 'WORK', status: { not: 'DRAFT' }, category: { routingMode: 'VIA_ADMIN' } };

/**
 * Supervision du super administrateur (018, US5) : toutes les demandes « via l'administration » et leur
 * responsable, la charge de chaque administrateur, toutes les propositions de transfert, et la
 * réattribution administrative. Le super administrateur n'y traite aucune demande : il ne change que le
 * responsable, jamais le statut, l'employé affecté ni les délais (FR-028).
 */
@Injectable()
export class SupervisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: RequestPolicyLoader,
    private readonly ownership: RequestOwnershipService,
    private readonly requests: RequestsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Toutes les demandes « via l'administration », filtrées, les plus récentes d'abord. */
  async supervised(query: SupervisedRequestsQuery): Promise<Page<SupervisedRequest>> {
    const limit = parseLimit(query.limit);
    const conditions: Prisma.RequestWhereInput[] = [OWNABLE];
    if (query.ownership === 'free') conditions.push({ adminOwnerId: null });
    if (query.ownership === 'owned') conditions.push({ adminOwnerId: { not: null } });
    if (query.state === 'active') conditions.push({ status: { notIn: [...FINISHED] } });
    if (query.state === 'finished') conditions.push({ status: { in: [...FINISHED] } });
    if (query.adminId) conditions.push({ adminOwnerId: query.adminId });
    if (query.status) conditions.push({ status: query.status });
    if (query.priority) conditions.push({ priority: query.priority });
    if (query.from) conditions.push({ createdAt: { gte: new Date(query.from) } });
    if (query.to) {
      // Une date seule (AAAA-MM-JJ) inclut toute la journée.
      const end = new Date(query.to);
      if (query.to.length === 10) end.setUTCDate(end.getUTCDate() + 1);
      conditions.push({ createdAt: query.to.length === 10 ? { lt: end } : { lte: end } });
    }
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

    // Responsables encore disponibles : compte actif, de rôle Admin, admin de la catégorie de la demande.
    const ownerIds = [...new Set(page.items.flatMap((r) => (r.adminOwnerId ? [r.adminOwnerId] : [])))];
    const owners = ownerIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ownerIds }, active: true, role: 'ADMIN' },
          select: { id: true, managerOf: { select: { categoryId: true } } },
        })
      : [];
    const available = new Set(owners.flatMap((o) => o.managerOf.map((m) => `${o.id}:${m.categoryId}`)));
    return {
      items: page.items.map((r) => ({
        ...toRequestSummary(r, 0),
        adminOwnerUnavailable: r.adminOwnerId !== null && !available.has(`${r.adminOwnerId}:${r.categoryId}`),
      })),
      nextCursor: page.nextCursor,
    };
  }

  /** Comptes de rôle Admin, actifs ou non, avec leur charge. Nom, fonction et état du compte seulement. */
  async administrators(): Promise<AdministratorLoad[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, displayName: true, jobTitle: true, active: true },
      orderBy: { displayName: 'asc' },
    });
    return Promise.all(
      admins.map(async (admin) => {
        const [ownedActive, ownedFinished, transfersPending, last] = await Promise.all([
          this.prisma.request.count({ where: { AND: [OWNABLE, { adminOwnerId: admin.id, status: { notIn: [...FINISHED] } }] } }),
          this.prisma.request.count({ where: { AND: [OWNABLE, { adminOwnerId: admin.id, status: { in: [...FINISHED] } }] } }),
          this.prisma.requestTransfer.count({ where: { status: 'PENDING', OR: [{ initiatorId: admin.id }, { recipientId: admin.id }] } }),
          this.prisma.requestAssignment.findFirst({
            where: { OR: [{ adminId: admin.id }, { previousAdminId: admin.id }, { actorId: admin.id }] },
            orderBy: { seq: 'desc' },
            select: { createdAt: true },
          }),
        ]);
        return { ...admin, ownedActive, ownedFinished, transfersPending, lastOperationAt: last?.createdAt ?? null };
      }),
    );
  }

  /** Toutes les propositions de transfert, par statut ; aucune action n'y est offerte au super administrateur. */
  async transfers(user: AuthenticatedUser, query: AllTransfersQuery): Promise<Page<TransferView>> {
    const limit = parseLimit(query.limit);
    const conditions: Prisma.RequestTransferWhereInput[] = query.status ? [{ status: query.status }] : [];
    if (query.cursor) {
      const { createdAt, id } = decodeCursor(query.cursor);
      conditions.push({ OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] });
    }
    const rows = await this.prisma.requestTransfer.findMany({
      where: { AND: conditions },
      include: TRANSFER_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = buildPage(rows, limit);
    const now = new Date();
    return { items: page.items.map((t) => toTransferView(t, user, now)), nextCursor: page.nextCursor };
  }

  /**
   * Réattribution administrative (FR-028) : confie la demande à un autre administrateur éligible, ou la
   * libère (`adminId` null). Sans l'accord des intéressés, mais avec un motif. Dans une transaction :
   * changement conditionnel du responsable, historique (l'ancien responsable y reste), annulation de la
   * proposition de transfert en attente, notifications, audit.
   */
  async reassign(user: AuthenticatedUser, requestId: string, dto: ReassignOwnerDto, ctx: RequestContext): Promise<RequestDetail> {
    const request = UUID.test(requestId) ? await this.prisma.request.findUnique({ where: { id: requestId } }) : null;
    const loaded = request && (await this.policies.category(request.categoryId));
    const category = loaded && toPolicyCategory(loaded);
    if (!request || !category || !isOwnable(request, category)) throw new AppException('NOT_FOUND');
    if (isFinishedStatus(request.status)) throw new AppException('TRANSFER_NOT_POSSIBLE');
    const reason = dto.reason?.trim();
    if (!reason) throw new AppException('REASON_REQUIRED');

    const previousId = request.adminOwnerId;
    const targetId = dto.adminId;
    if (targetId === null && previousId === null) throw new AppException('TRANSFER_NOT_POSSIBLE');
    if (targetId !== null) {
      const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true, role: true, active: true } });
      if (!target || targetId === previousId || !isEligibleAdmin(target, category)) throw new AppException('TRANSFER_RECIPIENT_INVALID');
    }

    const now = new Date();
    const { pending, cancelled } = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.request.updateMany({
        where: { id: requestId, adminOwnerId: previousId, status: { notIn: [...FINISHED] } },
        data: { adminOwnerId: targetId, adminOwnedAt: targetId === null ? null : now, version: { increment: 1 } },
      });
      if (count === 0) throw new AppException('STATE_CHANGED');

      await this.ownership.recordInTx(
        tx,
        targetId === null
          ? { requestId, adminId: previousId as string, previousAdminId: previousId, actorId: user.id, operation: 'RELEASED', reason }
          : { requestId, adminId: targetId, previousAdminId: previousId, actorId: user.id, operation: 'REASSIGNED', reason },
      );
      await this.audit.log(
        'REQUEST_MANAGED',
        {
          actorId: user.id,
          ip: ctx.ip,
          targetType: 'Request',
          targetId: requestId,
          details: {
            action: targetId === null ? 'OWNER_RELEASED' : 'OWNER_REASSIGNED',
            before: { adminOwnerId: previousId },
            after: { adminOwnerId: targetId },
            reasonGiven: true,
          },
        },
        tx,
      );

      const notifications: Notification[] = [];
      const cancelledTransfers = await this.ownership.cancelPendingTransfersInTx(tx, requestId, 'REASSIGNED_BY_SUPER_ADMIN', now);
      for (const transfer of cancelledTransfers) {
        await this.audit.log(
          'REQUEST_MANAGED',
          {
            actorId: user.id,
            ip: ctx.ip,
            targetType: 'Request',
            targetId: requestId,
            details: { action: 'TRANSFER_CANCELLED', transferId: transfer.id, reason: 'REASSIGNED_BY_SUPER_ADMIN' },
          },
          tx,
        );
        notifications.push(
          ...(await this.notifications.notifyInTx(tx, [transfer.initiatorId, transfer.recipientId], user.id, {
            type: 'TRANSFER_CANCELLED',
            requestId,
            priority: request.priority,
          })),
        );
      }
      notifications.push(
        ...(await this.notifications.notifyInTx(tx, [previousId, targetId], user.id, {
          type: 'ADMIN_OWNER_REASSIGNED',
          requestId,
          priority: request.priority,
        })),
      );
      return { pending: notifications, cancelled: cancelledTransfers };
    });

    await this.notifications.flushAfterCommit(pending);
    for (const transfer of cancelled) {
      this.realtime.emitTransferUpdated([transfer.initiatorId, transfer.recipientId, transfer.currentOwnerId], {
        transferId: transfer.id,
        requestId,
        status: 'CANCELLED',
      });
    }
    this.realtime.emitRequestUpdated([request.requesterId, request.assigneeId, previousId, targetId, ...category.managerIds], {
      requestId,
      status: request.status,
      version: request.version + 1,
      overdueStage: request.overdueStage,
    });
    return this.requests.detail(user, requestId, ctx);
  }
}
