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

/** `node dist/cli/bootstrap.js [identifiant] [nom affiché]` (DATABASE_URL requis). */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
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
