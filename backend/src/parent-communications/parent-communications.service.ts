import { Inject, Injectable } from '@nestjs/common';
import type {
  CommunicationChannel,
  Notification,
  NotificationType,
  ParentCommunicationAuthor,
  ParentCommunicationEventType,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppException } from '../common/errors';
import { groupFlagsOf } from '../common/group-flags';
import { PrismaService } from '../common/prisma.service';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { NotificationsService } from '../notifications/notifications.service';
import {
  canEdit,
  missingForSubmit,
  nextStatus,
  parentCanSee,
  validatorCanSee,
  visibleInConversation,
  type CommunicationAction,
} from './domain/communication-workflow';
import { discussionKey, groupDiscussions } from './domain/discussions';
import type {
  CreateCommunicationDto,
  DecisionDto,
  DiscussionsQuery,
  ListCommunicationsQuery,
  ParentMessageDto,
  ParentResubmitDto,
  PeriodQuery,
  UpdateCommunicationDto,
} from './parent-communications.dto';

/** Événement outbox publié à l'approbation, transmis à n8n (015, FR-009). */
export const COMMUNICATION_APPROVED_EVENT = 'PARENT_COMMUNICATION_APPROVED';

export interface ActionContext {
  actor: AuthenticatedUser;
  ip: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Longueur de l'aperçu du dernier message dans la liste des discussions. */
const PREVIEW_MAX = 140;

const PERSON = { select: { id: true, displayName: true } } as const;

const DETAIL_INCLUDE = {
  teacher: PERSON,
  decidedBy: PERSON,
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      class: { select: { id: true, name: true } },
    },
  },
  guardian: { select: { id: true, firstName: true, lastName: true, relationship: true } },
  draftVoice: { select: { id: true, durationSeconds: true } },
  revisions: {
    orderBy: { number: 'asc' },
    include: { voiceFile: { select: { durationSeconds: true } } },
  },
  events: { orderBy: { createdAt: 'asc' }, include: { actor: PERSON } },
  deliveries: {
    orderBy: { channel: 'asc' },
    select: { channel: true, status: true, attempts: true, updatedAt: true },
  },
} satisfies Prisma.ParentCommunicationInclude;

type CommunicationDetailRow = Prisma.ParentCommunicationGetPayload<{
  include: typeof DETAIL_INCLUDE;
}>;

const SUMMARY_INCLUDE = {
  teacher: PERSON,
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      class: { select: { id: true, name: true } },
    },
  },
  guardian: { select: { id: true, firstName: true, lastName: true, relationship: true } },
} satisfies Prisma.ParentCommunicationInclude;

type CommunicationSummaryRow = Prisma.ParentCommunicationGetPayload<{
  include: typeof SUMMARY_INCLUDE;
}>;

const seconds = (value: Prisma.Decimal | null | undefined) =>
  value === null || value === undefined ? null : Number(value);

function toSummary(c: CommunicationSummaryRow) {
  return {
    id: c.id,
    author: c.author,
    status: c.status,
    version: c.version,
    currentRevision: c.currentRevision,
    approvedRevision: c.approvedRevision,
    decisionReason: c.decisionReason,
    submittedAt: c.submittedAt,
    decidedAt: c.decidedAt,
    updatedAt: c.updatedAt,
    teacher: c.teacher,
    student: c.student,
    guardian: c.guardian,
  };
}

/**
 * Détail d'une communication. Vue enseignant : son brouillon en cours. Vue validation : seulement les
 * versions soumises (le brouillon retravaillé après un retour reste privé jusqu'à sa soumission).
 */
function toDetail(c: CommunicationDetailRow, view: 'teacher' | 'validator') {
  return {
    ...toSummary(c),
    readAt: c.readAt,
    createdAt: c.createdAt,
    decidedBy: c.decidedBy,
    draft:
      view === 'teacher'
        ? {
            text: c.draftText,
            voice: c.draftVoice
              ? { id: c.draftVoice.id, durationSeconds: seconds(c.draftVoice.durationSeconds) }
              : null,
          }
        : null,
    revisions: c.revisions.map((r) => ({
      number: r.number,
      text: r.text,
      voiceFileId: r.voiceFileId,
      durationSeconds: seconds(r.voiceFile?.durationSeconds),
      createdAt: r.createdAt,
    })),
    events: c.events.map((e) => ({
      type: e.type,
      actor: e.actor,
      revision: e.revision,
      reason: e.reason,
      createdAt: e.createdAt,
    })),
    deliveries: c.deliveries,
  };
}

// ------------------------------------------------------------------ Conversations (015)

/** Carte d'un enseignant pour le parent : photo (calculée par l'interface), nom, fonction. */
const TEACHER_CARD = {
  id: true,
  displayName: true,
  jobTitle: true,
} as const satisfies Prisma.UserSelect;

const STUDENT_CARD = {
  id: true,
  firstName: true,
  lastName: true,
  class: { select: { id: true, name: true } },
} as const satisfies Prisma.StudentSelect;

const GUARDIAN_CARD = {
  id: true,
  firstName: true,
  lastName: true,
  relationship: true,
} as const satisfies Prisma.GuardianSelect;

/** Message d'une conversation : seules les colonnes utiles à l'affichage, jamais l'historique. */
const CONVERSATION_SELECT = {
  id: true,
  author: true,
  status: true,
  version: true,
  teacherId: true,
  studentId: true,
  guardianId: true,
  currentRevision: true,
  approvedRevision: true,
  decisionReason: true,
  draftText: true,
  draftVoiceFileId: true,
  submittedAt: true,
  decidedAt: true,
  readAt: true,
  createdAt: true,
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

type ConversationRow = Prisma.ParentCommunicationGetPayload<{
  select: typeof CONVERSATION_SELECT;
}>;

/**
 * Message vu par `viewer`. Son propre message : la dernière version soumise (ou le brouillon de
 * l'enseignant), son état de modération et le motif d'un retour ou d'un rejet. Message reçu :
 * uniquement la version approuvée, sans motif ni état interne.
 */
function toConversationMessage(row: ConversationRow, viewer: ParentCommunicationAuthor) {
  const own = row.author === viewer;
  const shown = row.revisions.find(
    (r) => r.number === (own ? row.currentRevision : row.approvedRevision),
  );
  const draft = own && row.status === 'DRAFT';
  return {
    id: row.id,
    author: row.author,
    own,
    status: own ? row.status : ('APPROVED' as const),
    version: own ? row.version : null,
    revision: shown?.number ?? null,
    text: draft ? row.draftText : (shown?.text ?? null),
    voiceFileId: draft ? row.draftVoiceFileId : (shown?.voiceFileId ?? null),
    durationSeconds: draft ? null : seconds(shown?.voiceFile?.durationSeconds),
    sentAt: row.revisions[0]?.createdAt ?? row.createdAt,
    editedAt: own && shown && shown.number > 1 ? shown.createdAt : null,
    decidedAt: row.status === 'DRAFT' ? null : row.decidedAt,
    decisionReason:
      own && (row.status === 'RETURNED_FOR_CORRECTION' || row.status === 'REJECTED')
        ? row.decisionReason
        : null,
    readAt: row.readAt,
  };
}

/**
 * Résumé des conversations : dernier message visible, messages reçus non lus et messages de
 * `viewer` en attente de validation ; la plus récemment active d'abord.
 */
function summarize<T extends ConversationRow>(
  rows: T[],
  viewer: ParentCommunicationAuthor,
  keyOf: (row: T) => string,
) {
  const groups = new Map<string, { last: T; unread: number; pending: number; returned: number }>();
  for (const row of rows) {
    if (!visibleInConversation(row, viewer)) continue;
    const key = keyOf(row);
    const group = groups.get(key) ?? { last: row, unread: 0, pending: 0, returned: 0 };
    group.last = row;
    if (row.author !== viewer && !row.readAt) group.unread += 1;
    if (row.author === viewer && row.status === 'PENDING_ADMIN_VALIDATION') group.pending += 1;
    if (row.author === viewer && row.status === 'RETURNED_FOR_CORRECTION') group.returned += 1;
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ last, unread, pending, returned }) => {
      const message = toConversationMessage(last, viewer);
      return {
        key: discussionKey(last),
        last,
        lastMessage: {
          id: message.id,
          author: message.author,
          status: message.status,
          preview: (message.text ?? '').slice(0, PREVIEW_MAX),
          sentAt: message.sentAt,
        },
        unread,
        pending,
        returned,
      };
    })
    .sort((a, b) => b.lastMessage.sentAt.getTime() - a.lastMessage.sentAt.getTime());
}

const DECISION_EVENT: Record<
  DecisionDto['action'],
  { action: CommunicationAction; event: ParentCommunicationEventType; notify: NotificationType }
> = {
  APPROVE: { action: 'APPROVE', event: 'APPROVED', notify: 'PARENT_COMM_APPROVED' },
  RETURN: { action: 'RETURN', event: 'RETURNED', notify: 'PARENT_COMM_RETURNED' },
  REJECT: { action: 'REJECT', event: 'REJECTED', notify: 'PARENT_COMM_REJECTED' },
};

/** Fin de journée (UTC) pour une date seule « AAAA-MM-JJ ». */
function upperBound(value: string): Date {
  const end = new Date(value);
  if (value.length === 10) end.setUTCDate(end.getUTCDate() + 1);
  return end;
}

/** Filtre de date de soumission, bornes incluses (une date seule couvre toute la journée). */
function submittedWithin(period: PeriodQuery): Prisma.ParentCommunicationWhereInput {
  if (!period.from && !period.to) return {};
  return {
    submittedAt: {
      ...(period.from ? { gte: new Date(period.from) } : {}),
      ...(period.to ? { lt: upperBound(period.to) } : {}),
    },
  };
}

/**
 * Communication enseignant / parents (015). NestJS reste l'unique autorité : droits, statuts,
 * versions, notifications internes et événement outbox de l'approbation.
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

  // ------------------------------------------------------------------ Droits

  isValidator(user: AuthenticatedUser): boolean {
    return (
      user.active && user.role !== 'PARENT' && user.permissions.has('PARENT_COMMUNICATION_VALIDATE')
    );
  }

  private async assertTeacher(user: AuthenticatedUser): Promise<void> {
    if (
      !user.active ||
      user.role === 'PARENT' ||
      !(await groupFlagsOf(this.prisma, user.id)).isTeacher
    ) {
      throw new AppException('FORBIDDEN');
    }
  }

  private assertValidator(user: AuthenticatedUser): void {
    if (!this.isValidator(user)) throw new AppException('FORBIDDEN');
  }

  /** L'élève est actif, dans une classe attribuée à l'enseignant, et le représentant actif lui est lié. */
  private async assertRecipient(
    teacherId: string,
    studentId: string,
    guardianId: string,
  ): Promise<void> {
    const link = await this.prisma.guardianStudent.findFirst({
      where: {
        studentId,
        guardianId,
        guardian: { active: true },
        student: { active: true, class: { teachers: { some: { teacherId } } } },
      },
      select: { studentId: true },
    });
    if (!link) throw new AppException('PARENT_COMM_RECIPIENT_INVALID');
  }

  /** Vocal téléversé par l'enseignant lui-même, jamais rattaché à une demande ou un message. */
  private async assertOwnVoice(teacherId: string, fileId: string): Promise<void> {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      select: { kind: true, uploaderId: true, requestId: true, messageId: true },
    });
    if (
      !file ||
      file.kind !== 'VOICE' ||
      file.uploaderId !== teacherId ||
      file.requestId !== null ||
      file.messageId !== null
    ) {
      throw new AppException('PARENT_COMM_VOICE_INVALID');
    }
  }

  /** Comptes actifs ayant la permission de validation : le super administrateur et les rôles qui l'ont reçue. */
  private async validatorIds(tx: Prisma.TransactionClient): Promise<string[]> {
    const roles = (
      await tx.rolePermission.findMany({
        where: { permission: 'PARENT_COMMUNICATION_VALIDATE' },
        select: { role: true },
      })
    )
      .map((r) => r.role)
      .filter((role) => role !== 'PARENT');
    const users = await tx.user.findMany({
      where: { active: true, role: { in: ['SUPER_ADMIN', ...roles] } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private async event(
    tx: Prisma.TransactionClient,
    communicationId: string,
    type: ParentCommunicationEventType,
    actorId: string | null,
    extra: { revision?: number; reason?: string | null } = {},
  ): Promise<void> {
    await tx.parentCommunicationEvent.create({
      data: {
        communicationId,
        type,
        actorId,
        revision: extra.revision ?? null,
        reason: extra.reason ?? null,
      },
    });
  }

  private async detailRow(id: string): Promise<CommunicationDetailRow> {
    return this.prisma.parentCommunication.findUniqueOrThrow({
      where: { id },
      include: DETAIL_INCLUDE,
    });
  }

  /** Écrit avec verrouillage optimiste (version) : 0 ligne → la communication a changé entre-temps. */
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

  // ------------------------------------------------------------------ Enseignant

  /** Élèves actifs des classes attribuées, avec leurs représentants actifs (sans coordonnées). */
  async teacherStudents(user: AuthenticatedUser) {
    await this.assertTeacher(user);
    const students = await this.prisma.student.findMany({
      where: { active: true, class: { active: true, teachers: { some: { teacherId: user.id } } } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        class: { select: { id: true, name: true } },
        guardians: {
          where: { guardian: { active: true } },
          select: {
            guardian: { select: { id: true, firstName: true, lastName: true, relationship: true } },
          },
        },
      },
      orderBy: [{ class: { name: 'asc' } }, { lastName: 'asc' }, { firstName: 'asc' }],
    });
    return students.map(({ guardians, ...s }) => ({
      ...s,
      guardians: guardians.map((g) => g.guardian),
    }));
  }

  async listMine(user: AuthenticatedUser) {
    await this.assertTeacher(user);
    const rows = await this.prisma.parentCommunication.findMany({
      where: { teacherId: user.id, author: 'TEACHER' },
      include: SUMMARY_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toSummary);
  }

  /**
   * Communication écrite par l'enseignant ; celle d'un autre enseignant, ou le message d'un parent qui
   * lui est adressé (lu seulement dans la conversation, une fois validé), n'existe pas ici (404).
   */
  private async own(user: AuthenticatedUser, id: string) {
    await this.assertTeacher(user);
    const row = UUID.test(id)
      ? await this.prisma.parentCommunication.findUnique({ where: { id } })
      : null;
    if (!row || row.teacherId !== user.id || row.author !== 'TEACHER')
      throw new AppException('NOT_FOUND');
    return row;
  }

  async getMine(user: AuthenticatedUser, id: string) {
    await this.own(user, id);
    return toDetail(await this.detailRow(id), 'teacher');
  }

  async create(dto: CreateCommunicationDto, ctx: ActionContext) {
    await this.assertTeacher(ctx.actor);
    await this.assertRecipient(ctx.actor.id, dto.studentId, dto.guardianId);
    if (dto.voiceFileId) await this.assertOwnVoice(ctx.actor.id, dto.voiceFileId);
    const id = await this.prisma.$transaction(async (tx) => {
      const created = await tx.parentCommunication.create({
        data: {
          teacherId: ctx.actor.id,
          studentId: dto.studentId,
          guardianId: dto.guardianId,
          draftText: dto.text ?? null,
          draftVoiceFileId: dto.voiceFileId ?? null,
        },
      });
      await this.event(tx, created.id, 'CREATED', ctx.actor.id);
      await this.audit.log(
        'PARENT_COMMUNICATION_CHANGED',
        {
          actorId: ctx.actor.id,
          targetType: 'ParentCommunication',
          targetId: created.id,
          ip: ctx.ip,
          details: { event: 'CREATED', studentId: dto.studentId },
        },
        tx,
      );
      return created.id;
    });
    return toDetail(await this.detailRow(id), 'teacher');
  }

  async update(id: string, dto: UpdateCommunicationDto, ctx: ActionContext) {
    const current = await this.own(ctx.actor, id);
    if (!canEdit(current.status)) throw new AppException('PARENT_COMM_NOT_EDITABLE');
    if (dto.guardianId) await this.assertRecipient(ctx.actor.id, current.studentId, dto.guardianId);
    if (dto.voiceFileId) await this.assertOwnVoice(ctx.actor.id, dto.voiceFileId);
    await this.prisma.$transaction(async (tx) => {
      const ok = await this.updateLocked(
        tx,
        id,
        dto.version,
        { status: current.status },
        {
          ...(dto.guardianId !== undefined ? { guardianId: dto.guardianId } : {}),
          ...(dto.text !== undefined ? { draftText: dto.text } : {}),
          ...(dto.voiceFileId !== undefined ? { draftVoiceFileId: dto.voiceFileId } : {}),
        },
      );
      if (!ok) throw new AppException('STATE_CHANGED');
      await this.event(tx, id, 'UPDATED', ctx.actor.id);
    });
    return toDetail(await this.detailRow(id), 'teacher');
  }

  /** Fige le brouillon en une nouvelle version et le soumet à la validation (FR-002, FR-003). */
  async submit(id: string, version: number, ctx: ActionContext) {
    const current = await this.own(ctx.actor, id);
    const target = nextStatus(current.status, 'SUBMIT');
    if (!target) throw new AppException('PARENT_COMM_NOT_EDITABLE');
    const reply = await this.isTeacherReply(current);
    if (
      missingForSubmit(
        { text: current.draftText, voiceFileId: current.draftVoiceFileId },
        'TEACHER',
        reply,
      ).length > 0
    ) {
      throw new AppException('PARENT_COMM_INCOMPLETE');
    }
    // Les droits sont revérifiés à la soumission : classe retirée ou représentant délié entre-temps.
    await this.assertRecipient(ctx.actor.id, current.studentId, current.guardianId);
    if (current.draftVoiceFileId) await this.assertOwnVoice(ctx.actor.id, current.draftVoiceFileId);

    const number = current.currentRevision + 1;
    let created: Notification[] = [];
    await this.prisma.$transaction(async (tx) => {
      const ok = await this.updateLocked(
        tx,
        id,
        version,
        { status: current.status },
        {
          status: target,
          currentRevision: number,
          submittedAt: new Date(),
          decisionReason: null,
        },
      );
      if (!ok) throw new AppException('STATE_CHANGED');
      await tx.parentCommunicationRevision.create({
        data: {
          communicationId: id,
          number,
          text: current.draftText!.trim(),
          voiceFileId: current.draftVoiceFileId,
        },
      });
      await this.event(tx, id, 'SUBMITTED', ctx.actor.id, { revision: number });
      await this.audit.log(
        'PARENT_COMMUNICATION_CHANGED',
        {
          actorId: ctx.actor.id,
          targetType: 'ParentCommunication',
          targetId: id,
          ip: ctx.ip,
          details: { event: 'SUBMITTED', revision: number },
        },
        tx,
      );
      created = await this.notifications.notifyCommunicationInTx(
        tx,
        await this.validatorIds(tx),
        ctx.actor.id,
        { type: 'PARENT_COMM_TO_VALIDATE', communicationId: id },
      );
    });
    await this.notifications.flushAfterCommit(created);
    return toDetail(await this.detailRow(id), 'teacher');
  }

  /**
   * Réponse dans une conversation commencée : l'enseignant y voit déjà un message, l'un des siens déjà
   * soumis ou un message validé du parent. Un message du parent encore en attente, invisible pour lui,
   * ne compte pas.
   */
  private async isTeacherReply(current: {
    id: string;
    teacherId: string;
    studentId: string;
    guardianId: string;
  }): Promise<boolean> {
    const earlier = await this.prisma.parentCommunication.count({
      where: {
        teacherId: current.teacherId,
        studentId: current.studentId,
        guardianId: current.guardianId,
        id: { not: current.id },
        OR: [
          { author: 'TEACHER', currentRevision: { gt: 0 } },
          { author: 'PARENT', status: 'APPROVED' },
        ],
      },
    });
    return earlier > 0;
  }

  async cancel(id: string, version: number, ctx: ActionContext) {
    const current = await this.own(ctx.actor, id);
    const target = nextStatus(current.status, 'CANCEL');
    if (!target) throw new AppException('PARENT_COMM_NOT_EDITABLE');
    await this.prisma.$transaction(async (tx) => {
      const ok = await this.updateLocked(
        tx,
        id,
        version,
        { status: current.status },
        { status: target },
      );
      if (!ok) throw new AppException('STATE_CHANGED');
      await this.event(tx, id, 'CANCELLED', ctx.actor.id);
      await this.audit.log(
        'PARENT_COMMUNICATION_CHANGED',
        {
          actorId: ctx.actor.id,
          targetType: 'ParentCommunication',
          targetId: id,
          ip: ctx.ip,
          details: { event: 'CANCELLED' },
        },
        tx,
      );
    });
    return toDetail(await this.detailRow(id), 'teacher');
  }

  // ------------------------------------------------------------------ Validation

  async listForValidation(user: AuthenticatedUser, query: ListCommunicationsQuery) {
    this.assertValidator(user);
    const status = query.status ?? 'PENDING_ADMIN_VALIDATION';
    const where: Prisma.ParentCommunicationWhereInput = {
      currentRevision: { gt: 0 },
      status: status === 'ALL' ? { not: 'DRAFT' } : status,
      ...(query.teacherId ? { teacherId: query.teacherId } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.classId ? { student: { classId: query.classId } } : {}),
      ...submittedWithin(query),
    };
    const rows = await this.prisma.parentCommunication.findMany({
      where,
      include: SUMMARY_INCLUDE,
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      take: 200,
    });
    return rows.map(toSummary);
  }

  async getForValidation(user: AuthenticatedUser, id: string) {
    this.assertValidator(user);
    const row = UUID.test(id)
      ? await this.prisma.parentCommunication.findUnique({ where: { id }, include: DETAIL_INCLUDE })
      : null;
    if (!row || !validatorCanSee(row.status, row.currentRevision))
      throw new AppException('NOT_FOUND');
    return toDetail(row, 'validator');
  }

  /**
   * Discussions de la validation (messagerie) : messages soumis regroupés par enseignant, élève et
   * représentant, avec le décompte par statut. Seul un aperçu du dernier message est renvoyé. Avec
   * une période, seuls les messages soumis dans la période sont regroupés et comptés.
   */
  async listDiscussions(user: AuthenticatedUser, period: DiscussionsQuery = {}) {
    this.assertValidator(user);
    const rows = await this.prisma.parentCommunication.findMany({
      where: { currentRevision: { gt: 0 }, status: { not: 'DRAFT' }, ...submittedWithin(period) },
      select: {
        id: true,
        teacherId: true,
        studentId: true,
        guardianId: true,
        author: true,
        status: true,
        submittedAt: true,
        ...SUMMARY_INCLUDE,
        revisions: { orderBy: { number: 'desc' }, take: 1, select: { text: true } },
      },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
    });
    return groupDiscussions(rows).map(({ key, last, firstPending, counts, total }) => ({
      key,
      teacher: last.teacher,
      student: last.student,
      guardian: last.guardian,
      lastMessage: {
        id: last.id,
        author: last.author,
        status: last.status,
        preview: (last.revisions[0]?.text ?? '').slice(0, PREVIEW_MAX),
        submittedAt: last.submittedAt,
      },
      firstPendingId: firstPending?.id ?? null,
      counts,
      total,
    }));
  }

  /**
   * Discussion d'un message : tous les messages soumis du même enseignant au même représentant du
   * même élève, du plus ancien au plus récent, chacun avec son statut, ses versions et son historique.
   */
  async getDiscussion(user: AuthenticatedUser, id: string) {
    this.assertValidator(user);
    const anchor = UUID.test(id)
      ? await this.prisma.parentCommunication.findUnique({
          where: { id },
          select: {
            teacherId: true,
            studentId: true,
            guardianId: true,
            status: true,
            currentRevision: true,
          },
        })
      : null;
    if (!anchor || !validatorCanSee(anchor.status, anchor.currentRevision))
      throw new AppException('NOT_FOUND');
    const rows = await this.prisma.parentCommunication.findMany({
      where: {
        teacherId: anchor.teacherId,
        studentId: anchor.studentId,
        guardianId: anchor.guardianId,
        currentRevision: { gt: 0 },
        status: { not: 'DRAFT' },
      },
      include: DETAIL_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const first = rows[0]!;
    return {
      key: discussionKey(anchor),
      teacher: first.teacher,
      student: first.student,
      guardian: first.guardian,
      messages: rows.map((row) => toDetail(row, 'validator')),
    };
  }

  /**
   * Approuver, retourner ou rejeter exactement la version examinée (FR-004). L'approbation publie la
   * communication et écrit l'événement outbox dans la même transaction (FR-009) ; rejouée, elle échoue
   * sans rien écrire (verrouillage optimiste et événement unique par communication).
   */
  async decide(id: string, dto: DecisionDto, ctx: ActionContext) {
    this.assertValidator(ctx.actor);
    const current = UUID.test(id)
      ? await this.prisma.parentCommunication.findUnique({ where: { id } })
      : null;
    if (!current || !validatorCanSee(current.status, current.currentRevision))
      throw new AppException('NOT_FOUND');
    // L'enseignant ne décide ni de ses propres messages ni de ceux qui lui sont adressés.
    if (current.teacherId === ctx.actor.id) throw new AppException('PARENT_COMM_SELF_DECISION');
    const reason = dto.reason?.trim() || null;
    if (dto.action !== 'APPROVE' && !reason) throw new AppException('REASON_REQUIRED');
    if (current.status === 'PENDING_ADMIN_VALIDATION' && current.currentRevision !== dto.revision) {
      throw new AppException('PARENT_COMM_REVISION_CHANGED');
    }
    const { action, event, notify } = DECISION_EVENT[dto.action];
    const target = nextStatus(current.status, action);
    if (!target) throw new AppException('PARENT_COMM_ALREADY_DECIDED');

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
      await this.event(tx, id, event, ctx.actor.id, {
        revision: dto.revision,
        reason: dto.action === 'APPROVE' ? null : reason,
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
      const guardian = await tx.guardian.findUnique({
        where: { id: current.guardianId },
        select: { userId: true, active: true, email: true, phone: true },
      });
      const parentUserId = guardian?.active ? guardian.userId : null;
      if (current.author === 'PARENT') {
        // Message du parent : la décision lui est notifiée ; validé, il est transmis à l'enseignant.
        // Aucune livraison externe ni événement outbox : n8n ne prévient que les parents.
        created = await this.notifications.notifyCommunicationInTx(
          tx,
          [parentUserId],
          ctx.actor.id,
          { type: notify, communicationId: id },
        );
        if (dto.action === 'APPROVE') {
          created.push(
            ...(await this.notifications.notifyCommunicationInTx(
              tx,
              [current.teacherId],
              ctx.actor.id,
              { type: 'TEACHER_MESSAGE_NEW', communicationId: id },
            )),
          );
        }
        return;
      }
      created = await this.notifications.notifyCommunicationInTx(
        tx,
        [current.teacherId],
        ctx.actor.id,
        { type: notify, communicationId: id },
      );
      if (dto.action === 'APPROVE') {
        // Publication : le parent destinataire (s'il a un compte) est prévenu dans l'application.
        if (parentUserId) {
          created.push(
            ...(await this.notifications.notifyCommunicationInTx(tx, [parentUserId], ctx.actor.id, {
              type: 'PARENT_MESSAGE_NEW',
              communicationId: id,
            })),
          );
        }
        // Livraisons externes à suivre (n8n) : une par canal activé et disponible pour ce représentant.
        const channels = guardian?.active ? this.channelsFor(guardian) : [];
        if (channels.length > 0) {
          await tx.parentCommunicationDelivery.createMany({
            data: channels.map((channel) => ({ communicationId: id, channel })),
            skipDuplicates: true,
          });
        }
        await tx.outboxEvent.create({
          data: {
            type: COMMUNICATION_APPROVED_EVENT,
            aggregateId: id,
            payload: { communicationId: id, revision: dto.revision, approvedAt: now.toISOString() },
          },
        });
      }
    });
    await this.notifications.flushAfterCommit(created);
    return toDetail(await this.detailRow(id), 'validator');
  }

  // ------------------------------------------------------------------ Parent

  /** Communications approuvées adressées au représentant de ce compte, pour ses enfants encore liés (FR-005). */
  private parentWhere(user: AuthenticatedUser): Prisma.ParentCommunicationWhereInput {
    return {
      status: 'APPROVED',
      author: 'TEACHER',
      guardian: { userId: user.id, active: true },
      student: { active: true, guardians: { some: { guardian: { userId: user.id } } } },
    };
  }

  private assertParent(user: AuthenticatedUser): void {
    if (!user.active || user.role !== 'PARENT') throw new AppException('FORBIDDEN');
  }

  async parentList(user: AuthenticatedUser) {
    this.assertParent(user);
    const rows = await this.prisma.parentCommunication.findMany({
      where: this.parentWhere(user),
      select: {
        id: true,
        status: true,
        decidedAt: true,
        readAt: true,
        teacher: { select: { displayName: true } },
        student: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      teacher: r.teacher,
      student: r.student,
      approvedAt: r.decidedAt,
      read: r.readAt !== null,
    }));
  }

  /** Lecture d'un message : la version approuvée seulement ; la première lecture est notée et journalisée. */
  async parentRead(user: AuthenticatedUser, id: string, ip: string | null) {
    this.assertParent(user);
    const row = UUID.test(id)
      ? await this.prisma.parentCommunication.findFirst({
          where: { id, ...this.parentWhere(user) },
          select: {
            id: true,
            status: true,
            approvedRevision: true,
            decidedAt: true,
            readAt: true,
            teacher: { select: { displayName: true } },
            student: { select: { firstName: true, lastName: true } },
            revisions: {
              select: {
                number: true,
                text: true,
                voiceFileId: true,
                voiceFile: { select: { durationSeconds: true } },
              },
            },
          },
        })
      : null;
    const approved = row?.revisions.find((r) => r.number === row.approvedRevision);
    if (!row || !parentCanSee(row.status) || !approved) {
      await this.audit.log('ACCESS_DENIED', {
        actorId: user.id,
        targetType: 'ParentCommunication',
        targetId: id.slice(0, 64),
        ip,
        details: { reason: 'NOT_VISIBLE', channel: 'http' },
      });
      throw new AppException('NOT_FOUND');
    }
    let readAt = row.readAt;
    if (!readAt) {
      readAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        const first = await tx.parentCommunication.updateMany({
          where: { id, readAt: null },
          data: { readAt },
        });
        if (first.count === 1) {
          await this.event(tx, id, 'READ', user.id);
          await this.audit.log(
            'PARENT_COMMUNICATION_READ',
            { actorId: user.id, targetType: 'ParentCommunication', targetId: id, ip },
            tx,
          );
        }
      });
    }
    return {
      id: row.id,
      teacher: row.teacher,
      student: row.student,
      text: approved.text,
      voiceFileId: approved.voiceFileId,
      durationSeconds: seconds(approved.voiceFile?.durationSeconds),
      approvedAt: row.decidedAt,
      readAt,
    };
  }

  // ------------------------------------------------------------------ Conversations (015)

  /** Représentant actif lié à ce compte parent ; sans lui, le compte ne voit ni n'envoie rien. */
  private async parentGuardian(user: AuthenticatedUser) {
    this.assertParent(user);
    const guardian = await this.prisma.guardian.findFirst({
      where: { userId: user.id, active: true },
      select: { id: true, firstName: true, lastName: true, relationship: true },
    });
    if (!guardian) throw new AppException('FORBIDDEN');
    return guardian;
  }

  /** Enfants du parent (élèves actifs liés) et enseignants réellement affectés à leur classe. */
  async parentChildren(user: AuthenticatedUser) {
    const guardian = await this.parentGuardian(user);
    const links = await this.prisma.guardianStudent.findMany({
      where: { guardianId: guardian.id, student: { active: true } },
      select: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            class: {
              select: {
                id: true,
                name: true,
                active: true,
                teachers: {
                  where: { teacher: { active: true, role: { not: 'PARENT' } } },
                  select: { teacher: { select: TEACHER_CARD } },
                  orderBy: { teacher: { displayName: 'asc' } },
                },
              },
            },
          },
        },
      },
      orderBy: [{ student: { firstName: 'asc' } }, { student: { lastName: 'asc' } }],
    });
    return links.map(({ student: { class: c, ...s } }) => ({
      ...s,
      class: { id: c.id, name: c.name },
      teachers: c.active ? c.teachers.map((t) => t.teacher) : [],
    }));
  }

  /**
   * L'élève est lié au représentant du parent et l'enseignant est affecté à sa classe : seules
   * conditions pour écrire. La lecture d'une conversation passée reste possible sans affectation.
   */
  private async canWrite(teacherId: string, studentId: string, guardianId: string) {
    const link = await this.prisma.guardianStudent.findFirst({
      where: {
        studentId,
        guardianId,
        guardian: { active: true },
        student: {
          active: true,
          class: { active: true, teachers: { some: { teacherId, teacher: { active: true } } } },
        },
      },
      select: { studentId: true },
    });
    return link !== null;
  }

  /** Messages d'une conversation visibles par `viewer`, du plus ancien au plus récent. */
  private async conversationRows(
    trio: { teacherId: string; studentId: string; guardianId: string },
    viewer: ParentCommunicationAuthor,
  ): Promise<ConversationRow[]> {
    const rows = await this.prisma.parentCommunication.findMany({
      where: {
        ...trio,
        OR: [
          { author: viewer, ...(viewer === 'PARENT' ? { status: { not: 'DRAFT' } } : {}) },
          { author: { not: viewer }, status: 'APPROVED' },
        ],
      },
      select: CONVERSATION_SELECT,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.filter((row) => visibleInConversation(row, viewer));
  }

  /** Première lecture des messages reçus (validés) : notée, historisée et journalisée une fois. */
  private async markRead(
    rows: ConversationRow[],
    viewer: ParentCommunicationAuthor,
    user: AuthenticatedUser,
    ip: string | null,
  ): Promise<void> {
    const unread = rows.filter((r) => r.author !== viewer && r.status === 'APPROVED' && !r.readAt);
    if (unread.length === 0) return;
    const readAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      for (const row of unread) {
        const first = await tx.parentCommunication.updateMany({
          where: { id: row.id, readAt: null, status: 'APPROVED' },
          data: { readAt },
        });
        if (first.count !== 1) continue;
        row.readAt = readAt;
        await this.event(tx, row.id, 'READ', user.id);
        await this.audit.log(
          'PARENT_COMMUNICATION_READ',
          { actorId: user.id, targetType: 'ParentCommunication', targetId: row.id, ip },
          tx,
        );
      }
    });
  }

  /** Conversations du parent : une par enseignant et par enfant, la plus récemment active d'abord. */
  async parentConversations(user: AuthenticatedUser) {
    const guardian = await this.parentGuardian(user);
    const rows = await this.prisma.parentCommunication.findMany({
      where: {
        guardianId: guardian.id,
        student: { active: true, guardians: { some: { guardianId: guardian.id } } },
        OR: [
          { author: 'PARENT', status: { not: 'DRAFT' } },
          { author: 'TEACHER', status: 'APPROVED' },
        ],
      },
      select: {
        ...CONVERSATION_SELECT,
        teacher: { select: TEACHER_CARD },
        student: { select: STUDENT_CARD },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return summarize(rows, 'PARENT', (r) => `${r.teacherId}.${r.studentId}`).map(
      ({ last, ...summary }) => ({ ...summary, teacher: last.teacher, student: last.student }),
    );
  }

  /** Conversation du parent avec un enseignant au sujet d'un enfant ; vide si elle n'a pas commencé. */
  async parentConversation(
    user: AuthenticatedUser,
    teacherId: string,
    studentId: string,
    ip: string | null,
  ) {
    const guardian = await this.parentGuardian(user);
    if (!UUID.test(teacherId) || !UUID.test(studentId)) throw new AppException('NOT_FOUND');
    const linked = await this.prisma.guardianStudent.findFirst({
      where: { guardianId: guardian.id, studentId, student: { active: true } },
      select: { student: { select: STUDENT_CARD } },
    });
    const trio = { teacherId, studentId, guardianId: guardian.id };
    const [canSend, rows, teacher] = await Promise.all([
      this.canWrite(teacherId, studentId, guardian.id),
      linked ? this.conversationRows(trio, 'PARENT') : Promise.resolve([]),
      this.prisma.user.findFirst({
        where: { id: teacherId, role: { not: 'PARENT' } },
        select: TEACHER_CARD,
      }),
    ]);
    // Enfant d'une autre famille, ou enseignant sans lien avec l'enfant : la conversation n'existe pas.
    if (!linked || !teacher || (!canSend && rows.length === 0)) {
      await this.audit.log('ACCESS_DENIED', {
        actorId: user.id,
        targetType: 'ParentConversation',
        targetId: `${teacherId}.${studentId}`.slice(0, 64),
        ip,
        details: { reason: 'NOT_VISIBLE', channel: 'http' },
      });
      throw new AppException('NOT_FOUND');
    }
    await this.markRead(rows, 'PARENT', user, ip);
    return {
      key: discussionKey(trio),
      teacher,
      student: linked.student,
      canSend,
      messages: rows.map((r) => toConversationMessage(r, 'PARENT')),
    };
  }

  /** Message d'un parent : créé et soumis directement à la validation (aucun brouillon côté parent). */
  async parentSend(
    user: AuthenticatedUser,
    teacherId: string,
    studentId: string,
    dto: ParentMessageDto,
    ip: string | null,
  ) {
    const guardian = await this.parentGuardian(user);
    if (
      !UUID.test(teacherId) ||
      !UUID.test(studentId) ||
      !(await this.canWrite(teacherId, studentId, guardian.id))
    ) {
      throw new AppException('PARENT_COMM_RECIPIENT_INVALID');
    }
    if (dto.voiceFileId) await this.assertOwnVoice(user.id, dto.voiceFileId);
    let created: Notification[] = [];
    const id = await this.prisma.$transaction(async (tx) => {
      const row = await tx.parentCommunication.create({
        data: {
          author: 'PARENT',
          teacherId,
          studentId,
          guardianId: guardian.id,
          status: 'PENDING_ADMIN_VALIDATION',
          draftText: dto.text,
          draftVoiceFileId: dto.voiceFileId ?? null,
          currentRevision: 1,
          submittedAt: new Date(),
        },
      });
      await tx.parentCommunicationRevision.create({
        data: {
          communicationId: row.id,
          number: 1,
          text: dto.text,
          voiceFileId: dto.voiceFileId ?? null,
        },
      });
      await this.event(tx, row.id, 'CREATED', user.id);
      await this.event(tx, row.id, 'SUBMITTED', user.id, { revision: 1 });
      await this.audit.log(
        'PARENT_COMMUNICATION_CHANGED',
        {
          actorId: user.id,
          targetType: 'ParentCommunication',
          targetId: row.id,
          ip,
          details: { event: 'SUBMITTED', author: 'PARENT', revision: 1, studentId },
        },
        tx,
      );
      created = await this.notifications.notifyCommunicationInTx(
        tx,
        await this.validatorIds(tx),
        user.id,
        { type: 'PARENT_COMM_TO_VALIDATE', communicationId: row.id },
      );
      return row.id;
    });
    await this.notifications.flushAfterCommit(created);
    return this.parentOwnMessage(id);
  }

  /** Message écrit par ce parent (tous états) ; sinon il n'existe pas pour lui (404). */
  private async parentOwn(user: AuthenticatedUser, id: string) {
    const guardian = await this.parentGuardian(user);
    const row = UUID.test(id)
      ? await this.prisma.parentCommunication.findUnique({ where: { id } })
      : null;
    if (!row || row.author !== 'PARENT' || row.guardianId !== guardian.id)
      throw new AppException('NOT_FOUND');
    return { row, guardian };
  }

  private async parentOwnMessage(id: string) {
    const row = await this.prisma.parentCommunication.findUniqueOrThrow({
      where: { id },
      select: CONVERSATION_SELECT,
    });
    return toConversationMessage(row, 'PARENT');
  }

  /** Correction d'un message retourné : nouvelle version, de nouveau soumise à la validation. */
  async parentResubmit(
    user: AuthenticatedUser,
    id: string,
    dto: ParentResubmitDto,
    ip: string | null,
  ) {
    const { row: current, guardian } = await this.parentOwn(user, id);
    const target =
      current.status === 'RETURNED_FOR_CORRECTION' ? nextStatus(current.status, 'SUBMIT') : null;
    if (!target) throw new AppException('PARENT_COMM_NOT_EDITABLE');
    if (!(await this.canWrite(current.teacherId, current.studentId, guardian.id)))
      throw new AppException('PARENT_COMM_RECIPIENT_INVALID');
    if (dto.voiceFileId) await this.assertOwnVoice(user.id, dto.voiceFileId);
    const number = current.currentRevision + 1;
    let created: Notification[] = [];
    await this.prisma.$transaction(async (tx) => {
      const ok = await this.updateLocked(
        tx,
        id,
        dto.version,
        { status: current.status, author: 'PARENT' },
        {
          status: target,
          draftText: dto.text,
          draftVoiceFileId: dto.voiceFileId ?? null,
          currentRevision: number,
          submittedAt: new Date(),
          decisionReason: null,
        },
      );
      if (!ok) throw new AppException('STATE_CHANGED');
      await tx.parentCommunicationRevision.create({
        data: { communicationId: id, number, text: dto.text, voiceFileId: dto.voiceFileId ?? null },
      });
      await this.event(tx, id, 'SUBMITTED', user.id, { revision: number });
      await this.audit.log(
        'PARENT_COMMUNICATION_CHANGED',
        {
          actorId: user.id,
          targetType: 'ParentCommunication',
          targetId: id,
          ip,
          details: { event: 'SUBMITTED', author: 'PARENT', revision: number },
        },
        tx,
      );
      created = await this.notifications.notifyCommunicationInTx(
        tx,
        await this.validatorIds(tx),
        user.id,
        { type: 'PARENT_COMM_TO_VALIDATE', communicationId: id },
      );
    });
    await this.notifications.flushAfterCommit(created);
    return this.parentOwnMessage(id);
  }

  /** Abandon d'un message retourné : il ne sera jamais transmis. */
  async parentCancel(user: AuthenticatedUser, id: string, version: number, ip: string | null) {
    const { row: current } = await this.parentOwn(user, id);
    const target =
      current.status === 'RETURNED_FOR_CORRECTION' ? nextStatus(current.status, 'CANCEL') : null;
    if (!target) throw new AppException('PARENT_COMM_NOT_EDITABLE');
    await this.prisma.$transaction(async (tx) => {
      const ok = await this.updateLocked(
        tx,
        id,
        version,
        { status: current.status, author: 'PARENT' },
        { status: target },
      );
      if (!ok) throw new AppException('STATE_CHANGED');
      await this.event(tx, id, 'CANCELLED', user.id);
      await this.audit.log(
        'PARENT_COMMUNICATION_CHANGED',
        {
          actorId: user.id,
          targetType: 'ParentCommunication',
          targetId: id,
          ip,
          details: { event: 'CANCELLED', author: 'PARENT' },
        },
        tx,
      );
    });
    return this.parentOwnMessage(id);
  }

  /**
   * Conversation d'un message vu par le parent (lien d'une notification) : son propre message, quel que
   * soit son état, ou un message validé de l'enseignant.
   */
  async parentMessageConversation(user: AuthenticatedUser, id: string) {
    const guardian = await this.parentGuardian(user);
    const row = UUID.test(id)
      ? await this.prisma.parentCommunication.findFirst({
          where: {
            id,
            guardianId: guardian.id,
            OR: [
              { author: 'PARENT', status: { not: 'DRAFT' } },
              { author: 'TEACHER', status: 'APPROVED' },
            ],
          },
          select: { teacherId: true, studentId: true },
        })
      : null;
    if (!row) throw new AppException('NOT_FOUND');
    return row;
  }

  /** Paires (élève, représentant) que l'enseignant peut joindre aujourd'hui. */
  private async teacherReach(teacherId: string): Promise<Set<string>> {
    const links = await this.prisma.guardianStudent.findMany({
      where: {
        guardian: { active: true },
        student: { active: true, class: { teachers: { some: { teacherId } } } },
      },
      select: { studentId: true, guardianId: true },
    });
    return new Set(links.map((l) => `${l.studentId}.${l.guardianId}`));
  }

  /**
   * Conversations de l'enseignant : ses messages (tous états) et les messages validés des parents, pour
   * les élèves de ses classes et leurs représentants actuels. Un message de parent non validé n'y
   * figure jamais : la conversation ouverte par un parent n'apparaît qu'après validation.
   */
  async teacherConversations(user: AuthenticatedUser) {
    await this.assertTeacher(user);
    const reach = await this.teacherReach(user.id);
    const rows = await this.prisma.parentCommunication.findMany({
      where: {
        teacherId: user.id,
        OR: [{ author: 'TEACHER' }, { author: 'PARENT', status: 'APPROVED' }],
      },
      select: {
        ...CONVERSATION_SELECT,
        student: { select: STUDENT_CARD },
        guardian: { select: GUARDIAN_CARD },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const reachable = rows.filter((r) => reach.has(`${r.studentId}.${r.guardianId}`));
    return summarize(reachable, 'TEACHER', (r) => `${r.studentId}.${r.guardianId}`).map(
      ({ last, ...summary }) => ({ ...summary, student: last.student, guardian: last.guardian }),
    );
  }

  /** Conversation d'un message vu par l'enseignant (lien d'une notification) : le sien, ou celui d'un parent validé. */
  async teacherMessageConversation(user: AuthenticatedUser, id: string) {
    await this.assertTeacher(user);
    const row = UUID.test(id)
      ? await this.prisma.parentCommunication.findFirst({
          where: {
            id,
            teacherId: user.id,
            OR: [{ author: 'TEACHER' }, { author: 'PARENT', status: 'APPROVED' }],
          },
          select: { studentId: true, guardianId: true },
        })
      : null;
    if (!row) throw new AppException('NOT_FOUND');
    return row;
  }

  /** Conversation de l'enseignant avec un représentant au sujet d'un élève de ses classes. */
  async teacherConversation(
    user: AuthenticatedUser,
    studentId: string,
    guardianId: string,
    ip: string | null,
  ) {
    await this.assertTeacher(user);
    if (
      !UUID.test(studentId) ||
      !UUID.test(guardianId) ||
      !(await this.teacherReach(user.id)).has(`${studentId}.${guardianId}`)
    ) {
      await this.audit.log('ACCESS_DENIED', {
        actorId: user.id,
        targetType: 'ParentConversation',
        targetId: `${studentId}.${guardianId}`.slice(0, 64),
        ip,
        details: { reason: 'NOT_VISIBLE', channel: 'http' },
      });
      throw new AppException('NOT_FOUND');
    }
    const trio = { teacherId: user.id, studentId, guardianId };
    const [rows, student, guardian] = await Promise.all([
      this.conversationRows(trio, 'TEACHER'),
      this.prisma.student.findUniqueOrThrow({ where: { id: studentId }, select: STUDENT_CARD }),
      this.prisma.guardian.findUniqueOrThrow({ where: { id: guardianId }, select: GUARDIAN_CARD }),
    ]);
    await this.markRead(rows, 'TEACHER', user, ip);
    return {
      key: discussionKey(trio),
      student,
      guardian,
      messages: rows.map((r) => toConversationMessage(r, 'TEACHER')),
    };
  }

  // ------------------------------------------------------------------ Fichiers vocaux

  /**
   * Accès à un vocal de communication (FR-006) : l'auteur du message ; la validation pour une version
   * soumise ; le destinataire (parent ou enseignant) pour la version approuvée seulement. null : ce
   * fichier n'est pas un vocal de communication.
   */
  async canReadVoice(
    user: AuthenticatedUser,
    fileId: string,
    uploaderId: string,
  ): Promise<boolean | null> {
    const communications = await this.prisma.parentCommunication.findMany({
      where: {
        OR: [{ draftVoiceFileId: fileId }, { revisions: { some: { voiceFileId: fileId } } }],
      },
      select: {
        id: true,
        author: true,
        teacherId: true,
        status: true,
        currentRevision: true,
        approvedRevision: true,
        guardian: { select: { userId: true, active: true } },
        revisions: { where: { voiceFileId: fileId }, select: { number: true } },
      },
    });
    if (communications.length === 0) return null;
    const approvedHere = (c: (typeof communications)[number]) =>
      parentCanSee(c.status) && c.revisions.some((r) => r.number === c.approvedRevision);
    if (user.role !== 'PARENT') {
      if (
        uploaderId === user.id ||
        communications.some((c) => c.author === 'TEACHER' && c.teacherId === user.id)
      )
        return true;
      // Enseignant destinataire : le vocal d'un parent, une fois validé, seulement.
      if (
        communications.some(
          (c) => c.author === 'PARENT' && c.teacherId === user.id && approvedHere(c),
        )
      )
        return true;
    }
    if (this.isValidator(user))
      return communications.some(
        (c) => validatorCanSee(c.status, c.currentRevision) && c.revisions.length > 0,
      );
    if (user.role === 'PARENT' && user.active) {
      for (const c of communications) {
        // Son propre message, quel que soit son état.
        if (c.author === 'PARENT' && c.guardian.active && c.guardian.userId === user.id)
          return true;
        if (c.author !== 'TEACHER' || !approvedHere(c)) continue;
        const visible = await this.prisma.parentCommunication.count({
          where: { id: c.id, ...this.parentWhere(user) },
        });
        if (visible > 0) return true;
      }
    }
    return false;
  }
}
