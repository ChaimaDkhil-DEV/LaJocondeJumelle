import { Injectable } from '@nestjs/common';
import type { Category, Prisma, Request } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { PolicyCategory, PolicyRequest } from './domain/access-policy';
import type { RulesSnapshot } from './domain/request-state-machine';

/** Règles copiées dans la demande (FR-022) : règles de la catégorie + durées de délai de la priorité. */
export interface RequestRulesSnapshot extends RulesSnapshot {
  validationMinutes: number | null;
  takeoverMinutes: number | null;
  completionMinutes: number | null;
}

export type CategoryWithMembers = Category & {
  recipients: Array<{ userId: string }>;
  managers: Array<{ userId: string }>;
};

const CATEGORY_MEMBERS = {
  recipients: { select: { userId: true } },
  managers: { select: { userId: true } },
} satisfies Prisma.CategoryInclude;

export function toPolicyCategory(category: CategoryWithMembers): PolicyCategory {
  return {
    id: category.id,
    active: category.active,
    creatorRoles: category.creatorRoles,
    recipientIds: new Set(category.recipients.map((r) => r.userId)),
    managerIds: new Set(category.managers.map((m) => m.userId)),
  };
}

export function readRulesSnapshot(request: Pick<Request, 'rulesSnapshot'>): RequestRulesSnapshot {
  return request.rulesSnapshot as unknown as RequestRulesSnapshot;
}

export function toPolicyRequest(
  request: Pick<
    Request,
    | 'kind'
    | 'status'
    | 'rulesSnapshot'
    | 'voiceFileId'
    | 'description'
    | 'assigneeId'
    | 'autoCloseAt'
    | 'requesterId'
    | 'categoryId'
  >,
): PolicyRequest {
  return {
    kind: request.kind,
    status: request.status,
    rules: readRulesSnapshot(request),
    hasVoice: request.voiceFileId !== null,
    hasDescription: Boolean(request.description?.trim()),
    assigneeId: request.assigneeId,
    autoCloseAt: request.autoCloseAt,
    requesterId: request.requesterId,
    categoryId: request.categoryId,
  };
}

/** Charge depuis la base les éléments nécessaires à la politique d'accès. */
@Injectable()
export class RequestPolicyLoader {
  constructor(private readonly prisma: PrismaService) {}

  async category(categoryId: string): Promise<CategoryWithMembers | null> {
    return this.prisma.category.findUnique({ where: { id: categoryId }, include: CATEGORY_MEMBERS });
  }

  async categories(where: Prisma.CategoryWhereInput = {}): Promise<CategoryWithMembers[]> {
    return this.prisma.category.findMany({ where, include: CATEGORY_MEMBERS, orderBy: { name: 'asc' } });
  }

  /** Construit l'instantané des règles à partir de la catégorie et de la priorité choisies. */
  async rulesSnapshot(category: Category, priority: Request['priority']): Promise<RequestRulesSnapshot> {
    const rule = await this.prisma.deadlineRule.findUnique({
      where: { categoryId_priority: { categoryId: category.id, priority } },
    });
    return {
      circuit: category.circuit,
      closureMode: category.closureMode,
      autoCloseAfterMinutes: category.autoCloseAfterMinutes,
      finalValidation: category.circuit === 'B_ADMIN_VALIDATION' && category.finalValidation,
      assignmentMode: category.assignmentMode,
      photoRequired: category.photoRequired,
      validationMinutes: category.circuit === 'B_ADMIN_VALIDATION' ? (rule?.validationMinutes ?? null) : null,
      takeoverMinutes: rule?.takeoverMinutes ?? null,
      completionMinutes: rule?.completionMinutes ?? null,
    };
  }
}
