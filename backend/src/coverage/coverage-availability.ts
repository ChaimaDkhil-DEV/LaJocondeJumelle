import type { Availability, Prisma, PrismaClient } from '@prisma/client';
import { supervisorIds } from './coverage-groups';
import { slotsOverlap, type Slot } from './domain/coverage-policy';
import { ACTIVE_GUARD_STATUSES } from './domain/coverage-state-machine';

type Db = PrismaClient | Prisma.TransactionClient;

/** Raison d'indisponibilité affichée aux admins (jamais de détail sur l'affectation en cours aux autres). */
export type UnavailableReason = 'INACTIVE' | 'ABSENT' | 'UNAVAILABLE' | 'ON_GUARD' | 'SUPPORT';

export interface EmployeeAvailability {
  userId: string;
  availability: Availability;
  /** Disponible pour ce créneau. */
  available: boolean;
  reason: UnavailableReason | null;
  /** Affectation (ou renfort) en cours qui chevauche le créneau (pour les admins). */
  guardRequestId: string | null;
}

/**
 * Disponibilité pour un créneau (data-model §5, FR-010, FR-015i) : rendent indisponible le statut
 * déclaré (Indisponible, Absent), une affectation active (assignée, en route, en retard, en cours,
 * relève demandée) ou un renfort actif dont la plage chevauche (fin inconnue = +∞). Les demandes de
 * travail ne bloquent pas.
 */
export async function availabilityFor(
  db: Db,
  userIds: readonly string[],
  slot: Slot,
  excludeRequestId?: string,
): Promise<Map<string, EmployeeAvailability>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const notExcluded = excludeRequestId ? { id: { not: excludeRequestId } } : {};
  const [users, guards, supports] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, active: true, availability: true } }),
    db.request.findMany({
      where: { kind: 'COVERAGE', assigneeId: { in: ids }, status: { in: [...ACTIVE_GUARD_STATUSES] }, ...notExcluded },
      select: { id: true, assigneeId: true, coverage: { select: { startAt: true, plannedEndAt: true } } },
    }),
    db.coverageSupport.findMany({
      where: {
        userId: { in: ids },
        releasedAt: null,
        request: { status: { in: [...ACTIVE_GUARD_STATUSES] }, ...notExcluded },
      },
      select: {
        userId: true,
        requestId: true,
        request: { select: { coverage: { select: { startAt: true, plannedEndAt: true } } } },
      },
    }),
  ]);

  const result = new Map<string, EmployeeAvailability>();
  for (const user of users) {
    const guard = guards.find((g) => g.assigneeId === user.id && g.coverage !== null && slotsOverlap(slot, g.coverage));
    const support = supports.find(
      (s) => s.userId === user.id && s.request.coverage !== null && slotsOverlap(slot, s.request.coverage),
    );
    let reason: UnavailableReason | null = null;
    if (!user.active) reason = 'INACTIVE';
    else if (user.availability === 'ABSENT') reason = 'ABSENT';
    else if (user.availability === 'UNAVAILABLE') reason = 'UNAVAILABLE';
    else if (guard) reason = 'ON_GUARD';
    else if (support) reason = 'SUPPORT';
    result.set(user.id, {
      userId: user.id,
      availability: user.availability,
      available: reason === null,
      reason,
      guardRequestId: guard?.id ?? support?.requestId ?? null,
    });
  }
  return result;
}

export interface SupervisorCandidate {
  id: string;
  displayName: string;
  jobTitle: string | null;
  floor: { id: string; name: string } | null;
  /** Rattaché à l'étage de la classe. */
  sameFloor: boolean;
  available: boolean;
  reason: UnavailableReason | null;
}

/**
 * Candidats à une affectation (FR-010) : membres actifs du groupe Surveillants, l'étage de la classe
 * d'abord, puis les disponibles, puis par nom. Les indisponibles sont listés pour information.
 */
export async function supervisorCandidates(
  db: Db,
  slot: Slot,
  floorId: string | null,
  excludeRequestId?: string,
): Promise<SupervisorCandidate[]> {
  const ids = await supervisorIds(db);
  const [users, availability] = await Promise.all([
    db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true, jobTitle: true, floor: { select: { id: true, name: true } } },
    }),
    availabilityFor(db, ids, slot, excludeRequestId),
  ]);
  return users
    .map((u) => ({
      ...u,
      sameFloor: floorId !== null && u.floor?.id === floorId,
      available: availability.get(u.id)?.available ?? false,
      reason: availability.get(u.id)?.reason ?? null,
    }))
    .sort(
      (a, b) =>
        Number(b.sameFloor) - Number(a.sameFloor) ||
        Number(b.available) - Number(a.available) ||
        a.displayName.localeCompare(b.displayName, 'fr'),
    );
}

/** Verrou transactionnel par surveillant : sérialise les assignations d'un même surveillant. */
export async function lockEmployee(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`coverage-employee:${userId}`}))::text`;
}
