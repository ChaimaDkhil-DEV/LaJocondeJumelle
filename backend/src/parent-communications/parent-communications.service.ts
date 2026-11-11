import { Inject, Injectable } from '@nestjs/common';
import type {
  CommunicationChannel,
  Notification,
  NotificationType,
  ParentCommunicationEventType,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { NotificationsService } from '../notifications/notifications.service';
import {
  canEdit,
  decisionBlocked,
  missingContent,
  nextStatus,
  type CommunicationAction,
} from './domain/communication-workflow';
import { sendMode } from './domain/conversation-access';
import type { DecisionDto, EditMessageDto, ToValidateQuery } from './parent-communications.dto';

/** Événement outbox publié quand un message de l'administration devient visible du parent (015, FR-009 ; 017). */
export const COMMUNICATION_APPROVED_EVENT = 'PARENT_COMMUNICATION_APPROVED';

export interface ActionContext {
  actor: AuthenticatedUser;
  ip: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXCERPT_MAX = 140;
const PERSON = { select: { id: true, displayName: true } } as const;

const DETAIL_INCLUDE = {
  authorUser: PERSON,
  decidedBy: PERSON,
  draftVoice: { select: { id: true, durationSeconds: true } },
  conversation: {
    select: {
      id: true,
      type: true,
      status: true,
      student: { select: { id: true, firstName: true, lastName: true, class: { select: { id: true, name: true } } } },
      guardian: { select: { id: true, firstName: true, lastName: true, relationship: true } },
      teacher: PERSON,
    },
  },
  revisions: { orderBy: { number: 'asc' }, include: { voiceFile: { select: { durationSeconds: true } } } },
  events: { orderBy: { createdAt: 'asc' }, include: { actor: PERSON } },
  deliveries: { orderBy: { channel: 'asc' }, select: { channel: true, status: true, attempts: true, updatedAt: true } },
} satisfies Prisma.ParentCommunicationInclude;

type DetailRow = Prisma.ParentCommunicationGetPayload<{ include: typeof DETAIL_INCLUDE }>;

const seconds = (value: Prisma.Decimal | null | undefined) =>
  value === null || value === undefined ? null : Number(value);

const DECISION_EVENT: Record<
  DecisionDto['action'],
  { action: CommunicationAction; event: ParentCommunicationEventType; notify: NotificationType }
> = {
  APPROVE: { action: 'APPROVE', event: 'APPROVED', notify: 'PARENT_COMM_APPROVED' },
  RETURN: { action: 'RETURN', event: 'RETURNED', notify: 'PARENT_COMM_RETURNED' },
  REJECT: { action: 'REJECT', event: 'REJECTED', notify: 'PARENT_COMM_REJECTED' },
};

function upperBound(value: string): Date {
  const end = new Date(value);
  if (value.length === 10) end.setUTCDate(end.getUTCDate() + 1);
  return end;
}

/** Vue de validation d'un message : versions, historique, livraisons externes (administration seulement). */
function toDetail(row: DetailRow, viewerId: string) {
  const current = row.revisions.find((r) => r.number === row.currentRevision);
  const working = row.status === 'RETURNED_FOR_CORRECTION' && row.authorId === viewerId;
  const voiceFileId = working ? row.draftVoiceFileId : (current?.voiceFileId ?? null);
  return {
    id: row.id,
    authorKind: row.author,
    authorLabel: row.authorUser?.displayName ?? '',
    author: row.authorUser,
    mine: row.authorId === viewerId,
    decidable: row.status === 'PENDING_ADMIN_VALIDATION' && row.authorId !== viewerId,
    status: row.status,
    text: working ? row.draftText : (current?.text ?? null),
    voice: voiceFileId
      ? { fileId: voiceFileId, durationSeconds: seconds(working ? row.draftVoice?.durationSeconds : current?.voiceFile?.durationSeconds) }
      : null,
    createdAt: row.revisions[0]?.createdAt ?? row.createdAt,
    submittedAt: row.submittedAt,
    readAt: row.readAt,
    validation: { revision: row.currentRevision, version: row.version, decisionReason: row.decisionReason, decidedAt: row.decidedAt },
    decidedBy: row.decidedBy,
    conversation: row.conversation,
    revisions: row.revisions.map((r) => ({
      number: r.number,
      text: r.text,
      voiceFileId: r.voiceFileId,
      durationSeconds: seconds(r.voiceFile?.durationSeconds),
      createdAt: r.createdAt,
    })),
    events: row.events.map((e) => ({ type: e.type, actor: e.actor, revision: e.revision, reason: e.reason, createdAt: e.createdAt })),
    deliveries: row.deliveries,
  };
}

/**
 * Validation des messages de l'administration aux parents (015, 017 FR-009, FR-010) : « À valider »,
 * décision sur la version examinée, correction après retour, publication vers le parent (notification,
 * livraisons externes, événement outbox). NestJS reste l'unique autorité.
 */
@Injectable()
export class ParentCommunicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Canaux externes activés pour lesquels le représentant a une coordonnée (e-mail, téléphone WhatsApp). */
  channelsFor(guardian: { email: string | null; phone: string | null }): CommunicationChannel[] {
    return this.config.parentCommunicationChannels.filter((channel) =>
      channel === 'EMAIL' ? Boolean(guardian.email) : Boolean(guardian.phone),
    );
  }

  isValidator(user: AuthenticatedUser): boolean {
    return user.active && user.role !== 'PARENT' && user.permissions.has('PARENT_COMMUNICATION_VALIDATE');
  }

  /** Comptes actifs ayant la permission de validation : le super administrateur et les rôles qui l'ont reçue. */
  async validatorIds(tx: Prisma.TransactionClient): Promise<string[]> {
    const roles = (
      await tx.rolePermission.findMany({ where: { permission: 'PARENT_COMMUNICATION_VALIDATE' }, select: { role: true } })
    )
      .map((r) => r.role)
      .filter((role) => role !== 'PARENT');
    const users = await tx.user.findMany({
      where: { active: true, role: { in: ['SUPER_ADMIN', ...roles] } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  /**
   * Publication d'un message de l'administration au parent (envoi direct ou approbation), dans la
   * transaction : notification au compte parent, livraisons par canal, un seul événement outbox (FR-028).
   * n8n n'invite qu'à se connecter : ni texte ni vocal ne quittent l'application.
   */
  async publishInTx(
    tx: Prisma.TransactionClient,
    messageId: string,
    guardianId: string | null,
    revision: number,
    actorId: string,
    at: Date,
  ): Promise<Notification[]> {
    const guardian = guardianId
      ? await tx.guardian.findUnique({
          where: { id: guardianId },
          select: { active: true, email: true, phone: true, user: { select: { id: true, active: true } } },
        })
      : null;
    const parentUserId = guardian?.active && guardian.user?.active ? guardian.user.id : null;
    const created = await this.notifications.notifyCommunicationInTx(tx, [parentUserId], actorId, {
      type: 'PARENT_MESSAGE_NEW',
      communicationId: messageId,
    });
    const channels = guardian?.active ? this.channelsFor(guardian) : [];
    if (channels.length > 0) {
      await tx.parentCommunicationDelivery.createMany({
        data: channels.map((channel) => ({ communicationId: messageId, channel })),
        skipDuplicates: true,
      });
    }
    await tx.outboxEvent.create({
      data: {
        type: COMMUNICATION_APPROVED_EVENT,
        aggregateId: messageId,
        payload: { communicationId: messageId, revision, approvedAt: at.toISOString() },
      },
    });
    return created;
  }

  // ------------------------------------------------------------------ Lecture

  private async detailRow(id: string): Promise<DetailRow | null> {
    return UUID.test(id) ? this.prisma.parentCommunication.findUnique({ where: { id }, include: DETAIL_INCLUDE }) : null;
  }

  /** Messages de l'administration aux parents, en attente par défaut ; archives exclues. */
  async toValidate(user: AuthenticatedUser, query: ToValidateQuery) {
    const rows = await this.prisma.parentCommunication.findMany({
      where: {
        author: 'ADMIN',
        status: query.status ?? 'PENDING_ADMIN_VALIDATION',
        conversation: {
          type: 'PARENT',
          ...(query.studentId ? { studentId: query.studentId } : {}),
          ...(query.classId ? { student: { classId: query.classId } } : {}),
        },
        ...(query.authorId ? { authorId: query.authorId } : {}),
        ...(query.from || query.to
          ? {
              submittedAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lt: upperBound(query.to) } : {}),
              },
            }
          : {}),
      },
      include: DETAIL_INCLUDE,
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    });
    // Liste : sans versions ni historique (le détail les donne).
    return rows.map((row) => {
      const detail = toDetail(row, user.id);
      return {
        id: detail.id,
        status: detail.status,
        author: detail.author,
        mine: detail.mine,
        decidable: detail.decidable,
        conversation: detail.conversation,
        submittedAt: detail.submittedAt,
        validation: detail.validation,
        hasVoice: detail.voice !== null,
        excerpt: detail.text ? detail.text.slice(0, EXCERPT_MAX) : null,
      };
    });
  }

  async messageDetail(user: AuthenticatedUser, id: string) {
    const row = await this.detailRow(id);
    if (!row) throw new AppException('NOT_FOUND');
    return toDetail(row, user.id);
  }

  // ------------------------------------------------------------------ Décision

  /** Représentant encore actif, avec compte parent actif, lié à l'élève actif (FR-022, FR-026). */
  private async guardianStillLinked(conversationId: string): Promise<boolean> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { guardianId: true, studentId: true },
    });
    if (!conversation?.guardianId) return false;
    const count = await this.prisma.guardianStudent.count({
      where: {
        guardianId: conversation.guardianId,
        studentId: conversation.studentId,
        student: { active: true },
        guardian: { active: true, user: { is: { active: true, role: 'PARENT' } } },
      },
    });
    return count > 0;
  }

  /** Écrit avec verrouillage optimiste (version) : 0 ligne → le message a changé entre-temps. */
  private async updateLocked(
    tx: Prisma.TransactionClient,
    id: string,
    version: number,
    where: Prisma.ParentCommunicationWhereInput,
    data: Prisma.ParentCommunicationUncheckedUpdateManyInput,
  ): Promise<boolean> {
    const result = await tx.parentCommunication.updateMany({
      where: { id, version, ...where },
      data: { ...data, version: { increment: 1 } },
    });
    return result.count === 1;
  }

  private assertOpen(row: DetailRow): void {
    const blocked = decisionBlocked(row.conversation);
    if (blocked) throw new AppException(blocked === 'ARCHIVED' ? 'PARENT_COMM_ARCHIVED' : 'PARENT_COMM_CLOSED');
  }

  async decide(id: string, dto: DecisionDto, ctx: ActionContext) {
    const current = await this.detailRow(id);
    if (!current || current.currentRevision === 0) throw new AppException('NOT_FOUND');
    this.assertOpen(current);
    if (current.author !== 'ADMIN') throw new AppException('PARENT_COMM_ALREADY_DECIDED');
    // FR-010 : l'auteur ne décide jamais sur son propre message, même super administrateur.
    if (current.authorId === ctx.actor.id) throw new AppException('PARENT_COMM_SELF_DECISION');
    const reason = dto.reason?.trim() || null;
    if (dto.action !== 'APPROVE' && !reason) throw new AppException('REASON_REQUIRED');
    if (current.status === 'PENDING_ADMIN_VALIDATION' && current.currentRevision !== dto.revision) {
      throw new AppException('PARENT_COMM_REVISION_CHANGED');
    }
    const { action, event, notify } = DECISION_EVENT[dto.action];
    const target = nextStatus(current.status, action);
    if (!target) throw new AppException('PARENT_COMM_ALREADY_DECIDED');
    if (dto.action === 'APPROVE' && !(await this.guardianStillLinked(current.conversation.id)))
      throw new AppException('PARENT_COMM_RECIPIENT_INVALID');

    const now = new Date();
    let created: Notification[] = [];
    await this.prisma.$transaction(async (tx) => {
      const ok = await this.updateLocked(
        tx,
        id,
        dto.version,
        { status: 'PENDING_ADMIN_VALIDATION', currentRevision: dto.revision },
        {
          status: target,
          decidedById: ctx.actor.id,
          decidedAt: now,
          decisionReason: dto.action === 'APPROVE' ? null : reason,
          ...(dto.action === 'APPROVE' ? { approvedRevision: dto.revision } : {}),
        },
      );
      if (!ok) {
        const fresh = await tx.parentCommunication.findUniqueOrThrow({
          where: { id },
          select: { status: true, currentRevision: true },
        });
        throw new AppException(
          fresh.status === 'PENDING_ADMIN_VALIDATION' && fresh.currentRevision !== dto.revision
            ? 'PARENT_COMM_REVISION_CHANGED'
            : 'PARENT_COMM_ALREADY_DECIDED',
        );
      }
      await tx.parentCommunicationEvent.create({
        data: { communicationId: id, type: event, actorId: ctx.actor.id, revision: dto.revision, reason: dto.action === 'APPROVE' ? null : reason },
      });
      await this.audit.log(
        'PARENT_COMMUNICATION_DECIDED',
        {
          actorId: ctx.actor.id,
          targetType: 'ParentCommunication',
          targetId: id,
          ip: ctx.ip,
          details: { decision: dto.action, revision: dto.revision },
        },
        tx,
      );
      created = await this.notifications.notifyCommunicationInTx(tx, [current.authorId], ctx.actor.id, {
        type: notify,
        communicationId: id,
      });
      if (dto.action === 'APPROVE') {
        await tx.conversation.update({ where: { id: current.conversation.id }, data: { lastMessageAt: now } });
        const guardianId = (await tx.conversation.findUniqueOrThrow({ where: { id: current.conversation.id }, select: { guardianId: true } })).guardianId;
        created.push(...(await this.publishInTx(tx, id, guardianId, dto.revision, ctx.actor.id, now)));
      }
    });
    await this.notifications.flushAfterCommit(created);
    return this.messageDetail(ctx.actor, id);
  }

  // ------------------------------------------------------------------ Auteur : correction après retour

  /** Message de l'administration aux parents, dont l'utilisateur est l'auteur. */
  private async own(user: AuthenticatedUser, id: string): Promise<DetailRow> {
    const row = await this.detailRow(id);
    if (!row || row.author !== 'ADMIN') throw new AppException('NOT_FOUND');
    if (row.authorId !== user.id) throw new AppException('FORBIDDEN');
    this.assertOpen(row);
    return row;
  }

  /** Vocal téléversé par l'auteur, rattaché à aucune demande ni à un autre message. */
  async assertOwnVoice(authorId: string, fileId: string, messageId?: string): Promise<void> {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      select: { kind: true, uploaderId: true, requestId: true, messageId: true },
    });
    const usedElsewhere = await this.prisma.parentCommunication.count({
      where: {
        ...(messageId ? { id: { not: messageId } } : {}),
        OR: [{ draftVoiceFileId: fileId }, { revisions: { some: { voiceFileId: fileId } } }],
      },
    });
    if (
      !file ||
      file.kind !== 'VOICE' ||
      file.uploaderId !== authorId ||
      file.requestId !== null ||
      file.messageId !== null ||
      usedElsewhere > 0
    ) {
      throw new AppException('PARENT_COMM_VOICE_INVALID');
    }
  }

  async edit(id: string, dto: EditMessageDto, ctx: ActionContext) {
    const current = await this.own(ctx.actor, id);
    if (!canEdit(current.status)) throw new AppException('PARENT_COMM_NOT_EDITABLE');
    const text = dto.text === undefined ? current.draftText : dto.text?.trim() || null;
    const voiceFileId = dto.voiceFileId === undefined ? current.draftVoiceFileId : dto.voiceFileId;
    if (voiceFileId && voiceFileId !== current.draftVoiceFileId) await this.assertOwnVoice(ctx.actor.id, voiceFileId, id);
    await this.prisma.$transaction(async (tx) => {
      const ok = await this.updateLocked(tx, id, dto.version, { status: current.status }, { draftText: text, draftVoiceFileId: voiceFileId });
      if (!ok) throw new AppException('STATE_CHANGED');
      await tx.parentCommunicationEvent.create({ data: { communicationId: id, type: 'UPDATED', actorId: ctx.actor.id } });
      await this.audit.log(
        'PARENT_COMMUNICATION_CHANGED',
        { actorId: ctx.actor.id, ip: ctx.ip, targetType: 'ParentCommunication', targetId: id, details: { action: 'UPDATED' } },
        tx,
      );
    });
    return this.messageDetail(ctx.actor, id);
  }

  /** Nouvelle soumission après un retour : nouvelle version figée, droits revérifiés (FR-022). */
  async submit(id: string, version: number, ctx: ActionContext) {
    const current = await this.own(ctx.actor, id);
    const target = nextStatus(current.status, 'SUBMIT');
    if (!target) throw new AppException('PARENT_COMM_NOT_EDITABLE');
    if (missingContent({ text: current.draftText, voiceFileId: current.draftVoiceFileId }))
      throw new AppException('PARENT_COMM_INCOMPLETE');
    if (sendMode(ctx.actor, 'PARENT') === 'FORBIDDEN')
      throw new AppException('PARENT_COMM_SEND_FORBIDDEN');
    if (!(await this.guardianStillLinked(current.conversation.id))) throw new AppException('PARENT_COMM_RECIPIENT_INVALID');
    const number = current.currentRevision + 1;
    let created: Notification[] = [];
    await this.prisma.$transaction(async (tx) => {
      const ok = await this.updateLocked(
        tx,
        id,
        version,
        { status: current.status },
        { status: target, currentRevision: number, submittedAt: new Date(), decisionReason: null },
      );
      if (!ok) throw new AppException('STATE_CHANGED');
      await tx.parentCommunicationRevision.create({
        data: { communicationId: id, number, text: current.draftText?.trim() || null, voiceFileId: current.draftVoiceFileId },
      });
      await tx.parentCommunicationEvent.create({ data: { communicationId: id, type: 'SUBMITTED', actorId: ctx.actor.id, revision: number } });
      await this.audit.log(
        'PARENT_COMMUNICATION_CHANGED',
        { actorId: ctx.actor.id, ip: ctx.ip, targetType: 'ParentCommunication', targetId: id, details: { action: 'SUBMITTED', revision: number } },
        tx,
      );
      created = await this.notifications.notifyCommunicationInTx(tx, await this.validatorIds(tx), ctx.actor.id, {
        type: 'PARENT_COMM_TO_VALIDATE',
        communicationId: id,
      });
    });
    await this.notifications.flushAfterCommit(created);
    return this.messageDetail(ctx.actor, id);
  }

  async cancel(id: string, version: number, ctx: ActionContext) {
    const current = await this.own(ctx.actor, id);
    const target = nextStatus(current.status, 'CANCEL');
    if (!target) throw new AppException('PARENT_COMM_NOT_EDITABLE');
    await this.prisma.$transaction(async (tx) => {
      const ok = await this.updateLocked(tx, id, version, { status: current.status }, { status: target });
      if (!ok) throw new AppException('STATE_CHANGED');
      await tx.parentCommunicationEvent.create({ data: { communicationId: id, type: 'CANCELLED', actorId: ctx.actor.id } });
      await this.audit.log(
        'PARENT_COMMUNICATION_CHANGED',
        { actorId: ctx.actor.id, ip: ctx.ip, targetType: 'ParentCommunication', targetId: id, details: { action: 'CANCELLED' } },
        tx,
      );
    });
    return this.messageDetail(ctx.actor, id);
  }
}
