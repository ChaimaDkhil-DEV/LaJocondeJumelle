import type { GroupSystemKey, Prisma, PrismaClient } from '@prisma/client';
import { groupFlagsOf } from '../common/group-flags';

export { groupFlagsOf, type GroupFlags } from '../common/group-flags';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Groupes à clé système (R7) : enseignants et surveillants sont repérés par `EmployeeGroup.systemKey`,
 * jamais par le nom du groupe (modifiable par le super administrateur).
 */

/** Membres actifs d'un groupe à clé système. */
export async function memberIdsByKey(db: Db, systemKey: GroupSystemKey): Promise<string[]> {
  const rows = await db.employeeGroupMember.findMany({
    where: { group: { systemKey, active: true }, user: { active: true } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export const supervisorIds = (db: Db) => memberIdsByKey(db, 'SUPERVISORS');
export const teacherIds = (db: Db) => memberIdsByKey(db, 'TEACHERS');

export async function isSupervisor(db: Db, userId: string): Promise<boolean> {
  return (await groupFlagsOf(db, userId)).isSupervisor;
}

export async function isTeacher(db: Db, userId: string): Promise<boolean> {
  return (await groupFlagsOf(db, userId)).isTeacher;
}

/** Super administrateurs actifs (escalades). */
export async function superAdminRecipients(db: Db): Promise<string[]> {
  const rows = await db.user.findMany({ where: { role: 'SUPER_ADMIN', active: true }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Destinataires « admin » (R11) : admins actifs ; à défaut d'admin actif, les super administrateurs. */
export async function adminRecipients(db: Db): Promise<string[]> {
  const rows = await db.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } });
  return rows.length > 0 ? rows.map((r) => r.id) : superAdminRecipients(db);
}
