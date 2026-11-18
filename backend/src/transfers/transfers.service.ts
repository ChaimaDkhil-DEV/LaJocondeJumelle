import { Injectable } from '@nestjs/common';
import { Prisma, type Notification, type NotificationType, type RequestTransferCancelCause } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { buildPage, decodeCursor, parseLimit, type Page } from '../common/pagination';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { canReadRequest } from '../requests/domain/access-policy';
import { isEligibleAdmin, isEligibleOwner, isFinishedStatus, isOwnable, isTransferable, type OwnershipCategory } from '../requests/domain/ownership';
import { RequestOwnershipService } from '../requests/request-ownership.service';
import { RequestPolicyLoader, toPolicyCategory, toPolicyRequest } from '../requests/request-policy.loader';
import type { RequestContext } from '../requests/requests.service';
import { SettingsService } from '../settings/settings.service';
import { canAnswer, canCancel, isOverdue, newOwnerOf } from './domain/transfer-policy';
import type { ProposeTransferDto, TransfersQuery } from './transfers.dto';
import {
  ADMIN_REF,
  eligibleAdminsWhere,
  TRANSFER_INCLUDE,
  toTransferView,
  type AdminRefView,
  type TransferView,
  type TransferWithRelations,
} from './transfers.mapper';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINUTE_MS = 60_000;
const FINISHED = ['CLOSED', 'REJECTED', 'CANCELLED'] as const;

/** Le responsable a changé, ou la demande s'est terminée, entre la proposition et son acceptation. */
class OwnerChangedError extends Error {}

function fieldError(field: string, message: string): AppException {
  return new AppException('VALIDATION_ERROR', { fields: [{ field, messages: [message] }] });
}

/**
 * Propositions de transfert entre administrateurs (018, US2 et US3) : délégation et demande de reprise.
 * Le responsable d'une demande ne change jamais sans l'acceptation du destinataire. Chaque changement
 * d'état est une mise à jour conditionnelle sur `status = PENDING`, dans une transaction avec
 * l'historique, l'audit et les notifications (research R2) ; les notifications ne partent qu'après
 * validation de la transaction.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: RequestPolicyLoader,
    private readonly ownership: RequestOwnershipService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly settings: SettingsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Proposer
  // ---------------------------------------------------------------------------

  /** Collègues à qui le responsable peut proposer une délégation : admins actifs de la catégorie, sans lui. */
  async candidates(user: AuthenticatedUser, requestId: string, ctx: RequestContext): Promise<AdminRefView[]> {
    const { request, category } = await this.readableRequest(user, requestId, ctx);
    if (!isEligibleAdmin(user, category) || request.adminOwnerId !== user.id) {
      await this.logDenied(user, 'Request', requestId, ctx, 'FORBIDDEN_TRANSFER_CANDIDATES');
      throw new AppException('FORBIDDEN');
    }
    return this.prisma.user.findMany({
      where: eligibleAdminsWhere(request, user.id),
      select: ADMIN_REF.select,
      orderBy: { displayName: 'asc' },
    });
  }

  /**
   * Enregistre une proposition. Délégation : par le responsable, vers un collègue éligible qu'il choisit.
   * Demande de reprise : par un collègue éligible, toujours adressée au responsable (jamais à un
   * destinataire transmis par le navigateur).
   */
  async propose(user: AuthenticatedUser, requestId: string, dto: ProposeTransferDto, ctx: RequestContext): Promise<TransferView> {
    const { request, category } = await this.readableRequest(user, requestId, ctx);
    if (!isEligibleAdmin(user, category)) {
      await this.logDenied(user, 'Request', requestId, ctx, 'FORBIDDEN_TRANSFER');
      throw new AppException('FORBIDDEN');
    }
    if (!isTransferable(request, category) || request.adminOwnerId === null) throw new AppException('TRANSFER_NOT_POSSIBLE');
    const ownerId = request.adminOwnerId;

    let recipientId: string;
    if (dto.type === 'DELEGATION_REQUEST') {
      if (ownerId !== user.id) {
        await this.logDenied(user, 'Request', requestId, ctx, 'FORBIDDEN_DELEGATION');
        throw new AppException('FORBIDDEN');
      }
      if (!dto.recipientId || dto.recipientId === user.id) throw new AppException('TRANSFER_RECIPIENT_INVALID');
      recipientId = dto.recipientId;
    } else {
      if (dto.recipientId !== undefined) throw fieldError('recipientId', 'Une demande de reprise s’adresse toujours à la personne qui a pris la demande en charge.');
      if (ownerId === user.id) throw new AppException('TRANSFER_RECIPIENT_INVALID');
      // Le demandeur ne reprend jamais sa propre demande (séparation des tâches, FR-034).
      if (request.requesterId === user.id) {
        await this.logDenied(user, 'Request', requestId, ctx, 'OWN_REQUEST');
        throw new AppException('FORBIDDEN');
      }
      recipientId = ownerId;
    }
    if (!(await this.eligible(recipientId, request, category))) throw new AppException('TRANSFER_RECIPIENT_INVALID');

    const reason = dto.reason?.trim();
    if (!reason) throw new AppException('REASON_REQUIRED');
    if (await this.prisma.requestTransfer.count({ where: { requestId, status: 'PENDING' } })) throw new AppException('TRANSFER_PENDING_EXISTS');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (await this.settings.get('transferResponseMinutes')) * MINUTE_MS);
    try {
      const { transfer, pending } = await this.prisma.$transaction(async (tx) => {
        const created = await tx.requestTransfer.create({
          data: { requestId, initiatorId: user.id, recipientId, currentOwnerId: ownerId, type: dto.type, reason, expiresAt },
          include: TRANSFER_INCLUDE,
        });
        await this.audit.log(
          'REQUEST_MANAGED',
          {
            actorId: user.id,
            ip: ctx.ip,
            targetType: 'Request',
            targetId: requestId,
            details: { action: 'TRANSFER_PROPOSED', type: dto.type, transferId: created.id, reasonGiven: true },
          },
          tx,
        );
        const pending = await this.notifications.notifyInTx(tx, [recipientId], user.id, {
          type: dto.type === 'DELEGATION_REQUEST' ? 'TRANSFER_DELEGATION_REQUESTED' : 'TRANSFER_TAKEOVER_REQUESTED',
          requestId,
          priority: request.priority,
        });
        return { transfer: created, pending };
      });
      await this.published(transfer, pending);
      return toTransferView(transfer, user, now);
    } catch (error) {
      // Deux propositions simultanées : l'index unique partiel de la base n'en laisse passer qu'une (FR-013).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppException('TRANSFER_PENDING_EXISTS');
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Répondre, annuler
  // ---------------------------------------------------------------------------

  /**
   * Acceptation (FR-012). Dans une seule transaction : la proposition passe à ACCEPTED si elle est encore
   * en attente et adressée à l'utilisateur ; la demande change de responsable si celui-ci est toujours
   * celui de la proposition et si elle n'est pas terminée ; historique, audit, notification. Si l'une des
   * deux écritures ne trouve rien, rien n'est conservé.
   */
  async accept(user: AuthenticatedUser, transferId: string, ctx: RequestContext): Promise<TransferView> {
    const transfer = await this.answerable(user, transferId, ctx, 'ACCEPT');
    const now = new Date();
    const newOwnerId = newOwnerOf(transfer);
    const category = await this.categoryOf(transfer.request.categoryId);
    if (!category || !(await this.eligible(newOwnerId, transfer.request, category))) {
      await this.cancelBySystem(transfer, 'PARTICIPANT_UNAVAILABLE', now);
      throw new AppException('TRANSFER_RECIPIENT_INVALID');
    }

    let pending: Notification[];
    try {
      pending = await this.prisma.$transaction(async (tx) => {
        const answered = await tx.requestTransfer.updateMany({
          where: { id: transfer.id, status: 'PENDING', recipientId: user.id },
          data: { status: 'ACCEPTED', respondedAt: now },
        });
        if (answered.count === 0) throw new AppException('TRANSFER_ALREADY_ANSWERED');
        const moved = await tx.request.updateMany({
          where: { id: transfer.requestId, adminOwnerId: transfer.currentOwnerId, status: { notIn: [...FINISHED] } },
          data: { adminOwnerId: newOwnerId, adminOwnedAt: now, version: { increment: 1 } },
        });
        if (moved.count === 0) throw new OwnerChangedError();
        await this.ownership.recordInTx(tx, {
          requestId: transfer.requestId,
          adminId: newOwnerId,
          previousAdminId: transfer.currentOwnerId,
          actorId: user.id,
          operation: 'TRANSFERRED',
          reason: transfer.reason,
          transferId: transfer.id,
        });
        await this.audit.log(
          'REQUEST_MANAGED',
          {
            actorId: user.id,
            ip: ctx.ip,
            targetType: 'Request',
            targetId: transfer.requestId,
            details: {
              action: 'TRANSFER_ACCEPTED',
              type: transfer.type,
              transferId: transfer.id,
              before: { adminOwnerId: transfer.currentOwnerId },
              after: { adminOwnerId: newOwnerId },
            },
          },
          tx,
        );
        return this.notifications.notifyInTx(tx, [transfer.initiatorId], user.id, {
          type: 'TRANSFER_ACCEPTED',
          requestId: transfer.requestId,
          priority: transfer.request.priority,
        });
      });
    } catch (error) {
      if (!(error instanceof OwnerChangedError)) throw error;
      // La transaction est annulée : la proposition est restée en attente. Elle est caduque, on la clôt avec sa cause.
      const current = await this.prisma.request.findUnique({ where: { id: transfer.requestId }, select: { status: true } });
      await this.cancelBySystem(transfer, current && isFinishedStatus(current.status) ? 'REQUEST_FINISHED' : 'OWNER_CHANGED', now);
      throw new AppException('TRANSFER_OWNER_CHANGED');
    }

    const updated = await this.prisma.requestTransfer.findUniqueOrThrow({ where: { id: transfer.id }, include: TRANSFER_INCLUDE });
    await this.published(updated, pending);
    // La demande change d'espace : listes et détail relus par ses lecteurs.
    const request = await this.prisma.request.findUniqueOrThrow({ where: { id: transfer.requestId } });
    this.realtime.emitRequestUpdated(
      [request.requesterId, request.assigneeId, transfer.currentOwnerId, newOwnerId, ...category.managerIds],
      { requestId: request.id, status: request.status, version: request.version, overdueStage: request.overdueStage },
    );
    return toTransferView(updated, user, now);
  }

  /** Refus, motif facultatif : le responsable ne change pas. */
  async reject(user: AuthenticatedUser, transferId: string, responseReason: string | undefined, ctx: RequestContext): Promise<TransferView> {
    const transfer = await this.answerable(user, transferId, ctx, 'REJECT');
    const now = new Date();
    const reason = responseReason?.trim() || null;
    const pending = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.requestTransfer.updateMany({
        where: { id: transfer.id, status: 'PENDING', recipientId: user.id },
        data: { status: 'REJECTED', respondedAt: now, responseReason: reason },
      });
      if (count === 0) throw new AppException('TRANSFER_ALREADY_ANSWERED');
      await this.auditTransfer(tx, transfer, 'TRANSFER_REJECTED', user.id, ctx.ip, { reasonGiven: reason !== null });
      return this.notifications.notifyInTx(tx, [transfer.initiatorId], user.id, {
        type: 'TRANSFER_REJECTED',
        requestId: transfer.requestId,
        priority: transfer.request.priority,
      });
    });
    return this.reloaded(transfer.id, user, pending, now);
  }

  /** Annulation par l'auteur, tant que la proposition est en attente. */
  async cancel(user: AuthenticatedUser, transferId: string, ctx: RequestContext): Promise<TransferView> {
    const transfer = await this.visible(user, transferId, ctx);
    if (transfer.initiatorId !== user.id) {
      await this.logDenied(user, 'RequestTransfer', transferId, ctx, 'FORBIDDEN_TRANSFER_CANCEL');
      throw new AppException('FORBIDDEN');
    }
    if (!canCancel(user.id, transfer)) throw new AppException('TRANSFER_ALREADY_ANSWERED');
    const now = new Date();
    const pending = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.requestTransfer.updateMany({
        where: { id: transfer.id, status: 'PENDING', initiatorId: user.id },
        data: { status: 'CANCELLED', cancelCause: 'INITIATOR', cancelledAt: now },
      });
      if (count === 0) throw new AppException('TRANSFER_ALREADY_ANSWERED');
      await this.auditTransfer(tx, transfer, 'TRANSFER_CANCELLED', user.id, ctx.ip, { reason: 'INITIATOR' });
      return this.notifications.notifyInTx(tx, [transfer.recipientId], user.id, {
        type: 'TRANSFER_CANCELLED',
        requestId: transfer.requestId,
        priority: transfer.request.priority,
      });
    });
    return this.reloaded(transfer.id, user, pending, now);
  }

  // ---------------------------------------------------------------------------
  // Lecture
  // ---------------------------------------------------------------------------

  async one(user: AuthenticatedUser, transferId: string, ctx: RequestContext): Promise<TransferView> {
    return toTransferView(await this.visible(user, transferId, ctx), user, new Date());
  }

  /** Propositions adressées à l'utilisateur (`received`) ou faites par lui (`sent`) ; en attente par défaut. */
  list(user: AuthenticatedUser, box: 'received' | 'sent', query: TransfersQuery): Promise<Page<TransferView>> {
    return this.page(user, query, {
      ...(box === 'received' ? { recipientId: user.id } : { initiatorId: user.id }),
      ...(query.status === 'all' ? {} : { status: 'PENDING' }),
    });
  }

  /** Historique : les propositions de l'utilisateur, envoyées ou reçues, qui ne sont plus en attente. */
  history(user: AuthenticatedUser, query: TransfersQuery): Promise<Page<TransferView>> {
    return this.page(user, query, { status: { not: 'PENDING' }, OR: [{ initiatorId: user.id }, { recipientId: user.id }] });
  }

  private async page(user: AuthenticatedUser, query: TransfersQuery, where: Prisma.RequestTransferWhereInput): Promise<Page<TransferView>> {
    const limit = parseLimit(query.limit);
    const conditions: Prisma.RequestTransferWhereInput[] = [where];
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

  // ---------------------------------------------------------------------------
  // Expiration et propositions devenues caduques (job planifié)
  // ---------------------------------------------------------------------------

  /**
   * Un passage (FR-018, research R8). Les propositions dont le délai est atteint passent « expirée » ;
   * celles dont un participant n'est plus un admin actif de la catégorie, dont la demande est terminée
   * ou dont le responsable a changé sont annulées avec leur cause. Aucun transfert n'a lieu. Chaque
   * proposition est traitée par une mise à jour conditionnelle : un second passage ne refait rien.
   */
  async expireDue(now = new Date()): Promise<{ expired: number; cancelled: number }> {
    const pending = await this.prisma.requestTransfer.findMany({
      where: { status: 'PENDING' },
      include: TRANSFER_INCLUDE,
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    let expired = 0;
    let cancelled = 0;
    for (const transfer of pending) {
      if (isOverdue(transfer, now)) {
        if (await this.expire(transfer, now)) expired += 1;
        continue;
      }
      const cause = await this.staleCause(transfer);
      if (cause && (await this.cancelBySystem(transfer, cause, now))) cancelled += 1;
    }
    return { expired, cancelled };
  }

  /** Raison pour laquelle une proposition en attente ne peut plus aboutir, ou null. */
  private async staleCause(transfer: TransferWithRelations): Promise<RequestTransferCancelCause | null> {
    if (isFinishedStatus(transfer.request.status)) return 'REQUEST_FINISHED';
    if (transfer.request.adminOwnerId !== transfer.currentOwnerId) return 'OWNER_CHANGED';
    const category = await this.categoryOf(transfer.request.categoryId);
    if (!category) return 'PARTICIPANT_UNAVAILABLE';
    for (const userId of new Set([transfer.initiatorId, transfer.recipientId])) {
      if (!(await this.eligible(userId, transfer.request, category))) return 'PARTICIPANT_UNAVAILABLE';
    }
    return null;
  }

  private async expire(transfer: TransferWithRelations, now: Date): Promise<boolean> {
    const pending = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.requestTransfer.updateMany({
        where: { id: transfer.id, status: 'PENDING' },
        data: { status: 'EXPIRED', cancelledAt: now },
      });
      if (count === 0) return null;
      await this.auditTransfer(tx, transfer, 'TRANSFER_EXPIRED', null, null, {});
      return this.notifications.notifyInTx(tx, [transfer.initiatorId, transfer.recipientId], null, {
        type: 'TRANSFER_EXPIRED',
        requestId: transfer.requestId,
        priority: transfer.request.priority,
      });
    });
    if (pending === null) return false;
    await this.published({ ...transfer, status: 'EXPIRED' }, pending);
    return true;
  }

  /** Annulation tracée par le système (cause enregistrée) ; les deux participants sont prévenus. */
  private async cancelBySystem(transfer: TransferWithRelations, cause: RequestTransferCancelCause, now: Date): Promise<boolean> {
    const pending = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.requestTransfer.updateMany({
        where: { id: transfer.id, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelCause: cause, cancelledAt: now },
      });
      if (count === 0) return null;
      await this.auditTransfer(tx, transfer, 'TRANSFER_CANCELLED', null, null, { reason: cause });
      return this.notifications.notifyInTx(tx, [transfer.initiatorId, transfer.recipientId], null, {
        type: 'TRANSFER_CANCELLED',
        requestId: transfer.requestId,
        priority: transfer.request.priority,
      });
    });
    if (pending === null) return false;
    await this.published({ ...transfer, status: 'CANCELLED' }, pending);
    return true;
  }

  // ---------------------------------------------------------------------------

  /** Demande lisible par l'utilisateur, avec sa catégorie ; sinon 404 journalisé, sans rien révéler. */
  private async readableRequest(user: AuthenticatedUser, requestId: string, ctx: RequestContext) {
    const request = UUID.test(requestId) ? await this.prisma.request.findUnique({ where: { id: requestId } }) : null;
    const loaded = request && (await this.policies.category(request.categoryId));
    const category = loaded && toPolicyCategory(loaded);
    if (!request || !category || !canReadRequest(user, toPolicyRequest(request), category)) {
      await this.logDenied(user, 'Request', requestId, ctx, 'NOT_VISIBLE');
      throw new AppException('NOT_FOUND');
    }
    return { request, category };
  }

  /**
   * Proposition lisible : ses participants, les admins de la catégorie de la demande et le super
   * administrateur. Sinon 404 journalisé.
   */
  private async visible(user: AuthenticatedUser, transferId: string, ctx: RequestContext): Promise<TransferWithRelations> {
    const transfer = UUID.test(transferId)
      ? await this.prisma.requestTransfer.findUnique({ where: { id: transferId }, include: TRANSFER_INCLUDE })
      : null;
    const participant = transfer && [transfer.initiatorId, transfer.recipientId, transfer.currentOwnerId].includes(user.id);
    let allowed = Boolean(transfer) && user.active && (user.role === 'SUPER_ADMIN' || Boolean(participant));
    if (transfer && !allowed && user.active) {
      const category = await this.categoryOf(transfer.request.categoryId);
      allowed = category !== null && isOwnable(transfer.request, category) && isEligibleAdmin(user, category);
    }
    if (!transfer || !allowed) {
      await this.logDenied(user, 'RequestTransfer', transferId, ctx, 'NOT_VISIBLE');
      throw new AppException('NOT_FOUND');
    }
    return transfer;
  }

  /** Proposition à laquelle l'utilisateur peut répondre maintenant ; une proposition échue est marquée expirée. */
  private async answerable(user: AuthenticatedUser, transferId: string, ctx: RequestContext, action: 'ACCEPT' | 'REJECT'): Promise<TransferWithRelations> {
    const transfer = await this.visible(user, transferId, ctx);
    if (transfer.recipientId !== user.id) {
      await this.logDenied(user, 'RequestTransfer', transferId, ctx, `FORBIDDEN_TRANSFER_${action}`);
      throw new AppException('FORBIDDEN');
    }
    const now = new Date();
    if (isOverdue(transfer, now)) await this.expire(transfer, now);
    if (!canAnswer(user.id, transfer, now)) throw new AppException('TRANSFER_ALREADY_ANSWERED');
    return transfer;
  }

  private async categoryOf(categoryId: string): Promise<(OwnershipCategory & { managerIds: ReadonlySet<string> }) | null> {
    const category = await this.policies.category(categoryId);
    return category ? toPolicyCategory(category) : null;
  }

  /** Compte actif, de rôle Admin, admin de la catégorie, autre que le demandeur : peut recevoir ou garder la demande. */
  private async eligible(userId: string, request: { requesterId: string }, category: OwnershipCategory): Promise<boolean> {
    const candidate = UUID.test(userId)
      ? await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, active: true } })
      : null;
    return candidate !== null && isEligibleOwner(candidate, request, category);
  }

  private async auditTransfer(
    tx: Prisma.TransactionClient,
    transfer: TransferWithRelations,
    action: string,
    actorId: string | null,
    ip: string | null,
    extra: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.log(
      'REQUEST_MANAGED',
      { actorId, ip, targetType: 'Request', targetId: transfer.requestId, details: { action, type: transfer.type, transferId: transfer.id, ...extra } },
      tx,
    );
  }

  /** Après validation de la transaction : notifications, puis rafraîchissement des écrans concernés. */
  private async published(
    transfer: Pick<TransferWithRelations, 'id' | 'requestId' | 'status' | 'initiatorId' | 'recipientId' | 'currentOwnerId'>,
    pending: Notification[],
  ): Promise<void> {
    await this.notifications.flushAfterCommit(pending);
    this.realtime.emitTransferUpdated([transfer.initiatorId, transfer.recipientId, transfer.currentOwnerId], {
      transferId: transfer.id,
      requestId: transfer.requestId,
      status: transfer.status,
    });
  }

  private async reloaded(transferId: string, user: AuthenticatedUser, pending: Notification[], now: Date): Promise<TransferView> {
    const updated = await this.prisma.requestTransfer.findUniqueOrThrow({ where: { id: transferId }, include: TRANSFER_INCLUDE });
    await this.published(updated, pending);
    return toTransferView(updated, user, now);
  }

  private async logDenied(user: AuthenticatedUser, targetType: string, id: string, ctx: RequestContext, reason: string): Promise<void> {
    await this.audit.log('ACCESS_DENIED', {
      actorId: user.id,
      targetType,
      targetId: id.slice(0, 64),
      ip: ctx.ip,
      details: { reason, route: ctx.route, method: ctx.method, channel: 'http' },
    });
  }
}

/** Types de notification émis par ce service (vérification à la compilation). */
export const TRANSFER_NOTIFICATION_TYPES: readonly NotificationType[] = [
  'TRANSFER_TAKEOVER_REQUESTED',
  'TRANSFER_DELEGATION_REQUESTED',
  'TRANSFER_ACCEPTED',
  'TRANSFER_REJECTED',
  'TRANSFER_CANCELLED',
  'TRANSFER_EXPIRED',
];
