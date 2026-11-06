import type { MealService, Prisma } from '@prisma/client';

/** Inscrit un changement dans l'historique, dans la transaction qui modifie l'élève. */
export function recordMealChange(
  tx: Prisma.TransactionClient,
  change: { studentId: string; from: MealService; to: MealService; actorId: string; reason?: string | null },
) {
  return tx.studentMealChange.create({
    data: {
      studentId: change.studentId,
      fromService: change.from,
      toService: change.to,
      actorId: change.actorId,
      reason: change.reason || null,
    },
  });
}
