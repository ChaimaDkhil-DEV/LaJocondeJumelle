import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/** Appartenance aux groupes à clé système (004, R7) : repérés par `systemKey`, jamais par le nom. */
export interface GroupFlags {
  isTeacher: boolean;
  isSupervisor: boolean;
}

/** Membre des groupes actifs Enseignants (`TEACHERS`) et Surveillants (`SUPERVISORS`). */
export async function groupFlagsOf(db: Db, userId: string): Promise<GroupFlags> {
  const rows = await db.employeeGroupMember.findMany({
    where: { userId, group: { active: true, systemKey: { not: null } } },
    select: { group: { select: { systemKey: true } } },
  });
  const keys = new Set(rows.map((r) => r.group.systemKey));
  return { isTeacher: keys.has('TEACHERS'), isSupervisor: keys.has('SUPERVISORS') };
}
