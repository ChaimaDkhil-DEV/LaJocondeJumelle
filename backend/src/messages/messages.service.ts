import { Injectable } from '@nestjs/common';
import { Prisma, type FileKind, type Request } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { buildPage, decodeCursor, parseLimit, type Page } from '../common/pagination';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SuperAdminAlertsService } from '../notifications/super-admin-alerts.service';
import { RealtimeService } from '../realtime/realtime.service';
import { canReadRequest, canWriteInThread, isReadOnlyStatus } from '../requests/domain/access-policy';
import {
  RequestPolicyLoader,
  toPolicyCategory,
  toPolicyRequest,
  type CategoryWithMembers,
} from '../requests/request-policy.loader';
import type { RequestContext } from '../requests/requests.service';
import { SettingsService } from '../settings/settings.service';
import type { CreateMessageDto, ListMessagesQuery } from './messages.dto';
import { MESSAGE_INCLUDE, toMessageResponse, type MessageResponse } from './messages.mapper';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fieldError(field: string, message: string): AppException {
  return new AppException('VALIDATION_ERROR', { fields: [{ field, messages: [message] }] });
}

/**
 * Fil de discussion d'une demande (US3) : messages texte, vocaux et pièces jointes, jamais modifiés
 * ni supprimés (FR-012). Lecture : mêmes droits que la demande ; écriture : participants, demande
 * ni brouillon ni finale.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: RequestPolicyLoader,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly superAdminAlerts: SuperAdminAlertsService,
  ) {}

  async list(
    user: AuthenticatedUser,
    requestId: string,
    query: ListMessagesQuery,
    ctx: RequestContext,
  ): Promise<Page<MessageResponse>> {
    await this.readable(user, requestId, ctx);
    const limit = parseLimit(query.limit);
    const where: Prisma.MessageWhereInput = { requestId };
    if (query.cursor) {
      const { createdAt, id } = decodeCursor(query.cursor);
      where.OR = [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }];
    }
    const rows = await this.prisma.message.findMany({
      where,
      include: MESSAGE_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = buildPage(rows, limit);
    return { items: page.items.map(toMessageResponse), nextCursor: page.nextCursor };
  }

  /** Publie un message ; `created: false` pour un renvoi du même clientId. */
  async create(
    user: AuthenticatedUser,
    requestId: string,
    dto: CreateMessageDto,
    ctx: RequestContext,
  ): Promise<{ created: boolean; message: MessageResponse }> {
    const { request, category } = await this.readable(user, requestId, ctx);

    const existing = await this.findByClientId(user.id, dto.clientId);
    if (existing) return { created: false, message: existing };

    if (!canWriteInThread(user, toPolicyRequest(request), toPolicyCategory(category))) {
      await this.logDenied(user, requestId, ctx, 'THREAD_CLOSED');
      throw new AppException(
        'FORBIDDEN',
        undefined,
        isReadOnlyStatus(request.status)
          ? 'Cette demande est terminée : il n’est plus possible d’y répondre.'
          : 'Vous consultez cette demande : seuls le demandeur et la personne affectée y échangent.',
      );
    }

    const attachmentIds = [...new Set(dto.attachmentFileIds ?? [])];
    if (!dto.text && !dto.voiceFileId && attachmentIds.length === 0) {
      throw new AppException('CONTENT_REQUIRED', undefined, 'Écrivez un message, enregistrez un vocal ou joignez un fichier.');
    }
    const max = await this.settings.get('attachmentMaxPerMessage');
    if (attachmentIds.length > max) {
      throw fieldError('attachmentFileIds', `${max} pièces jointes au maximum par message.`);
    }
    if (dto.voiceFileId && !(await this.ownFreeFiles(user, request, [dto.voiceFileId], ['VOICE']))) {
      throw fieldError('voiceFileId', 'Message vocal introuvable. Enregistrez-le de nouveau.');
    }
    if (attachmentIds.length > 0 && !(await this.ownFreeFiles(user, request, attachmentIds, ['PHOTO', 'DOCUMENT']))) {
      throw fieldError('attachmentFileIds', 'Pièce jointe introuvable. Ajoutez-la de nouveau.');
    }

    try {
      const { messageId, pending } = await this.prisma.$transaction(async (tx) => {
        const message = await tx.message.create({
          data: {
            requestId,
            authorId: user.id,
            clientId: dto.clientId,
            kind: dto.voiceFileId ? 'VOICE' : 'TEXT',
            text: dto.text ?? null,
            voiceFileId: dto.voiceFileId ?? null,
          },
        });
        if (dto.voiceFileId) {
          await tx.file.update({ where: { id: dto.voiceFileId }, data: { requestId } });
        }
        if (attachmentIds.length > 0) {
          await tx.file.updateMany({ where: { id: { in: attachmentIds } }, data: { requestId, messageId: message.id } });
        }

        await tx.requestEvent.create({
          data: { requestId, actorId: user.id, type: 'MESSAGE_ADDED', toValue: { messageId: message.id, kind: message.kind } },
        });
        const files = await tx.file.findMany({
          where: { id: { in: [...(dto.voiceFileId ? [dto.voiceFileId] : []), ...attachmentIds] } },
          select: { id: true, kind: true },
        });
        for (const file of files) {
          await tx.requestEvent.create({
            data: { requestId, actorId: user.id, type: 'FILE_ADDED', toValue: { fileId: file.id, kind: file.kind, messageId: message.id } },
          });
        }

        // Super administrateurs : seulement sur une demande urgente ou en retard (super-admin-policy).
        const supervisors = await this.superAdminAlerts.messageSupervisors(tx, request);
        const pending = await this.notifications.notifyInTx(tx, [...this.participants(request, category), ...supervisors], user.id, {
          type: 'MESSAGE_NEW',
          requestId,
          priority: request.priority,
        });
        return { messageId: message.id, pending };
      });
      await this.notifications.flushAfterCommit(pending);
      // Tous les lecteurs de la demande sauf l'auteur rechargent le fil.
      this.realtime.emitToUsers(
        [request.requesterId, request.assigneeId, ...category.managers.map((m) => m.userId)].filter((id) => id !== user.id),
        'message:new',
        { requestId, messageId },
      );
      const message = await this.prisma.message.findUniqueOrThrow({ where: { id: messageId }, include: MESSAGE_INCLUDE });
      return { created: true, message: toMessageResponse(message) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.findByClientId(user.id, dto.clientId);
        if (duplicate) return { created: false, message: duplicate };
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------

  /**
   * Participants notifiés d'un nouveau message : demandeur et employé affecté ; tant qu'aucun employé
   * n'est affecté (circuit B en attente), les admins de la catégorie.
   */
  private participants(request: Request, category: CategoryWithMembers): string[] {
    if (request.assigneeId) return [request.requesterId, request.assigneeId];
    return [request.requesterId, ...category.managers.map((m) => m.userId)];
  }

  private async readable(
    user: AuthenticatedUser,
    requestId: string,
    ctx: RequestContext,
  ): Promise<{ request: Request; category: CategoryWithMembers }> {
    const request = UUID.test(requestId) ? await this.prisma.request.findUnique({ where: { id: requestId } }) : null;
    const category = request && (await this.policies.category(request.categoryId));
    if (!request || !category || !canReadRequest(user, toPolicyRequest(request), toPolicyCategory(category))) {
      await this.logDenied(user, requestId, ctx, 'NOT_VISIBLE');
      throw new AppException('NOT_FOUND');
    }
    return { request, category };
  }

  /** Fichiers téléversés par l'utilisateur, du bon type, pas encore utilisés ailleurs. */
  private async ownFreeFiles(
    user: AuthenticatedUser,
    request: Request,
    ids: string[],
    kinds: FileKind[],
  ): Promise<boolean> {
    const files = await this.prisma.file.findMany({
      where: { id: { in: ids } },
      include: { voiceOfRequest: { select: { id: true } }, voiceOfMessage: { select: { id: true } } },
    });
    return (
      files.length === ids.length &&
      files.every(
        (f) =>
          f.uploaderId === user.id &&
          kinds.includes(f.kind) &&
          (f.requestId === null || f.requestId === request.id) &&
          f.messageId === null &&
          !f.isCompletionProof &&
          !f.voiceOfRequest &&
          !f.voiceOfMessage,
      )
    );
  }

  private async findByClientId(authorId: string, clientId: string): Promise<MessageResponse | null> {
    const message = await this.prisma.message.findUnique({
      where: { authorId_clientId: { authorId, clientId } },
      include: MESSAGE_INCLUDE,
    });
    return message ? toMessageResponse(message) : null;
  }

  private async logDenied(user: AuthenticatedUser, requestId: string, ctx: RequestContext, reason: string): Promise<void> {
    await this.audit.log('ACCESS_DENIED', {
      actorId: user.id,
      targetType: 'Request',
      targetId: requestId.slice(0, 64),
      ip: ctx.ip,
      details: { reason, route: ctx.route, method: ctx.method, channel: 'http' },
    });
  }
}
