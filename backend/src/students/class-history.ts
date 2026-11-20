import type { Prisma, PrismaClient } from '@prisma/client';

export interface ClassHistoryInput {
  studentId: string;
  classId: string;
  /** Auteur du changement : obligatoire, seule la reprise de l'existant (migration 0032) écrit sans auteur. */
  changedById: string;
}

/**
 * Ajoute une période de classe (021) : « à partir de maintenant, l'élève est dans cette classe ». L'heure est celle
 * du serveur, jamais une valeur du client. À appeler dans la transaction qui écrit l'élève : si l'une des deux
 * écritures échoue, aucune n'est conservée. La période précédente finit d'elle-même (la ligne suivante la clôt).
 */
export async function appendClassHistory(tx: Prisma.TransactionClient, input: ClassHistoryInput): Promise<void> {
  if (!input.changedById) throw new Error('Une période de classe nécessite un auteur.');
  await tx.studentClassHistory.create({
    data: {
      studentId: input.studentId,
      classId: input.classId,
      changedById: input.changedById,
      startedAt: new Date(),
      reconstructed: false,
    },
  });
}

/**
 * Données de démonstration : donne une première période aux élèves qui n'en ont pas encore, datée de leur création.
 * Idempotent (la création des élèves l'est aussi) : relancé, il n'ajoute rien.
 */
export async function ensureFirstClassPeriods(
  prisma: Pick<PrismaClient, 'studentClassHistory'>,
  students: ReadonlyArray<{ id: string; classId: string; startedAt: Date }>,
  changedById: string,
): Promise<number> {
  if (!changedById) throw new Error('Une période de classe nécessite un auteur.');
  const have = new Set(
    (await prisma.studentClassHistory.findMany({ where: { studentId: { in: students.map((s) => s.id) } }, select: { studentId: true }, distinct: ['studentId'] })).map(
      (row) => row.studentId,
    ),
  );
  const missing = students.filter((s) => !have.has(s.id));
  if (missing.length > 0) {
    await prisma.studentClassHistory.createMany({
      data: missing.map((s) => ({ studentId: s.id, classId: s.classId, startedAt: s.startedAt, changedById, reconstructed: false })),
    });
  }
  return missing.length;
}

/** Première période de plusieurs élèves créés ensemble (import) : même règle, une seule écriture. */
export async function appendClassHistoryMany(
  tx: Prisma.TransactionClient,
  students: ReadonlyArray<Pick<ClassHistoryInput, 'studentId' | 'classId'>>,
  changedById: string,
): Promise<void> {
  if (!changedById) throw new Error('Une période de classe nécessite un auteur.');
  const startedAt = new Date();
  await tx.studentClassHistory.createMany({
    data: students.map((s) => ({ studentId: s.studentId, classId: s.classId, changedById, startedAt, reconstructed: false })),
  });
}
