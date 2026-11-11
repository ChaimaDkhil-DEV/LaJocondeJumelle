import type { PrismaClient } from '@prisma/client';
import { argon2id, hash } from 'argon2';
import { stableId } from './random';
import { CLASSES, fictionalPhone, STAFF } from './school-data';

/**
 * Démonstration des communications (015, 017) : classes des enseignants (titulaire de sa classe,
 * enseignants spécialistes dans toutes les classes), trois familles avec un compte parent, dont une avec
 * deux enfants dans deux classes, et quelques conversations. Idempotent ; s'appuie sur les élèves et le
 * personnel en base.
 */

export interface DemoStudent {
  id: string;
  lastName: string;
  classId: string;
}

export interface DemoFamily {
  key: string;
  firstName: string;
  lastName: string;
  relationship: string;
  username: string;
  studentIds: string[];
}

const PARENTS = [
  { firstName: 'Sonia', relationship: 'Mère' },
  { firstName: 'Karim', relationship: 'Père' },
  { firstName: 'Nadia', relationship: 'Mère' },
] as const;

const slug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Trois familles : la première a deux enfants (même nom) dans deux classes différentes ; les deux
 * autres, un enfant chacune, avec des noms différents. Déterministe pour une même liste d'élèves.
 */
export function demoFamilies(students: readonly DemoStudent[]): DemoFamily[] {
  const sorted = [...students].sort((a, b) => a.id.localeCompare(b.id));
  const byName = new Map<string, DemoStudent[]>();
  for (const s of sorted) byName.set(s.lastName, [...(byName.get(s.lastName) ?? []), s]);
  const families: Array<{ lastName: string; studentIds: string[] }> = [];
  for (const [lastName, group] of byName) {
    const other = group.find((s) => s.classId !== group[0]!.classId);
    if (other) {
      families.push({ lastName, studentIds: [group[0]!.id, other.id] });
      break;
    }
  }
  for (const s of sorted) {
    if (families.length >= PARENTS.length) break;
    if (families.some((f) => f.lastName === s.lastName)) continue;
    families.push({ lastName: s.lastName, studentIds: [s.id] });
  }
  return families.map((f, i) => ({
    key: `family:${slug(f.lastName)}`,
    firstName: PARENTS[i]!.firstName,
    lastName: f.lastName,
    relationship: PARENTS[i]!.relationship,
    username: `parent.${slug(f.lastName)}`,
    studentIds: f.studentIds,
  }));
}

/** Classes de chaque enseignant de démonstration : sa classe (titulaire) ou toutes (spécialiste). */
export function demoTeacherClasses(): Array<{ username: string; classKeys: string[] }> {
  return STAFF.flatMap((s) => {
    if (s.kind === 'teacher' && s.classKey) return [{ username: s.username, classKeys: [s.classKey] }];
    if (s.kind === 'specialist') return [{ username: s.username, classKeys: CLASSES.map((c) => c.key) }];
    return [];
  });
}

export interface ParentDemoReport {
  teacherClasses: number;
  families: DemoFamily[];
  createdParents: string[];
}

export async function seedParentCommunicationDemo(
  prisma: PrismaClient,
  options: { password: string; createdAt?: Date },
): Promise<ParentDemoReport> {
  // Classes des enseignants : comptes et classes de démonstration présents en base seulement.
  const classes = await prisma.schoolClass.findMany({
    where: { name: { in: CLASSES.map((c) => c.name) } },
    select: { id: true, name: true },
  });
  const classIdByKey = new Map(
    CLASSES.flatMap((c) => {
      const row = classes.find((r) => r.name === c.name);
      return row ? [[c.key, row.id] as const] : [];
    }),
  );
  const assignments = demoTeacherClasses();
  const teachers = await prisma.user.findMany({
    where: { username: { in: assignments.map((a) => a.username) }, active: true },
    select: { id: true, username: true },
  });
  const rows = assignments.flatMap((a) => {
    const teacher = teachers.find((t) => t.username === a.username);
    if (!teacher) return [];
    return a.classKeys.flatMap((key) => {
      const classId = classIdByKey.get(key);
      return classId ? [{ teacherId: teacher.id, classId }] : [];
    });
  });
  const teacherClasses = (await prisma.teacherClass.createMany({ data: rows, skipDuplicates: true }))
    .count;

  // Familles : représentants liés à leurs enfants, chacun avec un compte parent.
  const students = await prisma.student.findMany({
    where: { active: true, classId: { in: [...classIdByKey.values()] } },
    select: { id: true, lastName: true, classId: true },
  });
  const families = demoFamilies(students);
  const passwordHash = await hash(options.password, { type: argon2id });
  const createdParents: string[] = [];
  for (const [i, f] of families.entries()) {
    const guardianId = stableId(`guardian:${f.key}`);
    let user = await prisma.user.findUnique({ where: { username: f.username } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          id: stableId(`user:${f.username}`),
          username: f.username,
          displayName: `${f.firstName} ${f.lastName}`,
          role: 'PARENT',
          passwordHash,
          mustChangePassword: false,
          ...(options.createdAt ? { createdAt: options.createdAt } : {}),
        },
      });
      createdParents.push(f.username);
    }
    await prisma.guardian.upsert({
      where: { id: guardianId },
      create: {
        id: guardianId,
        firstName: f.firstName,
        lastName: f.lastName,
        relationship: f.relationship,
        phone: fictionalPhone(9000 + i),
        userId: user.id,
        ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      },
      update: {},
    });
    await prisma.guardianStudent.createMany({
      data: f.studentIds.map((studentId) => ({ guardianId, studentId })),
      skipDuplicates: true,
    });
  }
  await seedConversationDemo(prisma, families);
  return { teacherClasses, families, createdParents };
}

/**
 * Conversations de démonstration (017), une seule fois (identifiants stables) : un signalement d'un
 * enseignant avec la réponse de l'administration ; la conversation famille ouverte depuis ce signalement
 * (« Contacter le parent »), message de l'école et réponse du parent ; un message à valider pour une autre
 * famille. Texte seulement : aucun vocal fictif. Rien n'est transmis à n8n.
 */
async function seedConversationDemo(prisma: PrismaClient, families: DemoFamily[]): Promise<void> {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', active: true }, orderBy: { username: 'asc' } });
  const [first, second] = families;
  if (!admin || !first) return;
  const internalId = stableId(`conversation:internal:${first.key}`);
  if (await prisma.conversation.findUnique({ where: { id: internalId } })) return;
  const studentId = first.studentIds[0]!;
  const assignment = await prisma.teacherClass.findFirst({
    where: { class: { students: { some: { id: studentId } } } },
    orderBy: { teacher: { username: 'asc' } },
  });
  const parent = await prisma.guardian.findUnique({ where: { id: stableId(`guardian:${first.key}`) }, select: { userId: true } });
  if (!assignment || !parent?.userId) return;

  const message = async (
    conversationId: string,
    author: 'TEACHER' | 'PARENT' | 'ADMIN',
    authorId: string,
    text: string,
    status: 'SENT' | 'PENDING_ADMIN_VALIDATION' = 'SENT',
  ) => {
    const row = await prisma.parentCommunication.create({
      data: {
        conversationId,
        author,
        authorId,
        status,
        currentRevision: 1,
        submittedAt: new Date(),
        ...(status === 'SENT' ? {} : { draftText: text }),
        revisions: { create: { number: 1, text } },
      },
    });
    await prisma.parentCommunicationEvent.create({
      data: { communicationId: row.id, type: status === 'SENT' ? 'SENT' : 'SUBMITTED', actorId: authorId, revision: 1 },
    });
  };

  await prisma.conversation.create({
    data: { id: internalId, type: 'INTERNAL', studentId, teacherId: assignment.teacherId, createdById: assignment.teacherId },
  });
  await message(internalId, 'TEACHER', assignment.teacherId, 'Élève très fatigué ces derniers jours, il s’endort en classe.');
  await message(internalId, 'ADMIN', admin.id, 'Merci, je contacte la famille et je vous tiens informé.');

  const familyId = stableId(`conversation:parent:${first.key}`);
  await prisma.conversation.create({
    data: {
      id: familyId,
      type: 'PARENT',
      studentId,
      guardianId: stableId(`guardian:${first.key}`),
      linkedInternalId: internalId,
      createdById: admin.id,
      responsibleAdminId: admin.id,
    },
  });
  await message(familyId, 'ADMIN', admin.id, 'Bonjour, pourrions-nous échanger au sujet du sommeil de votre enfant ?');
  await message(familyId, 'PARENT', parent.userId, 'Bonjour, oui bien sûr, je peux passer jeudi après la classe.');

  if (second) {
    const pendingId = stableId(`conversation:parent:${second.key}`);
    await prisma.conversation.create({
      data: {
        id: pendingId,
        type: 'PARENT',
        studentId: second.studentIds[0]!,
        guardianId: stableId(`guardian:${second.key}`),
        createdById: admin.id,
      },
    });
    await message(pendingId, 'ADMIN', admin.id, 'Rappel : la sortie au musée a lieu vendredi, prévoir un pique-nique.', 'PENDING_ADMIN_VALIDATION');
  }
}
