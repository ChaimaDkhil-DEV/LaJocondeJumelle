import type { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { allowedActions, type PolicyAction, type PolicyCategory } from './domain/access-policy';
import { readRulesSnapshot, toPolicyRequest } from './request-policy.loader';

/** Relations chargées pour construire RequestSummary / RequestDetail (contracts/rest-api.md). */
export const REQUEST_INCLUDE = {
  category: { select: { id: true, name: true } },
  requester: { select: { id: true, displayName: true } },
  assignee: { select: { id: true, displayName: true } },
  voiceFile: { select: { id: true, durationSeconds: true } },
  files: {
    where: { isCompletionProof: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.RequestInclude;

export type RequestWithRelations = Prisma.RequestGetPayload<{ include: typeof REQUEST_INCLUDE }>;

export function toRequestSummary(request: RequestWithRelations, unreadCount: number) {
  return {
    id: request.id,
    reference: request.reference,
    title: request.title,
    category: request.category,
    priority: request.priority,
    status: request.status,
    requester: request.requester,
    assignee: request.assignee,
    createdAt: request.createdAt,
    currentStage: request.currentStage,
    currentDueAt: request.currentDueAt,
    warnAt: request.warnAt,
    overdueStage: request.overdueStage,
    hasVoice: request.voiceFileId !== null,
    unreadCount,
  };
}

export type RequestSummary = ReturnType<typeof toRequestSummary>;

export function toRequestDetail(
  request: RequestWithRelations,
  user: AuthenticatedUser,
  category: PolicyCategory,
  unreadCount: number,
) {
  const rules = readRulesSnapshot(request);
  const actions: PolicyAction[] = allowedActions(user, toPolicyRequest(request), category);
  return {
    ...toRequestSummary(request, unreadCount),
    description: request.description,
    voice: request.voiceFile
      ? { fileId: request.voiceFile.id, durationSeconds: Number(request.voiceFile.durationSeconds) }
      : null,
    rulesSnapshot: {
      circuit: rules.circuit,
      photoRequired: rules.photoRequired,
      closureMode: rules.closureMode,
      finalValidation: rules.finalValidation,
    },
    timestamps: {
      createdAt: request.createdAt,
      submittedAt: request.submittedAt,
      approvedAt: request.approvedAt,
      rejectedAt: request.rejectedAt,
      assignedAt: request.assignedAt,
      acceptedAt: request.acceptedAt,
      startedAt: request.startedAt,
      doneAt: request.doneAt,
      finalValidatedAt: request.finalValidatedAt,
      closedAt: request.closedAt,
      cancelledAt: request.cancelledAt,
    },
    proofPhotos: request.files.map((f) => ({ fileId: f.id })),
    autoCloseAt: request.autoCloseAt,
    version: request.version,
    rejectionReason: request.rejectionReason,
    allowedActions: actions,
  };
}

export type RequestDetail = ReturnType<typeof toRequestDetail>;
