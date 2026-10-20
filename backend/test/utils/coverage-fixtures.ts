import type {
  CoverageReminderKind,
  CoverageSource,
  CoverageType,
  PrismaClient,
  RequestStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

/**
 * Affectations écrites directement en base (004) : pour tester disponibilité, échéances et jobs
 * dans un état précis, sans dépendre des routes de création.
 */

const MINUTE_MS = 60_000;

export const minutesFrom = (base: Date, minutes: number) =>
  new Date(base.getTime() + minutes * MINUTE_MS);

export interface CoverageFixture {
  status: RequestStatus;
  source?: CoverageSource;
  type?: CoverageType;
  className?: string;
  startAt: Date;
  plannedEndAt: Date | null;
  assignee?: string | null;
  requester?: string;
  teacher?: string | null;
  createdAt?: Date;
}

async function idOf(prisma: PrismaClient, username: string): Promise<string> {
  return (await prisma.user.findUniqueOrThrow({ where: { username } })).id;
}

/** Crée une affectation (Request COVERAGE + CoverageDetail) ; renvoie son identifiant. */
export async function createCoverage(
  prisma: PrismaClient,
  fixture: CoverageFixture,
): Promise<string> {
  const category = await prisma.category.findFirstOrThrow({ where: { kind: 'COVERAGE' } });
  const schoolClass = await prisma.schoolClass.findUniqueOrThrow({
    where: { name: fixture.className ?? '1ère année Violet' },
  });
  const source = fixture.source ?? 'TEACHER_REQUEST';
  const requesterId = await idOf(
    prisma,
    fixture.requester ?? (source === 'TEACHER_REQUEST' ? 'enseignante' : 'admin'),
  );
  const assigneeId = fixture.assignee ? await idOf(prisma, fixture.assignee) : null;
  const teacherId =
    fixture.teacher === null ? null : await idOf(prisma, fixture.teacher ?? 'enseignante');
  const [{ n }] = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT nextval(pg_get_serial_sequence('"Request"', 'number'))::int AS n`;
  const createdAt = fixture.createdAt ?? new Date();
  const request = await prisma.request.create({
    data: {
      kind: 'COVERAGE',
      number: n,
      reference: `G-TEST-${String(n).padStart(6, '0')}`,
      clientId: randomUUID(),
      title: `Garde — ${schoolClass.name}`,
      categoryId: category.id,
      priority: 'URGENT',
      requesterId,
      assigneeId,
      status: fixture.status,
      rulesSnapshot: {
        kind: 'COVERAGE',
        proofMode: 'BOTH',
        finalValidation: false,
        takeoverMinutes: 2,
        arrivalMinutes: 5,
      },
      createdAt,
      ...(assigneeId ? { assignedAt: createdAt, acceptedAt: createdAt } : {}),
      coverage: {
        create: {
          classId: schoolClass.id,
          floorId: schoolClass.floorId,
          source,
          type: fixture.type ?? (source === 'SUPERVISOR_REPORT' ? 'EMPTY_CLASS' : 'LATENESS'),
          teacherId,
          startAt: fixture.startAt,
          plannedEndAt: fixture.plannedEndAt,
          estimatedMinutes: fixture.plannedEndAt
            ? Math.round((fixture.plannedEndAt.getTime() - fixture.startAt.getTime()) / MINUTE_MS)
            : null,
          ...(fixture.status === 'ON_DUTY' || fixture.status === 'RELIEF_PENDING'
            ? { presenceAt: fixture.startAt }
            : {}),
        },
      },
    },
  });
  return request.id;
}

export async function addReminder(
  prisma: PrismaClient,
  requestId: string,
  kind: CoverageReminderKind,
  dueAt: Date,
  extra: {
    target?: string;
    supportId?: string;
    maxAttempts?: number;
    intervalMinutes?: number;
    attempts?: number;
  } = {},
): Promise<string> {
  const reminder = await prisma.coverageReminder.create({
    data: {
      requestId,
      kind,
      dueAt,
      targetUserId: extra.target ? await idOf(prisma, extra.target) : null,
      supportId: extra.supportId ?? null,
      maxAttempts: extra.maxAttempts ?? 1,
      intervalMinutes: extra.intervalMinutes ?? null,
      attempts: extra.attempts ?? 0,
    },
  });
  return reminder.id;
}

/** Renfort actif d'un surveillant sur une affectation. */
export async function addSupport(
  prisma: PrismaClient,
  requestId: string,
  username: string,
  joinedAt = new Date(),
): Promise<string> {
  const support = await prisma.coverageSupport.create({
    data: { requestId, userId: await idOf(prisma, username), joinedAt },
  });
  return support.id;
}

/** Types de notification reçus par un utilisateur, dans l'ordre. */
export async function notificationsOf(
  prisma: PrismaClient,
  username: string,
  requestId?: string,
): Promise<Array<{ type: string; priority: string }>> {
  const rows = await prisma.notification.findMany({
    where: { userId: await idOf(prisma, username), ...(requestId ? { requestId } : {}) },
    orderBy: { createdAt: 'asc' },
    select: { type: true, priority: true },
  });
  return rows;
}

/**
 * Vide les affectations (et leurs historiques, notifications, échéances) sans toucher aux comptes
 * ni aux sessions ; remet tous les comptes actifs et disponibles. Même neutralisation des triggers
 * d'ajout seul que resetDatabase, pour la durée de la transaction de nettoyage uniquement.
 */
export async function clearCoverages(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRawUnsafe('SET LOCAL session_replication_role = replica'),
    prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "CoverageReminder", "CoverageSupport", "CoverageMergeProposal", "CoveragePresence",
         "CoverageTarget", "CoverageDetail", "Notification", "RequestEvent" RESTART IDENTITY CASCADE`,
    ),
    prisma.$executeRawUnsafe(`DELETE FROM "Request" WHERE "kind" = 'COVERAGE'`),
    prisma.user.updateMany({ data: { active: true, availability: 'AVAILABLE' } }),
  ]);
}
