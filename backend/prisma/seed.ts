/**
 * Seed : valeurs par défaut provisoires (data-model.md §Valeurs par défaut, à confirmer avec
 * le client), catégories de démonstration et comptes de démonstration.
 *
 * Usage : npm run -w backend prisma:seed
 *  - par défaut : mots de passe provisoires aléatoires affichés une seule fois, à changer à la
 *    première connexion ;
 *  - SEED_E2E_PASSWORD=<mdp> : mode tests de bout en bout (mot de passe fixe, voir e2e/support).
 * Le seed est idempotent : il ne recrée ni ne réinitialise ce qui existe déjà.
 */
import {
  PrismaClient,
  type GroupSystemKey,
  type Prisma,
  type Priority,
  type Role,
} from '@prisma/client';
import { argon2id, hash } from 'argon2';
import { randomBytes } from 'node:crypto';
import {
  DEFAULT_COVERAGE_DEADLINES,
  DEFAULT_DEADLINES,
  PRIORITY_ORDER,
  type DeadlineDurations,
} from '../src/categories/category-defaults';
import { DEFAULT_PERMISSIONS } from '../src/settings/default-permissions';
import { SETTING_DEFAULTS } from '../src/settings/settings.service';

export interface SeedOptions {
  /** Mode e2e : mot de passe commun, aucun changement imposé sauf pour le compte « nouveau ». */
  e2ePassword?: string;
  log?: (message: string) => void;
}

type Durations = DeadlineDurations;
export { DEFAULT_DEADLINES };

const DEMO_USERS: Array<{
  username: string;
  displayName: string;
  jobTitle: string;
  role: Role;
  e2eOnly?: boolean;
}> = [
  {
    username: 'superadmin',
    displayName: 'Super administrateur',
    jobTitle: 'Administration',
    role: 'SUPER_ADMIN',
  },
  {
    username: 'admin',
    displayName: 'Admin — surveillante générale',
    jobTitle: 'Direction',
    role: 'ADMIN',
  },
  {
    username: 'enseignante',
    displayName: 'Enseignante',
    jobTitle: 'Professeure des écoles',
    role: 'EMPLOYEE',
  },
  {
    username: 'reprographie',
    displayName: 'Reprographie',
    jobTitle: 'Reprographie',
    role: 'EMPLOYEE',
  },
  {
    username: 'nouveau',
    displayName: 'Nouvel employé',
    jobTitle: 'Accueil',
    role: 'EMPLOYEE',
    e2eOnly: true,
  },
  // Employé sans lien avec les catégories de démonstration : vérifie la confidentialité des demandes.
  {
    username: 'autre',
    displayName: 'Autre employé',
    jobTitle: 'Cantine',
    role: 'EMPLOYEE',
    e2eOnly: true,
  },
  // Affectations : membres du groupe « Surveillants » (1er étage : surveillant, remplacant ; 2e étage : surveillant2).
  {
    username: 'surveillant',
    displayName: 'Surveillant',
    jobTitle: 'Surveillance',
    role: 'EMPLOYEE',
    e2eOnly: true,
  },
  {
    username: 'remplacant',
    displayName: 'Remplaçante',
    jobTitle: 'Remplacement',
    role: 'EMPLOYEE',
    e2eOnly: true,
  },
  {
    username: 'surveillant2',
    displayName: 'Surveillant 2e étage',
    jobTitle: 'Surveillance',
    role: 'EMPLOYEE',
    e2eOnly: true,
  },
];

/** Étages de démonstration, classes et surveillants rattachés (004, FR-006). */
const DEMO_FLOORS = [
  {
    name: '1er étage',
    position: 1,
    classes: ['1ère année Violet'],
    supervisors: ['surveillant', 'remplacant'],
  },
  { name: '2e étage', position: 2, classes: ['2e année Bleu'], supervisors: ['surveillant2'] },
];

/** Groupes à clé système (R7) : repérés par leur clé, jamais par leur nom. */
const SYSTEM_GROUPS: Array<{ systemKey: GroupSystemKey; name: string; members: string[] }> = [
  {
    systemKey: 'SUPERVISORS',
    name: 'Surveillants',
    members: ['surveillant', 'remplacant', 'surveillant2'],
  },
  { systemKey: 'TEACHERS', name: 'Enseignants', members: ['enseignante'] },
];

/**
 * Affectations : catégorie de garde (mêmes valeurs par défaut que la migration 0002_coverage : preuve
 * QR + photo, prise en charge 2 min, arrivée 5 min), groupes à clé système, étages et classes.
 */
async function seedCoverage(prisma: PrismaClient): Promise<void> {
  const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
  // La migration 0002_coverage crée déjà la catégorie (sans responsable si les comptes n'existaient pas encore).
  let category = await prisma.category.findUnique({ where: { name: 'Garde de classe' } });
  if (!category) {
    category = await prisma.category.create({
      data: {
        name: 'Garde de classe',
        kind: 'COVERAGE',
        circuit: 'A_DIRECT',
        creatorRoles: ['ADMIN'],
        closureMode: 'MANAGER',
        autoCloseAfterMinutes: 0,
        proofMode: 'BOTH',
        deadlineRules: {
          create: PRIORITY_ORDER.map((priority) => ({ priority, ...DEFAULT_COVERAGE_DEADLINES })),
        },
      },
    });
  }
  if (admin && category.kind === 'COVERAGE') {
    await prisma.categoryManager.createMany({
      data: [{ categoryId: category.id, userId: admin.id }],
      skipDuplicates: true,
    });
  }

  for (const seed of SYSTEM_GROUPS) {
    // La migration 0009 crée déjà les groupes : on les retrouve par leur clé.
    const group =
      (await prisma.employeeGroup.findUnique({ where: { systemKey: seed.systemKey } })) ??
      (await prisma.employeeGroup.upsert({
        where: { name: seed.name },
        create: { name: seed.name, systemKey: seed.systemKey },
        update: { systemKey: seed.systemKey },
      }));
    const members = await prisma.user.findMany({ where: { username: { in: seed.members } } });
    await prisma.employeeGroupMember.createMany({
      data: members.map((m) => ({ groupId: group.id, userId: m.id })),
      skipDuplicates: true,
    });
  }

  for (const schoolClass of [
    { name: '1ère année Violet', room: 'Salle 12' },
    { name: '2e année Bleu', room: 'Salle 14' },
  ]) {
    await prisma.schoolClass.upsert({
      where: { name: schoolClass.name },
      create: schoolClass,
      update: {},
    });
  }
  for (const seed of DEMO_FLOORS) {
    const floor = await prisma.floor.upsert({
      where: { name: seed.name },
      create: { name: seed.name, position: seed.position },
      update: {},
    });
    // Rattachement seulement s'il manque : le super administrateur a pu le modifier.
    await prisma.schoolClass.updateMany({
      where: { name: { in: seed.classes }, floorId: null },
      data: { floorId: floor.id },
    });
    await prisma.user.updateMany({
      where: { username: { in: seed.supervisors }, floorId: null },
      data: { floorId: floor.id },
    });
  }
}

function temporaryPassword(): string {
  return randomBytes(12).toString('base64url'); // 16 caractères
}

export async function seedSettings(prisma: PrismaClient): Promise<void> {
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: {},
    });
  }
}

export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  const data = Object.entries(DEFAULT_PERMISSIONS).flatMap(([role, permissions]) =>
    permissions.map((permission) => ({ role: role as Role, permission })),
  );
  await prisma.rolePermission.createMany({ data, skipDuplicates: true });
}

async function seedUsers(
  prisma: PrismaClient,
  options: SeedOptions,
): Promise<Record<string, string>> {
  const created: Record<string, string> = {};
  for (const user of DEMO_USERS) {
    if (user.e2eOnly && !options.e2ePassword) continue;
    const existing = await prisma.user.findUnique({ where: { username: user.username } });
    if (existing) continue;
    const password = options.e2ePassword ?? temporaryPassword();
    await prisma.user.create({
      data: {
        username: user.username,
        displayName: user.displayName,
        jobTitle: user.jobTitle,
        role: user.role,
        passwordHash: await hash(password, { type: argon2id }),
        mustChangePassword: options.e2ePassword ? user.username === 'nouveau' : true,
      },
    });
    created[user.username] = password;
  }
  return created;
}

interface CategorySeed {
  name: string;
  data: Omit<Prisma.CategoryCreateInput, 'name' | 'recipients' | 'managers' | 'deadlineRules'>;
  deadlines: Record<Priority, Durations>;
  recipients: string[];
  managers: string[];
}

async function seedCategory(prisma: PrismaClient, seed: CategorySeed): Promise<void> {
  if (await prisma.category.findUnique({ where: { name: seed.name } })) return;
  const users = await prisma.user.findMany({
    where: { username: { in: [...seed.recipients, ...seed.managers] } },
  });
  const idOf = (username: string) => users.find((u) => u.username === username)?.id;
  const isCircuitB = seed.data.circuit === 'B_ADMIN_VALIDATION';

  await prisma.category.create({
    data: {
      name: seed.name,
      ...seed.data,
      // Mode de routage cohérent avec le circuit (migration 0005_routing_mode).
      routingMode: isCircuitB ? 'VIA_ADMIN' : 'DIRECT',
      deadlineRules: {
        create: Object.entries(seed.deadlines).map(([priority, d]) => ({
          priority: priority as Priority,
          // La validation administrative n'existe qu'en circuit B.
          validationMinutes: isCircuitB ? d.validationMinutes : null,
          takeoverMinutes: d.takeoverMinutes,
          completionMinutes: d.completionMinutes,
        })),
      },
      recipients: {
        create: seed.recipients.flatMap((u) => (idOf(u) ? [{ userId: idOf(u)! }] : [])),
      },
      managers: {
        create: seed.managers.flatMap((u) => (idOf(u) ? [{ userId: idOf(u)! }] : [])),
      },
    },
  });
}

export async function runSeed(
  prisma: PrismaClient,
  options: SeedOptions = {},
): Promise<Record<string, string>> {
  const log = options.log ?? console.log;

  await seedSettings(prisma);
  await seedPermissions(prisma);
  const passwords = await seedUsers(prisma, options);

  await seedCategory(prisma, {
    name: 'Photocopies',
    data: {
      circuit: 'A_DIRECT',
      creatorRoles: ['EMPLOYEE', 'ADMIN'],
      closureMode: 'AUTO',
      autoCloseAfterMinutes: 1440,
      photoRequired: false,
    },
    // Exemple de la spec, non définitif : photocopies urgentes, prise en charge 1 min, réalisation 5 min.
    deadlines: {
      ...DEFAULT_DEADLINES,
      URGENT: { validationMinutes: null, takeoverMinutes: 1, completionMinutes: 5 },
    },
    recipients: ['reprographie'],
    managers: ['admin'],
  });

  // Démonstration : circuit A, photo de preuve obligatoire, clôture par le demandeur.
  await seedCategory(prisma, {
    name: 'Petits travaux (démo photo)',
    data: {
      circuit: 'A_DIRECT',
      creatorRoles: ['EMPLOYEE', 'ADMIN'],
      closureMode: 'REQUESTER',
      autoCloseAfterMinutes: 0,
      photoRequired: true,
    },
    deadlines: DEFAULT_DEADLINES,
    recipients: ['reprographie'],
    managers: ['admin'],
  });

  await seedCategory(prisma, {
    name: 'Intervention technique (démo circuit B)',
    data: {
      circuit: 'B_ADMIN_VALIDATION',
      creatorRoles: ['EMPLOYEE', 'ADMIN'],
      closureMode: 'MANAGER',
      autoCloseAfterMinutes: 0,
      finalValidation: true,
      assignmentMode: 'MANUAL',
      photoRequired: true,
    },
    deadlines: DEFAULT_DEADLINES,
    recipients: ['reprographie'],
    managers: ['admin'],
  });

  await seedCoverage(prisma);

  if (!options.e2ePassword) {
    for (const [username, password] of Object.entries(passwords)) {
      log(
        `Compte créé : ${username} — mot de passe provisoire : ${password} (à changer à la première connexion)`,
      );
    }
  }
  log('Seed terminé.');
  return passwords;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  runSeed(prisma, { e2ePassword: process.env.SEED_E2E_PASSWORD || undefined })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => void prisma.$disconnect());
}
