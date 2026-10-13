import { PrismaClient } from '@prisma/client';
import { verify } from 'argon2';
import { bootstrapProduction } from '../../src/cli/bootstrap';
import { SETTING_KEYS } from '../../src/settings/settings.service';
import { resetDatabase } from '../utils/test-db';

/** Mise en production : réglages et permissions par défaut, premier super administrateur, sans données de démonstration. */
describe('bootstrapProduction', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('crée le premier super administrateur avec un mot de passe provisoire, sans catégorie de démonstration', async () => {
    const result = await bootstrapProduction(prisma, { username: ' Direction ', displayName: 'Direction' });
    expect(result).toMatchObject({ created: true, username: 'direction' });
    expect(result.temporaryPassword).toMatch(/^\S{16,}$/);

    const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'direction' } });
    expect(admin).toMatchObject({ role: 'SUPER_ADMIN', mustChangePassword: true, active: true });
    await expect(verify(admin.passwordHash, result.temporaryPassword!)).resolves.toBe(true);

    await expect(prisma.setting.count()).resolves.toBe(SETTING_KEYS.length);
    await expect(prisma.rolePermission.count({ where: { role: 'EMPLOYEE', permission: 'REQUEST_CREATE' } })).resolves.toBe(1);
    await expect(prisma.category.count()).resolves.toBe(0);
    await expect(prisma.user.count()).resolves.toBe(1);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'USER_CREATED', targetId: admin.id } });
    expect(JSON.stringify(audit.details)).not.toContain(result.temporaryPassword!);
  });

  it('est idempotent : ne recrée rien et ne remplace pas les réglages modifiés', async () => {
    await prisma.setting.update({ where: { key: 'voiceMaxSeconds' }, data: { value: 120 } });
    const result = await bootstrapProduction(prisma, { username: 'autre', displayName: 'Autre' });
    expect(result).toEqual({ created: false, username: 'direction' });
    await expect(prisma.user.count()).resolves.toBe(1);
    await expect(prisma.setting.findUniqueOrThrow({ where: { key: 'voiceMaxSeconds' } })).resolves.toMatchObject({ value: 120 });
  });

  it('refuse un identifiant invalide', async () => {
    await resetDatabase(prisma);
    await expect(bootstrapProduction(prisma, { username: 'a b', displayName: 'X' })).rejects.toThrow(/identifiant/i);
  });
});
