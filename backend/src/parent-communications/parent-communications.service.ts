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
  type CommunicationAction,
} from './domain/communication-workflow';
import type {
  CreateCommunicationDto,
  DecisionDto,
  ListCommunicationsQuery,
  UpdateCommunicationDto,
} from './parent-communications.dto';

/** Événement outbox publié à l'approbation, transmis à n8n (015, FR-009). */
export const COMMUNICATION_APPROVED_EVENT = 'PARENT_COMMUNICATION_APPROVED';

export interface ActionContext {
  actor: AuthenticatedUser;
  ip: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      durationSeconds: seconds(r.voiceFile.durationSeconds),
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
      where: { teacherId: user.id },
      include: SUMMARY_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toSummary);
  }

  /** Communication de l'enseignant ; celle d'un autre enseignant n'existe pas pour lui (404). */
  private async own(user: AuthenticatedUser, id: string) {
    await this.assertTeacher(user);
    const row = UUID.test(id)
      ? await this.prisma.parentCommunication.findUnique({ where: { id } })
      : null;
    if (!row || row.teacherId !== user.id) throw new AppException('NOT_FOUND');
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
    if (
      missingForSubmit({ text: current.draftText, voiceFileId: current.draftVoiceFileId }).length >
      0
    ) {
      throw new AppException('PARENT_COMM_INCOMPLETE');
    }
    // Les droits sont revérifiés à la soumission : classe retirée ou représentant délié entre-temps.
    await this.assertRecipient(ctx.actor.id, current.studentId, current.guardianId);
    await this.assertOwnVoice(ctx.actor.id, current.draftVoiceFileId!);

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
          voiceFileId: current.draftVoiceFileId!,
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
      ...(query.from || query.to
        ? {
            submittedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: upperBound(query.to) } : {}),
            },
          }
        : {}),
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
      created = await this.notifications.notifyCommunicationInTx(
        tx,
        [current.teacherId],
        ctx.actor.id,
        { type: notify, communicationId: id },
      );
      if (dto.action === 'APPROVE') {
        // Publication : le parent destinataire (s'il a un compte) est prévenu dans l'application.
        const guardian = await tx.guardian.findUnique({
          where: { id: current.guardianId },
          select: { userId: true, active: true, email: true, phone: true },
        });
        if (guardian?.active && guardian.userId) {
          created.push(
            ...(await this.notifications.notifyCommunicationInTx(
              tx,
              [guardian.userId],
              ctx.actor.id,
              { type: 'PARENT_MESSAGE_NEW', communicationId: id },
            )),
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
      durationSeconds: seconds(approved.voiceFile.durationSeconds),
      approvedAt: row.decidedAt,
      readAt,
    };
  }

  // ------------------------------------------------------------------ Fichiers vocaux

  /**
   * Accès à un vocal de communication (FR-006) : l'auteur ; la validation pour une version soumise ; le
   * parent destinataire pour la version approuvée. null : ce fichier n'est pas un vocal de communication.
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
        teacherId: true,
        status: true,
        currentRevision: true,
        approvedRevision: true,
        revisions: { where: { voiceFileId: fileId }, select: { number: true } },
      },
    });
    if (communications.length === 0) return null;
    if (
      user.role !== 'PARENT' &&
      (uploaderId === user.id || communications.some((c) => c.teacherId === user.id))
    )
      return true;
    if (this.isValidator(user))
      return communications.some(
        (c) => validatorCanSee(c.status, c.currentRevision) && c.revisions.length > 0,
      );
    if (user.role === 'PARENT' && user.active) {
      for (const c of communications) {
        if (!parentCanSee(c.status) || !c.revisions.some((r) => r.number === c.approvedRevision))
          continue;
        const visible = await this.prisma.parentCommunication.count({
          where: { id: c.id, ...this.parentWhere(user) },
        });
        if (visible > 0) return true;
      }
    }
    return false;
  }
}
