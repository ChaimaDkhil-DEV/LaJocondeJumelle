import type { Prisma } from '@prisma/client';

/** Administrateur tel qu'il est montré à ses collègues : nom et fonction seulement (FR-033). */
export const ADMIN_REF = { select: { id: true, displayName: true, jobTitle: true } } satisfies Prisma.UserDefaultArgs;

export const ASSIGNMENT_INCLUDE = {
  request: { select: { id: true, reference: true, title: true } },
  admin: ADMIN_REF,
  previousAdmin: ADMIN_REF,
  actor: ADMIN_REF,
} satisfies Prisma.RequestAssignmentInclude;

export type AssignmentWithRelations = Prisma.RequestAssignmentGetPayload<{ include: typeof ASSIGNMENT_INCLUDE }>;

/** Ligne de l'historique des responsables (contracts/api.md, Assignment). */
export function toAssignmentView(row: AssignmentWithRelations) {
  return {
    id: row.id,
    operation: row.operation,
    request: row.request,
    admin: row.admin,
    previousAdmin: row.previousAdmin,
    actor: row.actor,
    reason: row.reason,
    createdAt: row.createdAt,
  };
}

export type AssignmentView = ReturnType<typeof toAssignmentView>;

export type AdminRefView = { id: string; displayName: string; jobTitle: string | null };

export const TRANSFER_INCLUDE = {
  request: {
    select: { id: true, reference: true, title: true, priority: true, status: true, kind: true, categoryId: true, adminOwnerId: true },
  },
  initiator: ADMIN_REF,
  recipient: ADMIN_REF,
  currentOwner: ADMIN_REF,
} satisfies Prisma.RequestTransferInclude;

export type TransferWithRelations = Prisma.RequestTransferGetPayload<{ include: typeof TRANSFER_INCLUDE }>;

/**
 * Proposition de transfert telle que la voit l'utilisateur (contracts/api.md, Transfer) : qui propose
 * quoi à qui, pourquoi, depuis quand, jusqu'à quand, et ce qu'il peut en faire maintenant.
 */
export function toTransferView(transfer: TransferWithRelations, user: { id: string }, now: Date) {
  const pending = transfer.status === 'PENDING';
  const answerable = pending && transfer.recipientId === user.id && transfer.expiresAt.getTime() > now.getTime();
  return {
    id: transfer.id,
    type: transfer.type,
    status: transfer.status,
    reason: transfer.reason,
    responseReason: transfer.responseReason,
    cancelCause: transfer.cancelCause,
    request: {
      id: transfer.request.id,
      reference: transfer.request.reference,
      title: transfer.request.title,
      priority: transfer.request.priority,
      status: transfer.request.status,
    },
    initiator: transfer.initiator,
    recipient: transfer.recipient,
    currentOwner: transfer.currentOwner,
    createdAt: transfer.createdAt,
    respondedAt: transfer.respondedAt,
    expiresAt: transfer.expiresAt,
    cancelledAt: transfer.cancelledAt,
    canAccept: answerable,
    canReject: answerable,
    canCancel: pending && transfer.initiatorId === user.id,
  };
}

export type TransferView = ReturnType<typeof toTransferView>;
