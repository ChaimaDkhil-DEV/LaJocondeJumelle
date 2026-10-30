/**
 * Jeu de démonstration « La Joconde Jumelle » : établissement complet (5 étages, 8 niveaux,
 * 32 classes, élèves, 49 membres du personnel + la direction) et ~140 demandes de travail du
 * 12 au 30 octobre 2026, avec historique, messages, notifications et journal d'audit cohérents.
 *
 * Usage (base LOCALE de développement uniquement, localhost:5433/app) :
 *   npm run -w backend db:seed:demo              ajoute ce qui manque (idempotent)
 *   npm run -w backend db:seed:demo -- --reset   sauvegarde la base, efface les anciennes données
 *                                                de test, puis crée le jeu de démonstration
 * Mot de passe commun des comptes : variable DEMO_PASSWORD (sinon tiré au hasard et affiché une fois).
 */
import { PrismaClient, type Prisma, type Role } from '@prisma/client';
import { argon2id, hash } from 'argon2';
import { randomBytes } from 'node:crypto';
import { DEFAULT_COVERAGE_DEADLINES, PRIORITY_ORDER } from '../src/categories/category-defaults';
import { atLocalTime } from '../src/common/school-time';
import { schoolTimezoneFromEnv } from '../src/config/config';
import { loadEnvFile } from '../src/config/load-env-file';
import { Random, stableId } from './demo/random';
import { SCENARIOS } from './demo/request-scenarios';
import { assertLocalDevelopmentDatabase, backupDatabase, purgeLocalData } from './demo/reset';
import {
  ALL_ACCOUNTS,
  BOY_NAMES,
  CATEGORIES,
  CLASSES,
  DIRECTION,
  FLOORS,
  fictionalPhone,
  GIRL_NAMES,
  GUIDELINES,
  LAST_NAMES,
  LEVELS,
  STAFF,
  type CategoryKey,
  type FloorKey,
} from './demo/school-data';
import { markReadings, simulateDemo, type Directory, type DirectoryCategory } from './demo/simulate';
import { seedPermissions, seedSettings } from './seed';

/** Période de démonstration et « fin de journée » du dernier jour (heure de l'école). */
export const DEMO_FIRST_DAY = '2026-10-12';
export const DEMO_LAST_DAY = '2026-10-30';
const DEMO_END_TIME = '17:30';
const DEMO_SEED = 20261030;
/** Arrivée du personnel et inscription des élèves : rentrée. */
const RENTREE = '2026-09-01';

export interface DemoSeedOptions {
  /** Mot de passe commun des comptes créés. */
  password: string;
  /** Instant présent : aucune donnée n'est datée après (défaut : maintenant). */
  now?: Date;
  log?: (message: string) => void;
}

export interface DemoSeedReport {
  createdUsers: number;
  students: number;
  requests: number;
  skippedRequests: boolean;
  cutoff: Date;
}

const BATCH = 500;

async function inBatches<T>(rows: readonly T[], insert: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) await insert(rows.slice(i, i + BATCH));
}

export async function runDemoSeed(prisma: PrismaClient, options: DemoSeedOptions): Promise<DemoSeedReport> {
  const log = options.log ?? console.log;
  const timeZone = schoolTimezoneFromEnv();
  const rentree = atLocalTime(RENTREE, '08:00', timeZone);
  const end = atLocalTime(DEMO_LAST_DAY, DEMO_END_TIME, timeZone);
  const now = options.now ?? new Date();
  const cutoff = now.getTime() < end.getTime() ? now : end;

  await seedSettings(prisma);
  await seedPermissions(prisma);

  // --- Étages, niveaux, classes.
  const floorIds = new Map<FloorKey, string>();
  for (const floor of FLOORS) {
    const row = await prisma.floor.upsert({
      where: { name: floor.name },
      create: { id: stableId(`floor:${floor.key}`), name: floor.name, position: floor.position, createdAt: rentree },
      update: {},
    });
    floorIds.set(floor.key, row.id);
  }
  const levelIds = new Map<string, string>();
  for (const level of LEVELS) {
    const row = await prisma.gradeLevel.upsert({
      where: { name: level.name },
      create: { id: stableId(`level:${level.position}`), name: level.name, cycle: level.cycle, position: level.position, createdAt: rentree },
      update: {},
    });
    levelIds.set(level.name, row.id);
  }
  const classIds = new Map<string, string>();
  for (const c of CLASSES) {
    const row = await prisma.schoolClass.upsert({
      where: { name: c.name },
      create: { id: stableId(`class:${c.key}`), name: c.name, room: c.room, floorId: floorIds.get(c.floor)!, levelId: levelIds.get(c.level)!, createdAt: rentree },
      update: {},
    });
    classIds.set(c.key, row.id);
  }

  // --- Personnel (mot de passe commun, aucun changement imposé : comptes de démonstration).
  const passwordHash = await hash(options.password, { type: argon2id });
  let createdUsers = 0;
  for (const account of ALL_ACCOUNTS) {
    const existing = await prisma.user.findUnique({ where: { username: account.username } });
    if (existing) continue;
    await prisma.user.create({
      data: {
        id: stableId(`user:${account.username}`),
        username: account.username,
        displayName: account.displayName,
        jobTitle: account.jobTitle,
        role: account.role,
        passwordHash,
        mustChangePassword: false,
        floorId: account.kind === 'supervisor' && account.floor ? floorIds.get(account.floor)! : null,
        createdAt: rentree,
      },
    });
    createdUsers += 1;
  }
  const users = await prisma.user.findMany({ where: { username: { in: ALL_ACCOUNTS.map((a) => a.username) } } });
  const userId = (username: string) => {
    const user = users.find((u) => u.username === username);
    if (!user) throw new Error(`Compte manquant : ${username}`);
    return user.id;
  };
  const headSupervisor = STAFF.find((s) => s.kind === 'headSupervisor')!;

  // --- Groupes à clé système : Enseignants (35) et Surveillants (10).
  for (const [systemKey, name, kinds] of [
    ['TEACHERS', 'Enseignants', ['teacher', 'specialist']],
    ['SUPERVISORS', 'Surveillants', ['supervisor']],
  ] as const) {
    const group =
      (await prisma.employeeGroup.findUnique({ where: { systemKey } })) ??
      (await prisma.employeeGroup.upsert({ where: { name }, create: { name, systemKey }, update: { systemKey } }));
    await prisma.employeeGroupMember.createMany({
      data: STAFF.filter((s) => (kinds as readonly string[]).includes(s.kind)).map((s) => ({ groupId: group.id, userId: userId(s.username) })),
      skipDuplicates: true,
    });
  }

  // --- Catégories de demandes de travail, et catégorie de garde (affectations).
  const categories = new Map<CategoryKey, DirectoryCategory>();
  for (const seed of CATEGORIES) {
    const recipients = STAFF.filter((s) => seed.recipients.includes(s.kind)).map((s) => userId(s.username));
    const managers = [userId(headSupervisor.username)];
    const circuitB = seed.routingMode === 'VIA_ADMIN';
    const row =
      (await prisma.category.findUnique({ where: { name: seed.name }, include: { recipients: true, managers: true } })) ??
      (await prisma.category.create({
        data: {
          id: stableId(`category:${seed.key}`),
          name: seed.name,
          kind: 'WORK',
          circuit: circuitB ? 'B_ADMIN_VALIDATION' : 'A_DIRECT',
          routingMode: seed.routingMode,
          creatorRoles: ['EMPLOYEE', 'ADMIN'],
          closureMode: seed.closureMode,
          autoCloseAfterMinutes: seed.autoCloseAfterMinutes,
          finalValidation: circuitB && seed.finalValidation,
          assignmentMode: 'MANUAL',
          photoRequired: false,
          createdAt: rentree,
          deadlineRules: {
            create: PRIORITY_ORDER.map((priority) => ({
              priority,
              validationMinutes: circuitB ? seed.deadlines[priority].validationMinutes : null,
              takeoverMinutes: seed.deadlines[priority].takeoverMinutes,
              completionMinutes: seed.deadlines[priority].completionMinutes,
            })),
          },
          recipients: { create: recipients.map((id) => ({ userId: id })) },
          managers: { create: managers.map((id) => ({ userId: id })) },
        },
        include: { recipients: true, managers: true },
      }));
    categories.set(seed.key, {
      id: row.id,
      name: row.name,
      seed,
      recipientIds: row.recipients.map((r) => r.userId),
      managerIds: row.managers.map((m) => m.userId),
    });
  }
  if (!(await prisma.category.findFirst({ where: { kind: 'COVERAGE' } }))) {
    await prisma.category.create({
      data: {
        name: 'Garde de classe',
        kind: 'COVERAGE',
        circuit: 'A_DIRECT',
        creatorRoles: ['ADMIN'],
        closureMode: 'MANAGER',
        autoCloseAfterMinutes: 0,
        proofMode: 'BOTH',
        createdAt: rentree,
        deadlineRules: { create: PRIORITY_ORDER.map((priority) => ({ priority, ...DEFAULT_COVERAGE_DEADLINES })) },
        managers: { create: [{ userId: userId(headSupervisor.username) }] },
      },
    });
  }

  // --- Consignes de l'assistance (sources des propositions automatiques).
  const guidelines = new Map<string, { id: string; title: string }>();
  for (const g of GUIDELINES) {
    const id = stableId(`guideline:${g.key}`);
    const row =
      (await prisma.guideline.findUnique({ where: { id } })) ??
      (await prisma.guideline.create({
        data: { id, title: g.title, body: g.body, categoryId: g.category ? categories.get(g.category)!.id : null, updatedById: userId(DIRECTION.username), createdAt: rentree },
      }));
    guidelines.set(g.key, { id: row.id, title: row.title });
  }

  // --- Élèves : 22 à 28 par classe, un seul service de restauration chacun.
  const random = new Random(DEMO_SEED);
  const students: Prisma.StudentCreateManyInput[] = [];
  CLASSES.forEach((c) => {
    const size = random.int(22, 28);
    const names = new Set<string>();
    while (names.size < size) {
      const girl = random.chance(0.5);
      const name = `${random.pick(girl ? GIRL_NAMES : BOY_NAMES)}|${random.pick(LAST_NAMES)}`;
      names.add(name);
    }
    [...names].forEach((name, i) => {
      const [firstName, lastName] = name.split('|');
      students.push({
        id: stableId(`student:${c.key}:${i}`),
        firstName,
        lastName,
        classId: classIds.get(c.key)!,
        parentPhone: fictionalPhone(students.length + 1),
        mealService: random.chance(0.62) ? 'CANTINE' : 'PANIER',
        createdAt: rentree,
      });
    });
  });
  await inBatches(students, (data) => prisma.student.createMany({ data, skipDuplicates: true }));

  // --- Demandes, historique, messages, notifications et audit : en une transaction, une seule fois.
  const already = await prisma.request.count({ where: { id: { in: SCENARIOS.map((_s, i) => stableId(`request:${i}`)) } } });
  if (already > 0) {
    log(`Demandes de démonstration déjà présentes (${already}) : rien n'est ajouté. Utilisez --reset pour les recréer.`);
    return { createdUsers, students: students.length, requests: 0, skippedRequests: true, cutoff };
  }

  const directory: Directory = {
    timeZone,
    users: ALL_ACCOUNTS.map((a) => ({
      id: userId(a.username),
      username: a.username,
      displayName: a.displayName,
      firstName: a.firstName,
      role: a.role,
      kind: a.kind,
      floor: a.floor,
      classKey: a.classKey,
    })),
    classes: new Map(CLASSES.map((c) => [c.key, { name: c.name, room: c.room, floor: c.floor, level: c.level }])),
    floors: new Map(FLOORS.map((f) => [f.key, f.name])),
    categories,
    guidelines,
  };
  const warn = await prisma.setting.findUnique({ where: { key: 'deadlineWarnPercent' } });
  const data = simulateDemo(SCENARIOS, directory, {
    firstDay: DEMO_FIRST_DAY,
    lastDay: DEMO_LAST_DAY,
    cutoff,
    seed: DEMO_SEED,
    deadlineWarnPercent: typeof warn?.value === 'number' ? warn.value : 20,
  });
  markReadings(data, new Map<string, Role>(directory.users.map((u) => [u.id, u.role])), cutoff, DEMO_SEED);

  await prisma.$transaction(
    async (tx) => {
      // Numéros dans l'ordre de création (séquence de l'application), référence D-AAAA-NNNNNN.
      for (const request of data.requests) {
        const [{ n }] = await tx.$queryRaw<Array<{ n: number }>>`SELECT nextval(pg_get_serial_sequence('"Request"', 'number'))::int AS n`;
        await tx.request.create({
          data: { ...request, number: n, reference: `D-${request.createdAt.getUTCFullYear()}-${String(n).padStart(6, '0')}` },
        });
      }
      await inBatches(data.messages, (rows) => tx.message.createMany({ data: rows }));
      // Insertion dans l'ordre chronologique : la colonne seq (ordre d'écriture) le suit.
      await inBatches(data.events, (rows) => tx.requestEvent.createMany({ data: rows }));
      await inBatches(data.notifications, (rows) => tx.notification.createMany({ data: rows }));
      await inBatches(data.audits, (rows) => tx.auditLog.createMany({ data: rows }));
    },
    { timeout: 300_000, maxWait: 30_000 },
  );

  return { createdUsers, students: students.length, requests: data.requests.length, skippedRequests: false, cutoff };
}

async function main(): Promise<void> {
  loadEnvFile();
  const url = process.env.DATABASE_URL;
  const target = assertLocalDevelopmentDatabase(url);
  const reset = process.argv.includes('--reset');
  const generated = !process.env.DEMO_PASSWORD;
  const password = process.env.DEMO_PASSWORD || randomBytes(9).toString('base64url');
  console.log(`Base ciblée : ${target.host}:${target.port}/${target.database} (développement local).`);

  if (reset) await backupDatabase(url!);
  const prisma = new PrismaClient();
  try {
    if (reset) {
      const report = await purgeLocalData(prisma, url!, process.env.FILES_DIR);
      console.log(`Anciennes données supprimées : ${Object.entries(report.counts).map(([k, v]) => `${k} ${v}`).join(', ')} ; fichiers retirés : ${report.removedFiles}.`);
    }
    const report = await runDemoSeed(prisma, { password });
    console.log(
      `Démonstration prête : ${report.createdUsers} comptes créés, ${report.students} élèves, ${report.requests} demandes (jusqu'au ${report.cutoff.toISOString()}).`,
    );
    if (report.createdUsers > 0) {
      console.log(
        generated
          ? `Mot de passe commun des comptes : ${password} (affiché une seule fois ; DEMO_PASSWORD pour le choisir).`
          : 'Mot de passe commun des comptes : valeur de DEMO_PASSWORD.',
      );
      console.log('Comptes : direction (super administratrice), samira.belkhodja (surveillante générale), prenom.nom pour le personnel.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
