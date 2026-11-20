import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

/**
 * Faits écrits directement en base pour tester la situation d'un élève (021) : une classe, un élève avec sa période,
 * une séance, un pointage, une garde. Heures fixes, au jour du 12 novembre 2026 (Paris, UTC+1) : la séance de 10 h
 * à 11 h locale est 09:00 à 10:00 UTC.
 */

export const DAY = '2026-11-12';
export const utc = (time: string) => new Date(`${DAY}T${time}Z`);
/** Heure locale de Paris en novembre → ISO UTC. */
export const local = (time: string) => `${DAY}T${time}:00+01:00`;

export async function userByName(prisma: PrismaClient, username: string): Promise<string> {
  return (await prisma.user.findUniqueOrThrow({ where: { username } })).id;
}

/** Niveau, étage et classes de test ; renvoie un créateur de classe nommée. */
export async function schoolSetup(prisma: PrismaClient) {
  const floor = await prisma.floor.findFirstOrThrow();
  const level = await prisma.gradeLevel.create({ data: { name: `Niveau situation ${randomUUID().slice(0, 6)}`, cycle: 'PRIMARY', position: Math.floor(Math.random() * 100_000) + 1000 } });
  return {
    floorId: floor.id,
    levelId: level.id,
    newClass: (name: string, room = 'Salle 12') => prisma.schoolClass.create({ data: { name, room, floorId: floor.id, levelId: level.id } }),
  };
}

/** Élève dans une classe depuis sa création, période connue (non reconstituée). */
export async function newStudent(prisma: PrismaClient, classId: string, authorId: string, createdAt = '2026-09-01T07:00:00Z', extra: { reconstructed?: boolean; historyCreatedAt?: string } = {}) {
  const student = await prisma.student.create({
    data: { firstName: 'Aya', lastName: `Situation${randomUUID().slice(0, 6)}`, classId, parentPhone: '+216 20 123 456', createdAt: new Date(createdAt) },
  });
  await prisma.studentClassHistory.create({
    data: {
      studentId: student.id,
      classId,
      startedAt: new Date(createdAt),
      changedById: extra.reconstructed ? null : authorId,
      reconstructed: extra.reconstructed ?? false,
      createdAt: new Date(extra.historyCreatedAt ?? createdAt),
    },
  });
  return student;
}

export async function newSession(
  prisma: PrismaClient,
  input: { teacherId: string; classId: string; authorId: string; start?: string; end?: string; subject?: string; room?: string; status?: 'SCHEDULED' | 'CANCELLED'; cancelReason?: string; cancelledById?: string },
) {
  return prisma.teachingSession.create({
    data: {
      teacherId: input.teacherId,
      classId: input.classId,
      localDate: new Date(`${DAY}T00:00:00.000Z`),
      startAt: utc(input.start ?? '09:00:00'),
      endAt: utc(input.end ?? '10:00:00'),
      subject: input.subject ?? 'Mathématiques',
      room: input.room ?? 'Salle 12',
      status: input.status ?? 'SCHEDULED',
      ...(input.status === 'CANCELLED' ? { cancelReason: input.cancelReason ?? 'Annulée', cancelledAt: utc('07:00:00'), cancelledById: input.cancelledById } : {}),
      createdById: input.authorId,
    },
  });
}

export async function newArrival(
  prisma: PrismaClient,
  input: { teacherId: string; classId: string; recordedById: string; at?: string | null; status?: 'ARRIVED' | 'ON_TIME' | 'LATE' | 'ABSENT'; method?: 'QR' | 'MANUAL'; substituteForId?: string; comment?: string },
) {
  return prisma.teacherAttendance.create({
    data: {
      teacherId: input.teacherId,
      classId: input.classId,
      localDate: new Date(`${DAY}T00:00:00.000Z`),
      method: input.method ?? 'QR',
      status: input.status ?? 'ON_TIME',
      arrivedAt: input.at === null ? null : utc(input.at ?? '09:02:00'),
      recordedAt: input.at === null ? utc('09:30:00') : utc(input.at ?? '09:02:00'),
      recordedById: input.recordedById,
      substituteForId: input.substituteForId,
      comment: input.comment,
    },
  });
}
