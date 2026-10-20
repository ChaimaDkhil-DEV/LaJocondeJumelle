import { Injectable } from '@nestjs/common';
import { Prisma, type Category, type Circuit, type Priority, type RoutingMode } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import type { AdminContext } from '../users/users.service';
import type { CreateCategoryDto, DeadlineRulesDto, UpdateCategoryDto } from './admin-categories.dto';
import {
  DEFAULT_COVERAGE_DEADLINES,
  DEFAULT_DEADLINES,
  PRIORITY_ORDER,
  type DeadlineDurations,
} from './category-defaults';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AdminDeadlineRule extends DeadlineDurations {
  priority: Priority;
}

export interface AdminCategory
  extends Pick<
    Category,
    | 'id'
    | 'name'
    | 'active'
    | 'circuit'
    | 'routingMode'
    | 'creatorRoles'
    | 'closureMode'
    | 'autoCloseAfterMinutes'
    | 'finalValidation'
    | 'assignmentMode'
    | 'autoAssigneeId'
    | 'photoRequired'
    | 'kind'
    | 'proofMode'
  > {
  recipients: Array<{ id: string; displayName: string }>;
  managers: Array<{ id: string; displayName: string }>;
  deadlineRules: AdminDeadlineRule[];
}

const MEMBER = { select: { user: { select: { id: true, displayName: true } } } } as const;
const ADMIN_CATEGORY_INCLUDE = {
  recipients: MEMBER,
  managers: MEMBER,
  deadlineRules: true,
} satisfies Prisma.CategoryInclude;

type CategoryRow = Prisma.CategoryGetPayload<{ include: typeof ADMIN_CATEGORY_INCLUDE }>;

/** Champs de catégorie tracés avant/après dans l'audit. */
const CATEGORY_FIELDS = [
  'name',
  'active',
  'circuit',
  'routingMode',
  'creatorRoles',
  'closureMode',
  'autoCloseAfterMinutes',
  'finalValidation',
  'assignmentMode',
  'autoAssigneeId',
  'photoRequired',
  'proofMode',
] as const;
type CategoryField = (typeof CATEGORY_FIELDS)[number];
type CategoryValues = Pick<Category, CategoryField>;

function invalid(field: string, message: string): AppException {
  return new AppException('VALIDATION_ERROR', { fields: [{ field, messages: [message] }] }, message);
}

/** Le circuit est déduit du mode : seule la validation par l'administration passe par le circuit B. */
function circuitFor(mode: RoutingMode): Circuit {
  return mode === 'VIA_ADMIN' ? 'B_ADMIN_VALIDATION' : 'A_DIRECT';
}

/** Mode et circuit cohérents : le mode prime ; un circuit seul (ancien client) donne le mode. */
function routing(requested: { routingMode?: RoutingMode; circuit?: Circuit }, current?: Pick<Category, 'routingMode' | 'circuit'>) {
  if (requested.routingMode) {
    if (requested.circuit && requested.circuit !== circuitFor(requested.routingMode)) {
      throw invalid('circuit', 'Le circuit ne correspond pas au mode de routage choisi.');
    }
    return { routingMode: requested.routingMode, circuit: circuitFor(requested.routingMode) };
  }
  if (requested.circuit && requested.circuit !== current?.circuit) {
    const mode: RoutingMode = requested.circuit === 'B_ADMIN_VALIDATION' ? 'VIA_ADMIN' : 'DIRECT';
    return { routingMode: mode, circuit: requested.circuit };
  }
  const mode = current?.routingMode ?? 'DIRECT';
  return { routingMode: mode, circuit: circuitFor(mode) };
}

function byName(a: { displayName: string }, b: { displayName: string }): number {
  return a.displayName.localeCompare(b.displayName, 'fr');
}

function toAdminCategory(row: CategoryRow): AdminCategory {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    circuit: row.circuit,
    routingMode: row.routingMode,
    creatorRoles: row.creatorRoles,
    closureMode: row.closureMode,
    autoCloseAfterMinutes: row.autoCloseAfterMinutes,
    finalValidation: row.finalValidation,
    assignmentMode: row.assignmentMode,
    autoAssigneeId: row.autoAssigneeId,
    photoRequired: row.photoRequired,
    kind: row.kind,
    proofMode: row.proofMode,
    recipients: row.recipients.map((r) => r.user).sort(byName),
    managers: row.managers.map((m) => m.user).sort(byName),
    deadlineRules: [...row.deadlineRules]
      .sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority))
      .map((r) => ({
        priority: r.priority,
        validationMinutes: r.validationMinutes,
        takeoverMinutes: r.takeoverMinutes,
        completionMinutes: r.completionMinutes,
        arrivalMinutes: r.arrivalMinutes,
      })),
  };
}

/**
 * Administration des catégories (US8). Les modifications ne touchent que les nouvelles demandes :
 * chaque demande garde l'instantané des règles pris à sa création (FR-022).
 */
@Injectable()
export class AdminCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<AdminCategory[]> {
    const rows = await this.prisma.category.findMany({ include: ADMIN_CATEGORY_INCLUDE, orderBy: { name: 'asc' } });
    return rows.map(toAdminCategory);
  }

  async create(dto: CreateCategoryDto, ctx: AdminContext): Promise<AdminCategory> {
    const values: CategoryValues = {
      name: dto.name,
      active: true,
      ...routing(dto),
      creatorRoles: dto.creatorRoles,
      closureMode: dto.closureMode,
      autoCloseAfterMinutes: dto.autoCloseAfterMinutes ?? 1440,
      finalValidation: dto.finalValidation ?? false,
      assignmentMode: dto.assignmentMode ?? 'MANUAL',
      autoAssigneeId: dto.autoAssigneeId ?? null,
      photoRequired: dto.photoRequired ?? false,
      proofMode: dto.proofMode ?? 'PHOTO',
    };
    const kind = dto.kind ?? 'WORK';
    this.checkCircuitRules(values, new Set(), kind);
    await this.checkNameAvailable(values.name);

    const id = await this.write(async (tx) => {
      const created = await tx.category.create({
        data: {
          ...values,
          kind,
          deadlineRules: {
            create: PRIORITY_ORDER.map((priority) =>
              kind === 'COVERAGE'
                ? { priority, ...DEFAULT_COVERAGE_DEADLINES }
                : {
                    priority,
                    ...DEFAULT_DEADLINES[priority],
                    validationMinutes:
                      values.circuit === 'B_ADMIN_VALIDATION' ? DEFAULT_DEADLINES[priority].validationMinutes : null,
                  },
            ),
          },
        },
      });
      await this.logChange(tx, ctx, created.id, { after: { ...values, kind } });
      return created.id;
    });
    return this.get(id);
  }

  async update(id: string, dto: UpdateCategoryDto, ctx: AdminContext): Promise<AdminCategory> {
    const current = await this.find(id);
    if (dto.kind !== undefined && dto.kind !== current.kind) {
      throw invalid('kind', 'Le type de catégorie (travail ou couverture) ne peut pas être modifié après sa création.');
    }
    const next: CategoryValues = { ...pickValues(current) };
    for (const field of CATEGORY_FIELDS) {
      const value = dto[field];
      if (value !== undefined) (next as Record<CategoryField, unknown>)[field] = value;
    }
    Object.assign(next, routing(dto, current));
    this.checkCircuitRules(next, new Set(current.recipients.map((r) => r.user.id)), current.kind);
    if (next.name.toLowerCase() !== current.name.toLowerCase()) await this.checkNameAvailable(next.name);

    const changed = CATEGORY_FIELDS.filter((f) => JSON.stringify(next[f]) !== JSON.stringify(current[f]));
    if (changed.length === 0) return toAdminCategory(current);

    await this.write(async (tx) => {
      await tx.category.update({ where: { id }, data: Object.fromEntries(changed.map((f) => [f, next[f]])) });
      await this.logChange(tx, ctx, id, {
        before: Object.fromEntries(changed.map((f) => [f, current[f]])),
        after: Object.fromEntries(changed.map((f) => [f, next[f]])),
      });
    });
    return this.get(id);
  }

  /** Destinataires : comptes actifs ; l'employé d'affectation automatique doit en faire partie. */
  async setRecipients(id: string, userIds: string[], ctx: AdminContext): Promise<AdminCategory> {
    const current = await this.find(id);
    await this.checkActiveUsers(userIds, 'userIds');
    if (current.assignmentMode === 'AUTO' && current.autoAssigneeId && !userIds.includes(current.autoAssigneeId)) {
      throw invalid('userIds', 'L’employé désigné pour l’affectation automatique doit rester parmi les destinataires.');
    }
    const before = current.recipients.map((r) => r.user.id).sort();
    await this.write(async (tx) => {
      await tx.categoryRecipient.deleteMany({ where: { categoryId: id } });
      await tx.categoryRecipient.createMany({ data: userIds.map((userId) => ({ categoryId: id, userId })) });
      await this.logChange(tx, ctx, id, { before: { recipientIds: before }, after: { recipientIds: [...userIds].sort() } });
    });
    return this.get(id);
  }

  /** Admins de la catégorie : comptes actifs de rôle ADMIN ou SUPER_ADMIN uniquement. */
  async setManagers(id: string, userIds: string[], ctx: AdminContext): Promise<AdminCategory> {
    const current = await this.find(id);
    const users = await this.checkActiveUsers(userIds, 'userIds');
    if (users.some((u) => u.role === 'EMPLOYEE')) {
      throw invalid('userIds', 'Seuls les admins et super administrateurs peuvent gérer une catégorie.');
    }
    const before = current.managers.map((m) => m.user.id).sort();
    await this.write(async (tx) => {
      await tx.categoryManager.deleteMany({ where: { categoryId: id } });
      await tx.categoryManager.createMany({ data: userIds.map((userId) => ({ categoryId: id, userId })) });
      await this.logChange(tx, ctx, id, { before: { managerIds: before }, after: { managerIds: [...userIds].sort() } });
    });
    return this.get(id);
  }

  async deadlines(id: string): Promise<AdminDeadlineRule[]> {
    return toAdminCategory(await this.find(id)).deadlineRules;
  }

  /** Délais par priorité (entiers > 0 ou vides) ; la validation administrative n'existe qu'en circuit B. */
  async setDeadlines(id: string, dto: DeadlineRulesDto, ctx: AdminContext): Promise<AdminDeadlineRule[]> {
    const current = await this.find(id);
    const priorities = new Set(dto.rules.map((r) => r.priority));
    if (priorities.size !== PRIORITY_ORDER.length) throw invalid('rules', 'Une règle par priorité est attendue.');
    if (current.circuit === 'A_DIRECT' && dto.rules.some((r) => r.validationMinutes !== null)) {
      throw invalid('rules', 'Le circuit direct n’a pas de délai de validation administrative.');
    }
    if (current.kind === 'WORK' && dto.rules.some((r) => r.arrivalMinutes != null)) {
      throw invalid('rules', 'Le délai d’arrivée en classe ne concerne que les couvertures.');
    }
    if (current.kind === 'COVERAGE' && dto.rules.some((r) => r.completionMinutes !== null)) {
      throw invalid('rules', 'Une couverture n’a pas de délai de réalisation : utilisez le délai d’arrivée en classe.');
    }
    const before = toAdminCategory(current).deadlineRules;
    const after = PRIORITY_ORDER.map((priority) => {
      const r = dto.rules.find((rule) => rule.priority === priority)!;
      return {
        priority,
        validationMinutes: r.validationMinutes,
        takeoverMinutes: r.takeoverMinutes,
        completionMinutes: r.completionMinutes,
        arrivalMinutes: r.arrivalMinutes ?? null,
      };
    });
    await this.prisma.$transaction(async (tx) => {
      for (const rule of after) {
        const { priority, ...durations } = rule;
        await tx.deadlineRule.upsert({
          where: { categoryId_priority: { categoryId: id, priority } },
          create: { categoryId: id, ...rule },
          update: durations,
        });
      }
      await this.audit.log(
        'DEADLINE_RULE_CHANGED',
        { actorId: ctx.actor.id, ip: ctx.ip, targetType: 'Category', targetId: id, details: { before, after } },
        tx,
      );
    });
    return after;
  }

  private async get(id: string): Promise<AdminCategory> {
    return toAdminCategory(await this.find(id));
  }

  private async find(id: string): Promise<CategoryRow> {
    const row = UUID.test(id)
      ? await this.prisma.category.findUnique({ where: { id }, include: ADMIN_CATEGORY_INCLUDE })
      : null;
    if (!row) throw new AppException('NOT_FOUND');
    return row;
  }

  /** Règles de cohérence entre circuit, mode d'affectation et validation finale. */
  private checkCircuitRules(values: CategoryValues, recipientIds: ReadonlySet<string>, kind: Category['kind']): void {
    if (kind === 'COVERAGE') {
      // Couverture : diffusion à des groupes d'employés, validation finale facultative, jamais d'affectation automatique.
      if (values.routingMode !== 'DIRECT') throw invalid('routingMode', 'Une catégorie de couverture n’a pas de mode de routage.');
      if (values.circuit !== 'A_DIRECT') throw invalid('circuit', 'Une catégorie de couverture utilise le circuit direct.');
      if (values.assignmentMode === 'AUTO') throw invalid('assignmentMode', 'Une couverture est prise par le premier employé disponible.');
      if (values.creatorRoles.includes('EMPLOYEE')) {
        throw invalid('creatorRoles', 'Seuls les admins et le super administrateur créent des affectations.');
      }
      return;
    }
    if (values.routingMode !== 'VIA_ADMIN' && values.closureMode === 'MANAGER') {
      throw invalid('closureMode', 'Sans validation par l’administration, la clôture revient au demandeur ou se fait automatiquement.');
    }
    if (values.circuit === 'A_DIRECT') {
      if (values.finalValidation) throw invalid('finalValidation', 'La validation finale n’existe qu’en circuit B.');
      if (values.assignmentMode === 'AUTO') throw invalid('assignmentMode', 'L’affectation automatique n’existe qu’en circuit B.');
    }
    if (values.assignmentMode === 'AUTO') {
      if (!values.autoAssigneeId) throw invalid('autoAssigneeId', 'Choisissez l’employé qui recevra automatiquement les demandes.');
      if (!recipientIds.has(values.autoAssigneeId)) {
        throw invalid('autoAssigneeId', 'L’employé désigné doit d’abord faire partie des destinataires de la catégorie.');
      }
    }
  }

  private async checkNameAvailable(name: string): Promise<void> {
    const existing = await this.prisma.category.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    if (existing) throw new AppException('CONFLICT', { fields: [{ field: 'name', messages: ['Ce nom de catégorie existe déjà.'] }] }, 'Ce nom de catégorie existe déjà.');
  }

  private async checkActiveUsers(userIds: string[], field: string) {
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds }, active: true }, select: { id: true, role: true } });
    if (users.length !== userIds.length) throw invalid(field, 'Un des comptes choisis est introuvable ou désactivé.');
    return users;
  }

  private async write<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(fn);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException('CONFLICT', undefined, 'Ce nom de catégorie existe déjà.');
      }
      throw error;
    }
  }

  private logChange(tx: Prisma.TransactionClient, ctx: AdminContext, id: string, details: Record<string, unknown>): Promise<void> {
    return this.audit.log('CATEGORY_CHANGED', { actorId: ctx.actor.id, ip: ctx.ip, targetType: 'Category', targetId: id, details }, tx);
  }
}

function pickValues(row: CategoryRow): CategoryValues {
  return Object.fromEntries(CATEGORY_FIELDS.map((f) => [f, row[f]])) as CategoryValues;
}
