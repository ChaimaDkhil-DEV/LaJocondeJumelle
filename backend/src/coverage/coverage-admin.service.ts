import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type RequestStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { toCsv } from '../common/csv';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import type { AppConfig } from '../config/config';
import { APP_CONFIG } from '../config/config.module';
import { CoverageActionsService } from './coverage-actions.service';
import { availabilityFor, availableMembers } from './coverage-availability';
import type { ClassDto, GroupDto, ListCoverageQuery } from './coverage.dto';
import { COVERAGE_INCLUDE, toCoverageSummary, type CoverageRow } from './coverage.mapper';
import { coverageFilters } from './coverage.service';
import { ACTIVE_GUARD_STATUSES } from './domain/coverage-state-machine';
import { signQrToken } from './domain/qr-token';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AdminContext {
  actor: AuthenticatedUser;
  ip: string | null;
}

function invalid(field: string, message: string): AppException {
  return new AppException('VALIDATION_ERROR', { fields: [{ field, messages: [message] }] }, message);
}

function conflict(message: string): AppException {
  return new AppException('CONFLICT', undefined, message);
}

/** Libellés des statuts pour l'export (mêmes libellés que l'interface). */
export const COVERAGE_STATUS_LABELS: Partial<Record<RequestStatus, string>> = {
  BROADCAST: 'Diffusée',
  UNFILLED: 'Non pourvue',
  ACCEPTED: 'Acceptée',
  EN_ROUTE: 'En route',
  LATE: 'En retard',
  ON_DUTY: 'En garde',
  RELIEF_PENDING: 'Relève demandée',
  DONE: 'Relevée',
  CLOSED: 'Clôturée',
  CANCELLED: 'Annulée',
};

const SECONDS = (ms: number) => Math.round(ms / 1000);

/**
 * Administration des données de référence (groupes, classes et QR codes) et suivi des employés
 * pour le super administrateur. Toutes les routes sont protégées par SuperAdminGuard.
 */
@Injectable()
export class CoverageAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly actions: CoverageActionsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ---------------------------------------------------------------------------
  // Groupes
  // ---------------------------------------------------------------------------

  async groups() {
    const groups = await this.prisma.employeeGroup.findMany({
      include: { members: { include: { user: { select: { id: true, displayName: true, active: true } } } } },
      orderBy: { name: 'asc' },
    });
    const now = new Date();
    return Promise.all(
      groups.map(async (g) => {
        const members = g.members.map((m) => m.user).filter((u) => u.active);
        const available = await availableMembers(this.prisma, [g.id], { startAt: now, plannedEndAt: null });
        return {
          id: g.id,
          name: g.name,
          active: g.active,
          members: members.map((u) => ({ id: u.id, displayName: u.displayName })).sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr')),
          memberCount: members.length,
          availableCount: available.length,
        };
      }),
    );
  }

  async createGroup(dto: GroupDto, ctx: AdminContext) {
    await this.checkMembers(dto.memberIds);
    try {
      await this.prisma.$transaction(async (tx) => {
        const group = await tx.employeeGroup.create({
          data: { name: dto.name, active: dto.active ?? true, members: { create: dto.memberIds.map((userId) => ({ userId })) } },
        });
        await this.audit.log(
          'GROUP_CHANGED',
          { actorId: ctx.actor.id, ip: ctx.ip, targetType: 'EmployeeGroup', targetId: group.id, details: { after: { name: dto.name, memberIds: dto.memberIds } } },
          tx,
        );
      });
    } catch (error) {
      throw this.uniqueName(error, 'Ce nom de groupe existe déjà.');
    }
    return this.groups();
  }

  async updateGroup(id: string, dto: GroupDto, ctx: AdminContext) {
    const current = UUID.test(id)
      ? await this.prisma.employeeGroup.findUnique({ where: { id }, include: { members: true } })
      : null;
    if (!current) throw new AppException('NOT_FOUND');
    await this.checkMembers(dto.memberIds);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.employeeGroup.update({ where: { id }, data: { name: dto.name, active: dto.active ?? current.active } });
        await tx.employeeGroupMember.deleteMany({ where: { groupId: id } });
        await tx.employeeGroupMember.createMany({ data: dto.memberIds.map((userId) => ({ groupId: id, userId })) });
        await this.audit.log(
          'GROUP_CHANGED',
          {
            actorId: ctx.actor.id,
            ip: ctx.ip,
            targetType: 'EmployeeGroup',
            targetId: id,
            details: {
              before: { name: current.name, active: current.active, memberIds: current.members.map((m) => m.userId).sort() },
              after: { name: dto.name, active: dto.active ?? current.active, memberIds: [...dto.memberIds].sort() },
            },
          },
          tx,
        );
      });
    } catch (error) {
      throw this.uniqueName(error, 'Ce nom de groupe existe déjà.');
    }
    return this.groups();
  }

  /** Membres : comptes actifs de rôle employé. */
  private async checkMembers(userIds: string[]): Promise<void> {
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds }, active: true, role: 'EMPLOYEE' }, select: { id: true } });
    if (users.length !== userIds.length) throw invalid('memberIds', 'Un des comptes choisis est introuvable, désactivé ou n’est pas un employé.');
  }

  // ---------------------------------------------------------------------------
  // Classes et QR codes
  // ---------------------------------------------------------------------------

  async classes() {
    return this.prisma.schoolClass.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, room: true, active: true, qrVersion: true, updatedAt: true },
    });
  }

  async createClass(dto: ClassDto, ctx: AdminContext) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.schoolClass.create({ data: { name: dto.name, room: dto.room ?? null, active: dto.active ?? true } });
        await this.audit.log(
          'CLASS_CHANGED',
          { actorId: ctx.actor.id, ip: ctx.ip, targetType: 'SchoolClass', targetId: created.id, details: { after: { name: dto.name, room: dto.room ?? null } } },
          tx,
        );
      });
    } catch (error) {
      throw this.uniqueName(error, 'Cette classe existe déjà.');
    }
    return this.classes();
  }

  async updateClass(id: string, dto: ClassDto, ctx: AdminContext) {
    const current = await this.findClass(id);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.schoolClass.update({
          where: { id },
          data: { name: dto.name, room: dto.room ?? null, active: dto.active ?? current.active },
        });
        await this.audit.log(
          'CLASS_CHANGED',
          {
            actorId: ctx.actor.id,
            ip: ctx.ip,
            targetType: 'SchoolClass',
            targetId: id,
            details: {
              before: { name: current.name, room: current.room, active: current.active },
              after: { name: dto.name, room: dto.room ?? null, active: dto.active ?? current.active },
            },
          },
          tx,
        );
      });
    } catch (error) {
      throw this.uniqueName(error, 'Cette classe existe déjà.');
    }
    return this.classes();
  }

  /** Lien encodé dans le QR code imprimable de la classe (version en cours). */
  async qr(id: string) {
    const schoolClass = await this.findClass(id);
    const token = signQrToken(this.actions.key, schoolClass.id, schoolClass.qrVersion);
    return {
      classId: schoolClass.id,
      name: schoolClass.name,
      room: schoolClass.room,
      version: schoolClass.qrVersion,
      url: `${this.config.appOrigin}/gardes/presence?c=${encodeURIComponent(token)}`,
    };
  }

  /** Révocation : les QR déjà imprimés deviennent invalides ; il faut réimprimer le nouveau. */
  async revokeQr(id: string, ctx: AdminContext) {
    const current = await this.findClass(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.schoolClass.update({ where: { id }, data: { qrVersion: { increment: 1 } } });
      await this.audit.log(
        'QR_REVOKED',
        {
          actorId: ctx.actor.id,
          ip: ctx.ip,
          targetType: 'SchoolClass',
          targetId: id,
          details: { before: { qrVersion: current.qrVersion }, after: { qrVersion: current.qrVersion + 1 } },
        },
        tx,
      );
    });
    return this.qr(id);
  }

  private async findClass(id: string) {
    const row = UUID.test(id) ? await this.prisma.schoolClass.findUnique({ where: { id } }) : null;
    if (!row) throw new AppException('NOT_FOUND');
    return row;
  }

  // ---------------------------------------------------------------------------
  // Tableau de suivi (super administrateur)
  // ---------------------------------------------------------------------------

  async dashboard(query: ListCoverageQuery) {
    const now = new Date();
    const filters = coverageFilters({ ...query, includeFinished: 'true' });
    const rows = await this.prisma.request.findMany({
      where: { AND: [{ kind: 'COVERAGE' }, ...filters] },
      include: COVERAGE_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 2000,
    });

    // Chiffres calculés sur les mêmes lignes que la liste (aucune source parallèle).
    const count = (...statuses: RequestStatus[]) => rows.filter((r) => statuses.includes(r.status)).length;
    const counts = {
      open: count('BROADCAST'),
      unfilled: count('UNFILLED'),
      taken: count('ACCEPTED', 'EN_ROUTE'),
      late: count('LATE'),
      onDuty: count('ON_DUTY', 'RELIEF_PENDING'),
      reliefPending: count('RELIEF_PENDING'),
      relieved: count('DONE', 'CLOSED'),
      cancelled: count('CANCELLED'),
      total: rows.length,
    };
    const active = rows.filter((r) => !['DONE', 'CLOSED', 'CANCELLED'].includes(r.status)).map(toCoverageSummary);

    const [employees, groups] = await Promise.all([this.employeeStats(rows, query, now), this.groups()]);
    return {
      generatedAt: now,
      counts,
      active,
      employees,
      emptyGroups: groups
        .filter((g) => g.active && (g.memberCount === 0 || g.availableCount === 0))
        .map((g) => ({ id: g.id, name: g.name, memberCount: g.memberCount, availableCount: g.availableCount })),
    };
  }

  /** Statistiques par employé, sur la période et les filtres demandés. */
  private async employeeStats(rows: CoverageRow[], query: ListCoverageQuery, now: Date) {
    const employees = await this.prisma.user.findMany({
      where: {
        active: true,
        role: 'EMPLOYEE',
        ...(query.assigneeId ? { id: query.assigneeId } : {}),
        OR: [{ groupMemberships: { some: {} } }, { requestsAssigned: { some: { kind: 'COVERAGE' } } }],
      },
      select: { id: true, displayName: true, jobTitle: true },
      orderBy: { displayName: 'asc' },
    });
    const ids = employees.map((e) => e.id);
    const requestIds = rows.map((r) => r.id);
    const [availability, events, current, workTasks] = await Promise.all([
      availabilityFor(this.prisma, ids, { startAt: now, plannedEndAt: null }),
      this.prisma.requestEvent.findMany({
        where: { requestId: { in: requestIds }, type: { in: ['STATUS_CHANGED', 'ASSIGNED', 'RELEASED', 'OVERDUE'] } },
        select: { requestId: true, type: true, fromValue: true, toValue: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { seq: 'asc' }],
      }),
      // Garde en cours, quelle que soit la période.
      this.prisma.request.findMany({
        where: { kind: 'COVERAGE', assigneeId: { in: ids }, status: { in: [...ACTIVE_GUARD_STATUSES] } },
        include: COVERAGE_INCLUDE,
      }),
      this.prisma.request.groupBy({
        by: ['assigneeId'],
        where: { kind: 'WORK', assigneeId: { in: ids }, status: { in: ['ACCEPTED', 'IN_PROGRESS'] } },
        _count: { _all: true },
      }),
    ]);

    // Délai de prise en charge : de la (re)diffusion à l'acceptation par l'employé lui-même.
    const takeovers = new Map<string, number[]>();
    const lates = new Map<string, number>();
    const releases = new Map<string, number>();
    const broadcastAt = new Map<string, Date>();
    for (const e of events) {
      const to = (e.toValue ?? {}) as Record<string, unknown>;
      const from = (e.fromValue ?? {}) as Record<string, unknown>;
      if (e.type === 'STATUS_CHANGED' && to.status === 'BROADCAST') broadcastAt.set(e.requestId, e.createdAt);
      if (e.type === 'ASSIGNED' && to.selfAccepted && typeof to.assigneeId === 'string') {
        const start = broadcastAt.get(e.requestId);
        if (start) takeovers.set(to.assigneeId, [...(takeovers.get(to.assigneeId) ?? []), e.createdAt.getTime() - start.getTime()]);
      }
      if (e.type === 'OVERDUE' && to.stage === 'ARRIVAL' && typeof to.assigneeId === 'string') {
        lates.set(to.assigneeId, (lates.get(to.assigneeId) ?? 0) + 1);
      }
      if (e.type === 'RELEASED' && !to.byManager && typeof from.assigneeId === 'string') {
        releases.set(from.assigneeId, (releases.get(from.assigneeId) ?? 0) + 1);
      }
    }

    return employees.map((e) => {
      const durations = takeovers.get(e.id) ?? [];
      const guard = current.find((r) => r.assigneeId === e.id);
      const a = availability.get(e.id);
      return {
        id: e.id,
        displayName: e.displayName,
        jobTitle: e.jobTitle,
        availability: a?.availability ?? 'AVAILABLE',
        available: a?.available ?? false,
        currentGuard: guard
          ? {
              requestId: guard.id,
              reference: guard.reference,
              status: guard.status,
              class: guard.coverage!.class,
              since: guard.coverage!.presenceAt ?? guard.acceptedAt,
            }
          : null,
        activeWorkTasks: workTasks.find((w) => w.assigneeId === e.id)?._count._all ?? 0,
        guardsDone: rows.filter((r) => r.assigneeId === e.id && (r.status === 'DONE' || r.status === 'CLOSED')).length,
        averageTakeoverSeconds: durations.length ? SECONDS(durations.reduce((s, d) => s + d, 0) / durations.length) : null,
        lates: lates.get(e.id) ?? 0,
        releases: releases.get(e.id) ?? 0,
      };
    });
  }

  /** Export CSV (séparateur « ; », UTF-8 avec BOM pour les tableurs, heures en UTC ISO 8601). */
  async exportCsv(query: ListCoverageQuery): Promise<string> {
    const rows = await this.prisma.request.findMany({
      where: { AND: [{ kind: 'COVERAGE' }, ...coverageFilters({ ...query, includeFinished: query.includeFinished ?? 'true' })] },
      include: COVERAGE_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10_000,
    });
    const header = [
      'Référence', 'Statut', 'Priorité', 'Classe', 'Salle', 'Groupes', 'Demandeur', 'Preneur', 'Enseignant absent',
      'Création', 'Diffusion', 'Acceptation', 'Départ', 'Présence confirmée', 'Relève', 'Clôture', 'Annulation',
      'Durée de garde (min)', 'Désistements', 'Prolongations', 'Motif d’annulation',
    ];
    const lines = rows.map((r) => {
      const c = r.coverage!;
      return [
        r.reference, COVERAGE_STATUS_LABELS[r.status] ?? r.status, r.priority, c.class.name, c.class.room,
        c.targets.map((t) => t.group.name).join(', '), r.requester.displayName, r.assignee?.displayName, c.absentTeacher,
        r.createdAt, c.broadcastAt, r.acceptedAt, c.departedAt, c.presenceAt, c.relievedAt, r.closedAt, r.cancelledAt,
        c.durationMinutes, c.releaseCount, c.extensionCount, c.cancelReason,
      ];
    });
    return toCsv(header, lines);
  }

  private uniqueName(error: unknown, message: string): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return conflict(message);
    return error;
  }
}
