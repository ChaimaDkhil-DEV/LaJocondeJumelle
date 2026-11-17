import type { PrismaClient } from '@prisma/client';

/**
 * Second administrateur des tests 018 : même mot de passe et mêmes catégories que « admin ». Créé par les
 * tests eux-mêmes, jamais par le seed partagé : un second admin de catégorie y changerait les
 * notifications attendues par les tests existants.
 */
export async function createSecondAdmin(prisma: PrismaClient, username = 'admin2', displayName = 'Seconde administratrice'): Promise<string> {
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' }, include: { managerOf: true } });
  const created = await prisma.user.create({
    data: {
      username,
      displayName,
      jobTitle: 'Administration',
      role: 'ADMIN',
      passwordHash: admin.passwordHash,
      mustChangePassword: false,
      managerOf: { create: admin.managerOf.map((m) => ({ categoryId: m.categoryId })) },
    },
  });
  return created.id;
}
