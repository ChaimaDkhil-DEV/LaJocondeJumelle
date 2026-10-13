import type { Availability, Prisma, PrismaClient } from '@prisma/client';
import { slotsOverlap, type Slot } from './domain/coverage-policy';
import { ACTIVE_GUARD_STATUSES } from './domain/coverage-state-machine';

type Db = PrismaClient | Prisma.TransactionClient;

/** Raison d'indisponibilité affichée aux responsables (jamais de détail sur la garde en cours aux autres employés). */
export type UnavailableReason = 'INACTIVE' | 'ABSENT' | 'UNAVAILABLE' | 'ON_GUARD';

export interface EmployeeAvailability {
  userId: string;
  availability: Availability;
  /** Disponible pour ce créneau. */
  available: boolean;
  reason: UnavailableReason | null;
  /** Garde en cours qui chevauche le créneau (pour les responsables). */
  guardRequestId: string | null;
}

/**
 * Disponibilité d'employés pour un créneau : seules les couvertures en cours (Acceptée, En route,
 * En retard, En garde, Relève demandée) qui chevauchent le créneau rendent indisponible, ainsi que
 * le statut déclaré (Indisponible, Absent). Les demandes de travail ne bloquent pas.
 */
export async function availabilityFor(
  db: Db,
  userIds: readonly string[],
  slot: Slot,
  excludeRequestId?: string,
): Promise<Map<string, EmployeeAvailability>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const [users, guards] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, active: true, availability: true } }),
    db.request.findMany({
      where: {
        kind: 'COVERAGE',
        assigneeId: { in: ids },
        status: { in: [...ACTIVE_GUARD_STATUSES] },
        ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
      },
      select: { id: true, assigneeId: true, coverage: { select: { startAt: true, plannedEndAt: true } } },
    }),
  ]);

  const result = new Map<string, EmployeeAvailability>();
  for (const user of users) {
    const guard = guards.find(
      (g) => g.assigneeId === user.id && g.coverage !== null && slotsOverlap(slot, g.coverage),
    );
    let reason: UnavailableReason | null = null;
    if (!user.active) reason = 'INACTIVE';
    else if (user.availability === 'ABSENT') reason = 'ABSENT';
    else if (user.availability === 'UNAVAILABLE') reason = 'UNAVAILABLE';
    else if (guard) reason = 'ON_GUARD';
    result.set(user.id, {
      userId: user.id,
      availability: user.availability,
      available: reason === null,
      reason,
      guardRequestId: guard?.id ?? null,
    });
  }
  return result;
}

/** Membres actifs des groupes donnés. */
export async function groupMemberIds(db: Db, groupIds: readonly string[]): Promise<string[]> {
  if (groupIds.length === 0) return [];
  const rows = await db.employeeGroupMember.findMany({
    where: { groupId: { in: [...groupIds] }, user: { active: true } },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

/** Membres disponibles des groupes donnés pour le créneau (destinataires d'une diffusion). */
export async function availableMembers(
  db: Db,
  groupIds: readonly string[],
  slot: Slot,
  excludeRequestId?: string,
): Promise<string[]> {
  const members = await groupMemberIds(db, groupIds);
  const availability = await availabilityFor(db, members, slot, excludeRequestId);
  return members.filter((id) => availability.get(id)?.available);
}

/** Verrou transactionnel par employé : sérialise les prises de garde d'un même employé. */
export async function lockEmployee(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`coverage-employee:${userId}`}))::text`;
}
