import { Injectable } from '@nestjs/common';
import type { Prisma, RequestAssignmentOperation, RequestTransferCancelCause } from '@prisma/client';

export interface OwnershipRecord {
  requestId: string;
  /** Administrateur concerné : le nouveau responsable ; pour RELEASED, celui qui est libéré. */
  adminId: string;
  actorId: string;
  operation: RequestAssignmentOperation;
  previousAdminId?: string | null;
  reason?: string | null;
  transferId?: string | null;
}

/**
 * Responsable administratif d'une demande (018) : écritures faites dans la transaction de l'appelant.
 * Placé dans requests/ parce que les transitions existantes l'appliquent (D4) et que l'ordre des couches
 * interdit à requests/ de dépendre de transfers/ (research R3).
 */
@Injectable()
export class RequestOwnershipService {
  /**
   * Prise en charge : mise à jour conditionnelle, une seule écriture gagne (research R1). La version
   * est incrémentée : un collègue qui agit sur la demande qu'il croyait libre reçoit STATE_CHANGED.
   * Renvoie false si la demande n'est plus libre, plus en attente ou a changé de version.
   */
  async claimInTx(tx: Prisma.TransactionClient, request: { id: string; version: number }, adminId: string, now: Date): Promise<boolean> {
    const { count } = await tx.request.updateMany({
      where: { id: request.id, kind: 'WORK', status: 'PENDING_ADMIN_VALIDATION', adminOwnerId: null, version: request.version },
      data: { adminOwnerId: adminId, adminOwnedAt: now, version: { increment: 1 } },
    });
    if (count === 0) return false;
    await this.recordInTx(tx, { requestId: request.id, adminId, actorId: adminId, operation: 'CLAIMED' });
    return true;
  }

  /**
   * Annule la proposition de transfert en attente d'une demande, avec sa cause (FR-017) : demande
   * terminée, responsable changé par un autre chemin. Mise à jour conditionnelle : une proposition déjà
   * traitée n'est pas touchée. Renvoie les propositions annulées, pour prévenir leurs participants.
   */
  async cancelPendingTransfersInTx(
    tx: Prisma.TransactionClient,
    requestId: string,
    cause: RequestTransferCancelCause,
    now: Date,
  ): Promise<Array<{ id: string; initiatorId: string; recipientId: string; currentOwnerId: string }>> {
    const pending = await tx.requestTransfer.findMany({
      where: { requestId, status: 'PENDING' },
      select: { id: true, initiatorId: true, recipientId: true, currentOwnerId: true },
    });
    const cancelled: typeof pending = [];
    for (const transfer of pending) {
      const { count } = await tx.requestTransfer.updateMany({
        where: { id: transfer.id, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelCause: cause, cancelledAt: now },
      });
      if (count === 1) cancelled.push(transfer);
    }
    return cancelled;
  }

  /** Ligne d'historique (table en ajout seul) d'un changement de responsable déjà écrit. */
  async recordInTx(tx: Prisma.TransactionClient, record: OwnershipRecord): Promise<void> {
    await tx.requestAssignment.create({
      data: {
        requestId: record.requestId,
        adminId: record.adminId,
        actorId: record.actorId,
        operation: record.operation,
        previousAdminId: record.previousAdminId ?? null,
        reason: record.reason ?? null,
        transferId: record.transferId ?? null,
      },
    });
  }
}
