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
import { PrismaClient, type Permission, type Prisma, type Priority, type Role } from '@prisma/client';
import { argon2id, hash } from 'argon2';
import { randomBytes } from 'node:crypto';
import { SETTING_DEFAULTS } from '../src/settings/settings.service';

export interface SeedOptions {
  /** Mode e2e : mot de passe commun, aucun changement imposé sauf pour le compte « nouveau ». */
  e2ePassword?: string;
  log?: (message: string) => void;
}

const DEFAULT_PERMISSIONS: Record<Exclude<Role, 'SUPER_ADMIN'>, Permission[]> = {
  EMPLOYEE: ['REQUEST_CREATE', 'PRIORITY_CHANGE_OWN'],
  MANAGER: ['REQUEST_CREATE', 'PRIORITY_CHANGE_OWN', 'PRIORITY_CHANGE_MANAGED', 'REQUEST_REASSIGN'],
};

type Durations = { validationMinutes: number | null; takeoverMinutes: number; completionMinutes: number };

/** Délais par défaut (minutes) pour toute nouvelle catégorie. */
export const DEFAULT_DEADLINES: Record<Priority, Durations> = {
  NORMAL: { validationMinutes: 1440, takeoverMinutes: 1440, completionMinutes: 4320 },
  MEDIUM: { validationMinutes: 480, takeoverMinutes: 480, completionMinutes: 2880 },
  HIGH: { validationMinutes: 120, takeoverMinutes: 120, completionMinutes: 1440 },
  URGENT: { validationMinutes: 30, takeoverMinutes: 15, completionMinutes: 120 },
};

const DEMO_USERS: Array<{ username: string; displayName: string; jobTitle: string; role: Role; e2eOnly?: boolean }> = [
  { username: 'superadmin', displayName: 'Super administrateur', jobTitle: 'Administration', role: 'SUPER_ADMIN' },
  { username: 'responsable', displayName: 'Responsable administratif', jobTitle: 'Direction', role: 'MANAGER' },
  { username: 'enseignante', displayName: 'Enseignante', jobTitle: 'Professeure des écoles', role: 'EMPLOYEE' },
  { username: 'reprographie', displayName: 'Reprographie', jobTitle: 'Reprographie', role: 'EMPLOYEE' },
  { username: 'nouveau', displayName: 'Nouvel employé', jobTitle: 'Accueil', role: 'EMPLOYEE', e2eOnly: true },
];

function temporaryPassword(): string {
  return randomBytes(12).toString('base64url'); // 16 caractères
}

async function seedSettings(prisma: PrismaClient): Promise<void> {
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: {},
    });
  }
}

async function seedPermissions(prisma: PrismaClient): Promise<void> {
  const data = Object.entries(DEFAULT_PERMISSIONS).flatMap(([role, permissions]) =>
    permissions.map((permission) => ({ role: role as Role, permission })),
  );
  await prisma.rolePermission.createMany({ data, skipDuplicates: true });
}

async function seedUsers(prisma: PrismaClient, options: SeedOptions): Promise<Record<string, string>> {
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
  const users = await prisma.user.findMany({ where: { username: { in: [...seed.recipients, ...seed.managers] } } });
  const idOf = (username: string) => users.find((u) => u.username === username)?.id;
  const isCircuitB = seed.data.circuit === 'B_ADMIN_VALIDATION';

  await prisma.category.create({
    data: {
      name: seed.name,
      ...seed.data,
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

export async function runSeed(prisma: PrismaClient, options: SeedOptions = {}): Promise<Record<string, string>> {
  const log = options.log ?? console.log;

  await seedSettings(prisma);
  await seedPermissions(prisma);
  const passwords = await seedUsers(prisma, options);

  await seedCategory(prisma, {
    name: 'Photocopies',
    data: {
      circuit: 'A_DIRECT',
      creatorRoles: ['EMPLOYEE', 'MANAGER'],
      closureMode: 'AUTO',
      autoCloseAfterMinutes: 1440,
      photoRequired: false,
    },
    // Exemple de la spec, non définitif : photocopies urgentes, prise en charge 1 min, réalisation 5 min.
    deadlines: { ...DEFAULT_DEADLINES, URGENT: { validationMinutes: null, takeoverMinutes: 1, completionMinutes: 5 } },
    recipients: ['reprographie'],
    managers: ['responsable'],
  });

  await seedCategory(prisma, {
    name: 'Intervention technique (démo circuit B)',
    data: {
      circuit: 'B_ADMIN_VALIDATION',
      creatorRoles: ['EMPLOYEE', 'MANAGER'],
      closureMode: 'MANAGER',
      autoCloseAfterMinutes: 0,
      finalValidation: true,
      assignmentMode: 'MANUAL',
      photoRequired: true,
    },
    deadlines: DEFAULT_DEADLINES,
    recipients: ['reprographie'],
    managers: ['responsable'],
  });

  if (!options.e2ePassword) {
    for (const [username, password] of Object.entries(passwords)) {
      log(`Compte créé : ${username} — mot de passe provisoire : ${password} (à changer à la première connexion)`);
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
