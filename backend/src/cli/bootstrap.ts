import { PrismaClient, type Prisma, type Role } from '@prisma/client';
import { argon2id, hash } from 'argon2';
import { randomBytes } from 'node:crypto';
import { DEFAULT_PERMISSIONS } from '../settings/default-permissions';
import { SETTING_DEFAULTS } from '../settings/settings.service';

const USERNAME = /^[a-z0-9._-]{3,64}$/;

export interface BootstrapResult {
  created: boolean;
  username: string;
  /** Renvoyé une seule fois, à la création. */
  temporaryPassword?: string;
}

/**
 * Initialisation d'une base de production (idempotente) : réglages et permissions par défaut
 * (sans écraser des valeurs existantes) et premier super administrateur, s'il n'en existe aucun.
 * Aucune donnée de démonstration n'est créée.
 */
export async function bootstrapProduction(
  prisma: PrismaClient,
  admin: { username: string; displayName: string },
): Promise<BootstrapResult> {
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue }, update: {} });
  }
  await prisma.rolePermission.createMany({
    data: Object.entries(DEFAULT_PERMISSIONS).flatMap(([role, permissions]) =>
      permissions.map((permission) => ({ role: role as Role, permission })),
    ),
    skipDuplicates: true,
  });

  const existing = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' } });
  if (existing) return { created: false, username: existing.username };

  const username = admin.username.trim().toLowerCase();
  if (!USERNAME.test(username)) {
    throw new Error('Identifiant invalide : 3 à 64 caractères parmi a-z, 0-9, point, tiret et souligné.');
  }
  const displayName = admin.displayName.trim() || 'Super administrateur';
  const temporaryPassword = randomBytes(12).toString('base64url');
  const user = await prisma.user.create({
    data: {
      username,
      displayName,
      role: 'SUPER_ADMIN',
      passwordHash: await hash(temporaryPassword, { type: argon2id }),
      mustChangePassword: true,
    },
  });
  await prisma.auditLog.create({
    data: {
      action: 'USER_CREATED',
      targetType: 'User',
      targetId: user.id,
      details: { after: { username, displayName, role: 'SUPER_ADMIN' }, reason: 'BOOTSTRAP' },
    },
  });
  return { created: true, username, temporaryPassword };
}

/**
 * Réinitialise le mot de passe d'un super administrateur (FR-007, FR-010) : nouveau mot de passe
 * provisoire, changement imposé, sessions fermées et audit `PASSWORD_RESET`, en une transaction.
 * Sans identifiant, vise le plus ancien super administrateur actif.
 */
export async function resetSuperAdminPassword(
  prisma: PrismaClient,
  username?: string,
): Promise<{ username: string; temporaryPassword: string }> {
  const user = username
    ? await prisma.user.findUnique({ where: { username } })
    : await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', active: true }, orderBy: { createdAt: 'asc' } });
  if (!user || user.role !== 'SUPER_ADMIN') {
    throw new Error(`Compte « ${username ?? 'super administrateur actif'} » introuvable ou non super administrateur : aucune modification.`);
  }

  const temporaryPassword = randomBytes(16).toString('base64url');
  const passwordHash = await hash(temporaryPassword, { type: argon2id });
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: true } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.auditLog.create({
      data: { action: 'PASSWORD_RESET', actorId: null, targetType: 'User', targetId: user.id, details: { reason: 'CLI' }, ip: null },
    }),
  ]);
  return { username: user.username, temporaryPassword };
}

/**
 * `node dist/cli/bootstrap.js [identifiant] [nom affiché]` : initialisation (DATABASE_URL requis).
 * `node dist/cli/bootstrap.js --reset-password [identifiant]` : réinitialisation tracée du mot de
 * passe d'un super administrateur.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    if (process.argv[2] === '--reset-password') {
      const reset = await resetSuperAdminPassword(prisma, process.argv[3]);
      process.stdout.write(
        `Mot de passe provisoire de « ${reset.username} » (affiché une seule fois, à changer à la première connexion) : ${reset.temporaryPassword}\n`,
      );
      return;
    }
    const result = await bootstrapProduction(prisma, {
      username: process.argv[2] ?? process.env.ADMIN_USERNAME ?? 'admin',
      displayName: process.argv[3] ?? process.env.ADMIN_DISPLAY_NAME ?? 'Super administrateur',
    });
    if (result.created) {
      process.stdout.write(
        `Super administrateur « ${result.username} » créé.\n` +
          `Mot de passe provisoire (affiché une seule fois, à changer à la première connexion) : ${result.temporaryPassword}\n`,
      );
    } else {
      process.stdout.write(`Un super administrateur existe déjà (« ${result.username} ») : rien à créer.\n`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
