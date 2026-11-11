import { Injectable } from '@nestjs/common';
import type {
  Conversation,
  ConversationType,
  Notification,
  NotificationType,
  ParentCommunicationAuthor,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException, type ErrorCode } from '../common/errors';
import { groupFlagsOf } from '../common/group-flags';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { missingContent } from './domain/communication-workflow';
import {
  authorLabel,
  canPost,
  canSeeMessage,
  canStart,
  isAdministration,
  partyOf,
  sendMode,
  type Decision,
  type Party,
  type PostFacts,
  type Refusal,
  type Viewer,
} from './domain/conversation-access';
import type {
  AdminStartConversationDto,
  ConversationsQuery,
  MessageBodyDto,
  StartConversationDto,
} from './parent-communications.dto';
import { CONVERSATIONS_PAGE_MAX } from './parent-communications.dto';
import { ParentCommunicationsService, type ActionContext } from './parent-communications.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXCERPT_MAX = 140;

const STUDENT_CARD = {
  id: true,
  firstName: true,
  lastName: true,
  class: { select: { id: true, name: true } },
} as const satisfies Prisma.StudentSelect;

const PERSON = { select: { id: true, displayName: true } } as const;

/** Message tel que chargé pour l'affichage : jamais l'historique ni les livraisons. */
const MESSAGE_SELECT = {
  id: true,
  author: true,
  authorId: true,
  status: true,
  version: true,
  currentRevision: true,
  approvedRevision: true,
  decisionReason: true,
  decidedAt: true,
  draftText: true,
  draftVoiceFileId: true,
  readAt: true,
  createdAt: true,
  authorUser: { select: { displayName: true } },
  draftVoice: { select: { durationSeconds: true } },
  revisions: {
    orderBy: { number: 'asc' },
    select: {
      number: true,
      text: true,
      voiceFileId: true,
      createdAt: true,
      voiceFile: { select: { durationSeconds: true } },
    },
  },
} as const satisfies Prisma.ParentCommunicationSelect;

type MessageRow = Prisma.ParentCommunicationGetPayload<{ select: typeof MESSAGE_SELECT }>;

const CONVERSATION_INCLUDE = {
  student: { select: STUDENT_CARD },
  teacher: PERSON,
  guardian: { select: { id: true, firstName: true, lastName: true, relationship: true } },
  responsibleAdmin: PERSON,
  messages: { orderBy: { createdAt: 'asc' }, select: MESSAGE_SELECT },
} as const satisfies Prisma.ConversationInclude;

type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof CONVERSATION_INCLUDE }>;

const seconds = (value: Prisma.Decimal | null | undefined) =>
  value === null || value === undefined ? null : Number(value);

const REFUSAL_ERROR: Record<Refusal, ErrorCode> = {
  OUT_OF_SCOPE: 'NOT_FOUND',
  ARCHIVED: 'PARENT_COMM_ARCHIVED',
  CLOSED: 'PARENT_COMM_CLOSED',
  RECIPIENT_INVALID: 'PARENT_COMM_RECIPIENT_INVALID',
  SEND_FORBIDDEN: 'PARENT_COMM_SEND_FORBIDDEN',
};

/** Fin de journée (UTC) pour une date seule « AAAA-MM-JJ ». */
function upperBound(value: string): Date {
  const end = new Date(value);
  if (value.length === 10) end.setUTCDate(end.getUTCDate() + 1);
  return end;
}

/**
 * Communications centrées sur l'administration (017) : conversations INTERNAL (enseignant ↔ administration)
 * et PARENT (administration ↔ représentant), archives 015 en lecture seule. Chaque lecture et chaque envoi
 * passent par domain/conversation-access.ts ; la validation des messages aux parents reste dans
 * ParentCommunicationsService.
 */
@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly validation: ParentCommunicationsService,
  ) {}

  // ------------------------------------------------------------------ Faits

  async viewerOf(user: AuthenticatedUser): Promise<Viewer> {
    const guardian =
      user.role === 'PARENT'
        ? await this.prisma.guardian.findFirst({ where: { userId: user.id, active: true }, select: { id: true } })
        : null;
    return {
      userId: user.id,
      role: user.role,
      active: user.active,
      isTeacher: user.role === 'PARENT' ? false : (await groupFlagsOf(this.prisma, user.id)).isTeacher,
      guardianId: guardian?.id ?? null,
      permissions: user.permissions,
    };
  }

  /** L'enseignant a encore la classe de l'élève actif (classe active). */
  private async teacherAssigned(teacherId: string | null, studentId: string): Promise<boolean> {
    if (!teacherId) return false;
    const count = await this.prisma.student.count({
      where: {
        id: studentId,
        active: true,
        class: { active: true, teachers: { some: { teacherId, teacher: { active: true } } } },
      },
    });
    return count > 0;
  }

  /** Représentant actif, compte parent actif, encore lié à l'élève actif (FR-016, FR-026). */
  private async guardianLinked(guardianId: string | null, studentId: string): Promise<boolean> {
    if (!guardianId) return false;
    const count = await this.prisma.guardianStudent.count({
      where: {
        guardianId,
        studentId,
        student: { active: true },
        guardian: { active: true, user: { is: { active: true, role: 'PARENT' } } },
      },
    });
    return count > 0;
  }

  private async postFacts(conversation: Pick<Conversation, 'teacherId' | 'guardianId' | 'studentId'>): Promise<PostFacts> {
    const [teacherAssigned, guardianLinked] = await Promise.all([
      this.teacherAssigned(conversation.teacherId, conversation.studentId),
      this.guardianLinked(conversation.guardianId, conversation.studentId),
    ]);
    return { teacherAssigned, guardianLinked };
  }

  private refuse(decision: Decision): asserts decision is Extract<Decision, { ok: true }> {
    if (!decision.ok) throw new AppException(REFUSAL_ERROR[decision.reason]);
  }

  /** Hors périmètre : introuvable (FR-025), tentative journalisée. */
  private async outOfScope(user: AuthenticatedUser, id: string, ip: string | null): Promise<never> {
    await this.audit.log('ACCESS_DENIED', {
      actorId: user.id,
      ip,
      targetType: 'Conversation',
      targetId: UUID.test(id) ? id : undefined,
      details: { reason: 'COMMUNICATION_OUT_OF_SCOPE', channel: 'http' },
    });
    throw new AppException('NOT_FOUND');
  }

  /** Conversation lisible par l'utilisateur, avec sa partie ; sinon 404 journalisé. */
  private async readable(
    user: AuthenticatedUser,
    id: string,
    ip: string | null,
    allowed: ReadonlyArray<ConversationType>,
  ): Promise<{ viewer: Viewer; party: Party; row: ConversationRow }> {
    const viewer = await this.viewerOf(user);
    const row = UUID.test(id)
      ? await this.prisma.conversation.findUnique({ where: { id }, include: CONVERSATION_INCLUDE })
      : null;
    const party = row && allowed.includes(row.type) ? partyOf(viewer, row) : null;
    if (!row || !party) return this.outOfScope(user, id, ip);
    return { viewer, party, row };
  }

  /** Vocal téléversé par l'auteur, jamais rattaché à une demande ni à un autre message (FR-013). */
  private assertOwnVoice(authorId: string, fileId: string): Promise<void> {
    return this.validation.assertOwnVoice(authorId, fileId);
  }

  /** Comptes actifs de l'administration (boîte de réception commune). */
  async administrationIds(tx: Prisma.TransactionClient = this.prisma): Promise<string[]> {
    const users = await tx.user.findMany({
      where: { active: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private async guardianUserId(tx: Prisma.TransactionClient, guardianId: string | null): Promise<string | null> {
    if (!guardianId) return null;
    const guardian = await tx.guardian.findUnique({
      where: { id: guardianId },
      select: { active: true, user: { select: { id: true, active: true } } },
    });
    return guardian?.active && guardian.user?.active ? guardian.user.id : null;
  }

  /** Participants à prévenir en temps réel d'un changement (listes et conversations ouvertes). */
  private async notifyParticipants(conversation: Pick<Conversation, 'id' | 'teacherId' | 'guardianId'>): Promise<void> {
    const ids = [...(await this.administrationIds())];
    if (conversation.teacherId) ids.push(conversation.teacherId);
    const parent = await this.guardianUserId(this.prisma, conversation.guardianId);
    if (parent) ids.push(parent);
    this.realtime.emitToUsers(ids, 'communication:updated', { conversationId: conversation.id });
  }

  // ------------------------------------------------------------------ Vues

  private shownRevision(row: MessageRow, party: Party, mine: boolean) {
    const number = !mine && party !== 'ADMIN' && row.status === 'APPROVED' ? row.approvedRevision : row.currentRevision;
    return row.revisions.find((r) => r.number === number) ?? null;
  }

  private authorName(row: MessageRow, conversation: ConversationRow): string {
    if (row.author === 'PARENT' && conversation.guardian)
      return `${conversation.guardian.firstName} ${conversation.guardian.lastName}`;
    return row.authorUser?.displayName ?? (row.author === 'TEACHER' ? (conversation.teacher?.displayName ?? '') : '');
  }

  private toMessage(row: MessageRow, conversation: ConversationRow, party: Party, viewerId: string) {
    const mine = row.authorId === viewerId;
    const revision = this.shownRevision(row, party, mine);
    // Brouillon de l'auteur (015) ou correction en cours d'un message retourné : sa copie de travail.
    const working =
      (row.status === 'DRAFT' || (row.status === 'RETURNED_FOR_CORRECTION' && mine)) &&
      (row.draftText !== null || row.draftVoiceFileId !== null);
    const voiceFileId = working ? row.draftVoiceFileId : (revision?.voiceFileId ?? null);
    const duration = working ? row.draftVoice?.durationSeconds : revision?.voiceFile?.durationSeconds;
    return {
      id: row.id,
      authorKind: row.author,
      authorLabel: authorLabel(party, { author: row.author, displayName: this.authorName(row, conversation) }),
      mine,
      status: row.status,
      text: working ? row.draftText : (revision?.text ?? null),
      voice: voiceFileId ? { fileId: voiceFileId, durationSeconds: seconds(duration) } : null,
      createdAt: row.revisions[0]?.createdAt ?? row.createdAt,
      readAt: row.readAt,
      ...(party === 'ADMIN'
        ? {
            validation: {
              revision: row.currentRevision,
              version: row.version,
              decisionReason: row.decisionReason,
              decidedAt: row.decidedAt,
            },
          }
        : {}),
    };
  }

  /** Messages de l'autre partie, visibles et non lus. */
  private unreadOf(party: Party, viewerId: string, conversation: ConversationRow, messages: MessageRow[]): MessageRow[] {
    // Archive 015 : readAt garde son sens d'origine (première lecture par le destinataire de l'époque).
    if (party === 'ADMIN' && conversation.type === 'LEGACY_TEACHER_PARENT') return [];
    return messages.filter((m) => {
      if (m.readAt !== null || m.authorId === viewerId) return false;
      const fromOtherSide =
        party === 'ADMIN' ? m.author !== 'ADMIN' : party === 'TEACHER' ? m.author !== 'TEACHER' : m.author !== 'PARENT';
      if (!fromOtherSide) return false;
      if (party === 'ADMIN') return m.status === 'SENT' || m.status === 'APPROVED';
      return canSeeMessage(party, viewerId, conversation, m);
    });
  }

  private toSummary(row: ConversationRow, party: Party, viewerId: string) {
    const visible = row.messages.filter((m) => canSeeMessage(party, viewerId, row, m));
    const last = visible.at(-1);
    const lastShown = last ? this.toMessage(last, row, party, viewerId) : null;
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      student: row.student,
      ...(party === 'ADMIN' && row.teacher ? { teacher: row.teacher } : {}),
      ...(party === 'ADMIN' && row.guardian ? { guardian: row.guardian } : {}),
      ...(party === 'ADMIN'
        ? { responsibleAdmin: row.responsibleAdmin, linkedInternalId: row.linkedInternalId, closedAt: row.closedAt }
        : {}),
      lastMessage: lastShown
        ? {
            at: lastShown.createdAt,
            authorKind: lastShown.authorKind,
            authorLabel: lastShown.authorLabel,
            hasVoice: lastShown.voice !== null,
            excerpt: lastShown.text ? lastShown.text.slice(0, EXCERPT_MAX) : null,
          }
        : null,
      unread: this.unreadOf(party, viewerId, row, row.messages).length,
      createdAt: row.createdAt,
      lastMessageAt: row.lastMessageAt,
    };
  }

  private async toDetail(row: ConversationRow, party: Party, viewer: Viewer) {
    const visible = row.messages.filter((m) => canSeeMessage(party, viewer.userId, row, m));
    const facts = row.type === 'LEGACY_TEACHER_PARENT' || row.status === 'CLOSED' ? null : await this.postFacts(row);
    return {
      ...this.toSummary(row, party, viewer.userId),
      messages: visible.map((m) => this.toMessage(m, row, party, viewer.userId)),
      canPost: facts !== null && canPost(viewer, row, facts).ok,
    };
  }

  // ------------------------------------------------------------------ Lecture

  /** Ouvre une conversation : marque lus les messages de l'autre partie (événement READ, audit côté parent). */
  private async open(user: AuthenticatedUser, id: string, ip: string | null, allowed: ReadonlyArray<ConversationType>) {
    const { viewer, party, row } = await this.readable(user, id, ip, allowed);
    const unread = this.unreadOf(party, viewer.userId, row, row.messages);
    if (unread.length > 0) {
      const now = new Date();
      await this.prisma.$transaction(async (tx) => {
        const ids = unread.map((m) => m.id);
        await tx.parentCommunication.updateMany({ where: { id: { in: ids }, readAt: null }, data: { readAt: now } });
        await tx.parentCommunicationEvent.createMany({
          data: ids.map((communicationId) => ({ communicationId, type: 'READ' as const, actorId: viewer.userId })),
        });
        if (party === 'GUARDIAN') {
          await this.audit.log(
            'PARENT_COMMUNICATION_READ',
            { actorId: viewer.userId, ip, targetType: 'Conversation', targetId: row.id, details: { messages: ids.length } },
            tx,
          );
        }
      });
      for (const m of unread) m.readAt = now;
    }
    return this.toDetail(row, party, viewer);
  }

  private async listFor(user: AuthenticatedUser, where: Prisma.ConversationWhereInput) {
    const viewer = await this.viewerOf(user);
    const rows = await this.prisma.conversation.findMany({
      where,
      include: CONVERSATION_INCLUDE,
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
    });
    return rows.flatMap((row) => {
      const party = partyOf(viewer, row);
      return party ? [this.toSummary(row, party, viewer.userId)] : [];
    });
  }

  // ------------------------------------------------------------------ Envoi

  /**
   * Écrit un message dans une conversation, dans la transaction donnée : version 1 figée, événement,
   * notifications, publication (outbox) d'un message de l'administration visible par le parent.
   */
  private async writeMessage(
    tx: Prisma.TransactionClient,
    conversation: Pick<Conversation, 'id' | 'type' | 'teacherId' | 'guardianId'>,
    author: ParentCommunicationAuthor,
    authorId: string,
    content: { text: string | null; voiceFileId: string | null },
    mode: 'DIRECT' | 'SUBMIT',
    ip: string | null,
  ): Promise<{ id: string; notifications: Notification[] }> {
    const now = new Date();
    const submit = mode === 'SUBMIT';
    const message = await tx.parentCommunication.create({
      data: {
        conversationId: conversation.id,
        author,
        authorId,
        status: submit ? 'PENDING_ADMIN_VALIDATION' : 'SENT',
        currentRevision: 1,
        submittedAt: now,
        // Copie de travail conservée pour une correction après un retour (validation 015).
        draftText: submit ? content.text : null,
        draftVoiceFileId: submit ? content.voiceFileId : null,
        revisions: { create: { number: 1, text: content.text, voiceFileId: content.voiceFileId } },
      },
      select: { id: true },
    });
    await tx.parentCommunicationEvent.create({
      data: { communicationId: message.id, type: submit ? 'SUBMITTED' : 'SENT', actorId: authorId, revision: 1 },
    });
    await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: now } });
    await this.audit.log(
      'PARENT_COMMUNICATION_CHANGED',
      {
        actorId: authorId,
        ip,
        targetType: 'ParentCommunication',
        targetId: message.id,
        details: { conversationId: conversation.id, type: conversation.type, status: submit ? 'PENDING_ADMIN_VALIDATION' : 'SENT' },
      },
      tx,
    );

    const notify = async (userIds: ReadonlyArray<string | null>, type: NotificationType) =>
      this.notifications.notifyCommunicationInTx(tx, userIds, authorId, { type, communicationId: message.id });
    let created: Notification[] = [];
    if (author === 'TEACHER') created = await notify(await this.administrationIds(tx), 'COMM_INTERNAL_NEW');
    else if (author === 'PARENT') created = await notify(await this.administrationIds(tx), 'COMM_PARENT_NEW');
    else if (conversation.type === 'INTERNAL') created = await notify([conversation.teacherId], 'COMM_ADMIN_REPLY');
    else if (submit) created = await notify(await this.validation.validatorIds(tx), 'PARENT_COMM_TO_VALIDATE');
    else created = await this.validation.publishInTx(tx, message.id, conversation.guardianId, 1, authorId, now);
    return { id: message.id, notifications: created };
  }

  private content(body: MessageBodyDto) {
    const content = { text: body.text?.trim() || null, voiceFileId: body.voiceFileId ?? null };
    if (missingContent(content)) throw new AppException('PARENT_COMM_INCOMPLETE');
    return content;
  }

  /** Message ajouté (vue de l'auteur). */
  private async messageView(user: AuthenticatedUser, conversationId: string, messageId: string, allowed: ReadonlyArray<ConversationType>) {
    const { viewer, party, row } = await this.readable(user, conversationId, null, allowed);
    const message = row.messages.find((m) => m.id === messageId)!;
    return this.toMessage(message, row, party, viewer.userId);
  }

  private async post(
    user: AuthenticatedUser,
    id: string,
    body: MessageBodyDto,
    ip: string | null,
    allowed: ReadonlyArray<ConversationType>,
  ) {
    const { viewer, party, row } = await this.readable(user, id, ip, allowed);
    const decision = canPost(viewer, row, await this.postFacts(row));
    this.refuse(decision);
    const content = this.content(body);
    if (content.voiceFileId) await this.assertOwnVoice(user.id, content.voiceFileId);
    const author: ParentCommunicationAuthor = party === 'ADMIN' ? 'ADMIN' : party === 'TEACHER' ? 'TEACHER' : 'PARENT';
    let created: Notification[] = [];
    const messageId = await this.prisma.$transaction(async (tx) => {
      const written = await this.writeMessage(tx, row, author, user.id, content, decision.mode, ip);
      created = written.notifications;
      return written.id;
    });
    await this.notifications.flushAfterCommit(created);
    await this.notifyParticipants(row);
    return this.messageView(user, id, messageId, allowed);
  }

  /** Crée la conversation et son premier message dans une transaction. */
  private async start(
    user: AuthenticatedUser,
    data: {
      type: 'INTERNAL' | 'PARENT';
      studentId: string;
      teacherId: string | null;
      guardianId: string | null;
      linkedInternalId?: string | null;
    },
    author: ParentCommunicationAuthor,
    mode: 'DIRECT' | 'SUBMIT',
    content: { text: string | null; voiceFileId: string | null },
    ip: string | null,
    allowed: ReadonlyArray<ConversationType>,
  ) {
    let created: Notification[] = [];
    const conversation = await this.prisma.$transaction(async (tx) => {
      const row = await tx.conversation.create({
        data: {
          type: data.type,
          studentId: data.studentId,
          teacherId: data.teacherId,
          guardianId: data.guardianId,
          linkedInternalId: data.linkedInternalId ?? null,
          createdById: user.id,
        },
      });
      if (data.linkedInternalId) {
        await this.audit.log(
          'COMMUNICATION_CONVERSATION_CHANGED',
          { actorId: user.id, ip, targetType: 'Conversation', targetId: row.id, details: { action: 'LINKED', linkedInternalId: data.linkedInternalId } },
          tx,
        );
      }
      created = (await this.writeMessage(tx, row, author, user.id, content, mode, ip)).notifications;
      return row;
    });
    await this.notifications.flushAfterCommit(created);
    await this.notifyParticipants(conversation);
    const { viewer, party, row } = await this.readable(user, conversation.id, ip, allowed);
    return this.toDetail(row, party, viewer);
  }

  // ------------------------------------------------------------------ Enseignant

  private static readonly TEACHER_TYPES: ConversationType[] = ['INTERNAL', 'LEGACY_TEACHER_PARENT'];

  /** Élèves actifs de ses classes actives, sans représentants (017 : il n'écrit qu'à l'administration). */
  async teacherStudents(user: AuthenticatedUser) {
    return this.prisma.student.findMany({
      where: { active: true, class: { active: true, teachers: { some: { teacherId: user.id } } } },
      select: STUDENT_CARD,
      orderBy: [{ class: { name: 'asc' } }, { lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  teacherConversations(user: AuthenticatedUser) {
    return this.listFor(user, { teacherId: user.id, type: { in: ConversationsService.TEACHER_TYPES } });
  }

  teacherConversation(user: AuthenticatedUser, id: string, ip: string | null) {
    return this.open(user, id, ip, ConversationsService.TEACHER_TYPES);
  }

  async teacherStart(user: AuthenticatedUser, dto: StartConversationDto, ip: string | null) {
    const viewer = await this.viewerOf(user);
    const facts = { teacherAssigned: await this.teacherAssigned(user.id, dto.studentId), guardianLinked: false };
    const decision = canStart(viewer, 'INTERNAL', facts);
    if (!decision.ok && decision.reason === 'RECIPIENT_INVALID') {
      await this.audit.log('ACCESS_DENIED', {
        actorId: user.id,
        ip,
        targetType: 'Student',
        targetId: dto.studentId,
        details: { reason: 'COMMUNICATION_RECIPIENT_INVALID', channel: 'http' },
      });
    }
    this.refuse(decision);
    const content = this.content(dto);
    if (content.voiceFileId) await this.assertOwnVoice(user.id, content.voiceFileId);
    return this.start(
      user,
      { type: 'INTERNAL', studentId: dto.studentId, teacherId: user.id, guardianId: null },
      'TEACHER',
      'DIRECT',
      content,
      ip,
      ConversationsService.TEACHER_TYPES,
    );
  }

  teacherPost(user: AuthenticatedUser, id: string, body: MessageBodyDto, ip: string | null) {
    return this.post(user, id, body, ip, ConversationsService.TEACHER_TYPES);
  }

  // ------------------------------------------------------------------ Parent

  private static readonly PARENT_TYPES: ConversationType[] = ['PARENT', 'LEGACY_TEACHER_PARENT'];

  private async parentGuardian(user: AuthenticatedUser): Promise<string> {
    const viewer = await this.viewerOf(user);
    if (!viewer.guardianId) throw new AppException('FORBIDDEN');
    return viewer.guardianId;
  }

  /** Ses enfants actifs encore liés (017 : sans leurs enseignants). */
  async parentChildren(user: AuthenticatedUser) {
    const guardianId = await this.parentGuardian(user);
    const links = await this.prisma.guardianStudent.findMany({
      where: { guardianId, student: { active: true } },
      select: { student: { select: STUDENT_CARD } },
      orderBy: [{ student: { firstName: 'asc' } }, { student: { lastName: 'asc' } }],
    });
    return links.map((l) => l.student);
  }

  async parentConversations(user: AuthenticatedUser) {
    const guardianId = await this.parentGuardian(user);
    return this.listFor(user, { guardianId, type: { in: ConversationsService.PARENT_TYPES } });
  }

  parentConversation(user: AuthenticatedUser, id: string, ip: string | null) {
    return this.open(user, id, ip, ConversationsService.PARENT_TYPES);
  }

  async parentStart(user: AuthenticatedUser, dto: StartConversationDto, ip: string | null) {
    const viewer = await this.viewerOf(user);
    const facts = { teacherAssigned: false, guardianLinked: await this.guardianLinked(viewer.guardianId, dto.studentId) };
    this.refuse(canStart(viewer, 'PARENT', facts));
    const content = this.content(dto);
    if (content.voiceFileId) await this.assertOwnVoice(user.id, content.voiceFileId);
    return this.start(
      user,
      { type: 'PARENT', studentId: dto.studentId, teacherId: null, guardianId: viewer.guardianId },
      'PARENT',
      'DIRECT',
      content,
      ip,
      ConversationsService.PARENT_TYPES,
    );
  }

  parentPost(user: AuthenticatedUser, id: string, body: MessageBodyDto, ip: string | null) {
    return this.post(user, id, body, ip, ConversationsService.PARENT_TYPES);
  }

  /** Conversation d'un message (anciens liens de notification), si le parent peut la lire. */
  async parentConversationOfMessage(user: AuthenticatedUser, messageId: string, ip: string | null) {
    const message = UUID.test(messageId)
      ? await this.prisma.parentCommunication.findUnique({ where: { id: messageId }, select: { conversationId: true } })
      : null;
    if (!message) return this.outOfScope(user, messageId, ip);
    await this.readable(user, message.conversationId, ip, ConversationsService.PARENT_TYPES);
    return { conversationId: message.conversationId };
  }

  // ------------------------------------------------------------------ Administration

  private static readonly ALL_TYPES: ConversationType[] = ['INTERNAL', 'PARENT', 'LEGACY_TEACHER_PARENT'];

  /** Conversations avec un message d'un enseignant ou d'un parent non lu. */
  inbox(user: AuthenticatedUser) {
    return this.listFor(user, {
      type: { in: ['INTERNAL', 'PARENT'] },
      messages: { some: { author: { in: ['TEACHER', 'PARENT'] }, readAt: null, status: 'SENT' } },
    });
  }

  async adminConversations(user: AuthenticatedUser, query: ConversationsQuery) {
    const limit = query.limit ?? CONVERSATIONS_PAGE_MAX;
    const name = query.q
      ? { contains: query.q, mode: 'insensitive' as const }
      : undefined;
    const where: Prisma.ConversationWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.classId ? { student: { classId: query.classId } } : {}),
      ...(query.teacherId ? { teacherId: query.teacherId } : {}),
      ...(query.guardianId ? { guardianId: query.guardianId } : {}),
      ...(query.mine ? { responsibleAdminId: user.id } : {}),
      ...(query.from || query.to
        ? {
            lastMessageAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: upperBound(query.to) } : {}),
            },
          }
        : {}),
      ...(name
        ? {
            OR: [
              { student: { firstName: name } },
              { student: { lastName: name } },
              { guardian: { firstName: name } },
              { guardian: { lastName: name } },
              { teacher: { displayName: name } },
            ],
          }
        : {}),
    };
    const viewer = await this.viewerOf(user);
    const rows = await this.prisma.conversation.findMany({
      where,
      include: CONVERSATION_INCLUDE,
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => this.toSummary(row, 'ADMIN', viewer.userId)),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  adminConversation(user: AuthenticatedUser, id: string, ip: string | null) {
    return this.open(user, id, ip, ConversationsService.ALL_TYPES);
  }

  async adminStart(user: AuthenticatedUser, dto: AdminStartConversationDto, ip: string | null) {
    const viewer = await this.viewerOf(user);
    const teacherId = dto.type === 'INTERNAL' ? dto.teacherId! : null;
    const guardianId = dto.type === 'PARENT' ? dto.guardianId! : null;
    const facts = {
      teacherAssigned: dto.type === 'INTERNAL' && (await this.teacherAssigned(teacherId, dto.studentId)),
      guardianLinked: dto.type === 'PARENT' && (await this.guardianLinked(guardianId, dto.studentId)),
    };
    // Mode d'envoi refusé avant le destinataire : l'écran ne propose rien à qui ne peut pas écrire.
    if (sendMode(viewer, dto.type) === 'FORBIDDEN') throw new AppException('PARENT_COMM_SEND_FORBIDDEN');
    const decision = canStart(viewer, dto.type, facts);
    this.refuse(decision);
    if (dto.linkedInternalId) {
      const linked = await this.prisma.conversation.findUnique({
        where: { id: dto.linkedInternalId },
        select: { type: true, studentId: true },
      });
      if (!linked || linked.type !== 'INTERNAL' || linked.studentId !== dto.studentId)
        throw new AppException('PARENT_COMM_LINK_INVALID');
    }
    const content = this.content(dto);
    if (content.voiceFileId) await this.assertOwnVoice(user.id, content.voiceFileId);
    return this.start(
      user,
      { type: dto.type, studentId: dto.studentId, teacherId, guardianId, linkedInternalId: dto.linkedInternalId ?? null },
      'ADMIN',
      decision.mode,
      content,
      ip,
      ConversationsService.ALL_TYPES,
    );
  }

  async adminPost(user: AuthenticatedUser, id: string, body: MessageBodyDto, ip: string | null) {
    const viewer = await this.viewerOf(user);
    const row = UUID.test(id)
      ? await this.prisma.conversation.findUnique({ where: { id }, select: { type: true, status: true } })
      : null;
    // Sans droit d'écrire aux parents : refusé avant tout (403), sauf archive ou clôture signalées comme telles.
    if (row?.type === 'PARENT' && row.status === 'OPEN' && sendMode(viewer, 'PARENT') === 'FORBIDDEN')
      throw new AppException('PARENT_COMM_SEND_FORBIDDEN');
    return this.post(user, id, body, ip, ConversationsService.ALL_TYPES);
  }

  /** Clôture, réouverture, prise en charge : sur la conversation, journalisées (R6). */
  private async changeConversation(
    user: AuthenticatedUser,
    id: string,
    ip: string | null,
    change: (row: ConversationRow) => { data: Prisma.ConversationUpdateInput; details: Record<string, unknown> },
  ) {
    const { row } = await this.readable(user, id, ip, ConversationsService.ALL_TYPES);
    if (row.type === 'LEGACY_TEACHER_PARENT') throw new AppException('PARENT_COMM_ARCHIVED');
    const { data, details } = change(row);
    await this.prisma.$transaction(async (tx) => {
      await tx.conversation.update({ where: { id }, data });
      await this.audit.log(
        'COMMUNICATION_CONVERSATION_CHANGED',
        { actorId: user.id, ip, targetType: 'Conversation', targetId: id, details },
        tx,
      );
    });
    await this.notifyParticipants(row);
    return this.adminConversation(user, id, ip);
  }

  close(user: AuthenticatedUser, id: string, ip: string | null) {
    return this.changeConversation(user, id, ip, (row) => {
      if (row.status === 'CLOSED') throw new AppException('PARENT_COMM_CLOSED');
      return {
        data: { status: 'CLOSED', closedAt: new Date(), closedBy: { connect: { id: user.id } } },
        details: { action: 'CLOSED' },
      };
    });
  }

  reopen(user: AuthenticatedUser, id: string, ip: string | null) {
    return this.changeConversation(user, id, ip, (row) => {
      if (row.status === 'OPEN') throw new AppException('STATE_CHANGED');
      return {
        data: { status: 'OPEN', closedAt: null, closedBy: { disconnect: true } },
        details: { action: 'REOPENED' },
      };
    });
  }

  async setResponsible(user: AuthenticatedUser, id: string, adminId: string | null, ip: string | null) {
    if (adminId) {
      const target = await this.prisma.user.findUnique({ where: { id: adminId }, select: { role: true, active: true } });
      if (!target || !isAdministration(target)) throw new AppException('PARENT_COMM_RESPONSIBLE_INVALID');
    }
    return this.changeConversation(user, id, ip, (row) => ({
      data: { responsibleAdmin: adminId ? { connect: { id: adminId } } : { disconnect: true } },
      details: { action: 'RESPONSIBLE', from: row.responsibleAdminId, to: adminId },
    }));
  }

  /** Destinataires possibles au sujet d'un élève : enseignants de sa classe, représentants liés. */
  async recipients(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        ...STUDENT_CARD,
        class: {
          select: {
            id: true,
            name: true,
            teachers: {
              where: { teacher: { active: true } },
              select: { teacher: { select: { id: true, displayName: true } } },
              orderBy: { teacher: { displayName: 'asc' } },
            },
          },
        },
        guardians: {
          where: { guardian: { active: true } },
          select: {
            guardian: {
              select: { id: true, firstName: true, lastName: true, relationship: true, user: { select: { active: true } } },
            },
          },
        },
      },
    });
    if (!student) throw new AppException('NOT_FOUND');
    return {
      student: { id: student.id, firstName: student.firstName, lastName: student.lastName, class: { id: student.class.id, name: student.class.name } },
      teachers: student.class.teachers.map((t) => t.teacher),
      guardians: student.guardians.map(({ guardian: { user, ...g } }) => ({ ...g, hasActiveAccount: user?.active === true })),
    };
  }

  async sendModeOf(user: AuthenticatedUser) {
    const viewer = await this.viewerOf(user);
    return {
      toParents: sendMode(viewer, 'PARENT'),
      canValidate: this.validation.isValidator(user),
    };
  }

  // ------------------------------------------------------------------ Vocaux

  /**
   * Vocal d'un message de communication (FR-024) : servi seulement si le message qui le porte est visible
   * pour le lecteur. null : ce fichier n'est pas un vocal de communication.
   */
  async canReadVoice(user: AuthenticatedUser, fileId: string): Promise<boolean | null> {
    const messages = await this.prisma.parentCommunication.findMany({
      where: { OR: [{ draftVoiceFileId: fileId }, { revisions: { some: { voiceFileId: fileId } } }] },
      select: {
        author: true,
        authorId: true,
        status: true,
        approvedRevision: true,
        currentRevision: true,
        draftVoiceFileId: true,
        revisions: { where: { voiceFileId: fileId }, select: { number: true } },
        conversation: { select: { type: true, status: true, teacherId: true, guardianId: true } },
      },
    });
    if (messages.length === 0) return null;
    const viewer = await this.viewerOf(user);
    return messages.some((m) => {
      const party = partyOf(viewer, m.conversation);
      if (!party || !canSeeMessage(party, viewer.userId, m.conversation, m)) return false;
      if (party === 'ADMIN' || m.authorId === viewer.userId) return true;
      // Destinataire : le vocal de la version qu'il lit, pas celui d'une version non publiée.
      const shown = m.status === 'APPROVED' ? m.approvedRevision : m.currentRevision;
      return m.revisions.some((r) => r.number === shown) || (m.status === 'DRAFT' && m.draftVoiceFileId === fileId);
    });
  }
}

export type { ActionContext };
