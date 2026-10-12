import { PrismaClient } from '@prisma/client';
import { verify } from 'argon2';
import { runSeed } from '../../prisma/seed';
import { SETTING_DEFAULTS } from '../../src/settings/settings.service';
import { resetDatabase } from '../utils/test-db';

/** T024 — valeurs par défaut provisoires (data-model.md §Valeurs par défaut) et comptes de démonstration. */
describe('Seed', () => {
  const prisma = new PrismaClient();

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('enregistre les réglages par défaut provisoires', async () => {
    await runSeed(prisma, { log: () => undefined });
    const settings = Object.fromEntries((await prisma.setting.findMany()).map((s) => [s.key, s.value]));
    expect(settings).toEqual(SETTING_DEFAULTS);
    expect(settings).toMatchObject({
      voiceMaxSeconds: 180,
      voiceMaxBytes: 5 * 1024 * 1024,
      attachmentMaxBytes: 10 * 1024 * 1024,
      attachmentMaxPerMessage: 5,
      deadlineWarnPercent: 20,
      sessionIdleMinutes: 60,
      sessionMaxHours: 12,
      draftsEnabled: true,
    });
  });

  it('crée les permissions par défaut par rôle', async () => {
    await runSeed(prisma, { log: () => undefined });
    const rows = await prisma.rolePermission.findMany();
    const byRole = (role: string) => rows.filter((r) => r.role === role).map((r) => r.permission).sort();
    expect(byRole('EMPLOYEE')).toEqual(['PRIORITY_CHANGE_OWN', 'REQUEST_CREATE']);
    expect(byRole('MANAGER')).toEqual([
      'PRIORITY_CHANGE_MANAGED',
      'PRIORITY_CHANGE_OWN',
      'REQUEST_CREATE',
      'REQUEST_REASSIGN',
    ]);
    expect(byRole('SUPER_ADMIN')).toEqual([]);
  });

  it('crée la catégorie « Photocopies » (circuit A, clôture automatique après 24 h) et ses délais', async () => {
    await runSeed(prisma, { log: () => undefined });
    const category = await prisma.category.findUniqueOrThrow({
      where: { name: 'Photocopies' },
      include: { deadlineRules: true, recipients: { include: { user: true } }, managers: { include: { user: true } } },
    });
    expect(category).toMatchObject({
      circuit: 'A_DIRECT',
      closureMode: 'AUTO',
      autoCloseAfterMinutes: 1440,
      photoRequired: false,
      finalValidation: false,
    });
    expect(category.recipients.map((r) => r.user.username)).toEqual(['reprographie']);
    expect(category.managers.map((m) => m.user.username)).toEqual(['responsable']);

    const rule = (priority: string) => category.deadlineRules.find((r) => r.priority === priority);
    expect(rule('URGENT')).toMatchObject({ validationMinutes: null, takeoverMinutes: 1, completionMinutes: 5 });
    expect(rule('NORMAL')).toMatchObject({ validationMinutes: null, takeoverMinutes: 1440, completionMinutes: 4320 });
    expect(rule('MEDIUM')).toMatchObject({ takeoverMinutes: 480, completionMinutes: 2880 });
    expect(rule('HIGH')).toMatchObject({ takeoverMinutes: 120, completionMinutes: 1440 });
  });

  it('crée une catégorie de démonstration en circuit B avec validation finale et photo obligatoire', async () => {
    await runSeed(prisma, { log: () => undefined });
    const category = await prisma.category.findFirstOrThrow({
      where: { circuit: 'B_ADMIN_VALIDATION' },
      include: { deadlineRules: true },
    });
    expect(category).toMatchObject({ finalValidation: true, photoRequired: true, assignmentMode: 'MANUAL' });
    expect(category.deadlineRules.find((r) => r.priority === 'URGENT')).toMatchObject({
      validationMinutes: 30,
      takeoverMinutes: 15,
      completionMinutes: 120,
    });
  });

  it('crée les comptes de démonstration avec un mot de passe provisoire à changer', async () => {
    const passwords = await runSeed(prisma, { log: () => undefined });
    const users = await prisma.user.findMany({ orderBy: { username: 'asc' } });
    expect(users.map((u) => [u.username, u.role])).toEqual([
      ['enseignante', 'EMPLOYEE'],
      ['reprographie', 'EMPLOYEE'],
      ['responsable', 'MANAGER'],
      ['superadmin', 'SUPER_ADMIN'],
    ]);
    for (const user of users) {
      expect(user.mustChangePassword).toBe(true);
      expect(passwords[user.username]).toHaveLength(16);
      await expect(verify(user.passwordHash, passwords[user.username])).resolves.toBe(true);
    }
  });

  it('mode e2e : mot de passe fixe, aucun changement imposé sauf pour le compte « nouveau »', async () => {
    await runSeed(prisma, { log: () => undefined, e2ePassword: 'MotDePasse-E2E-2026!' });
    const users = await prisma.user.findMany();
    expect(users.map((u) => u.username).sort()).toEqual(['enseignante', 'nouveau', 'reprographie', 'responsable', 'superadmin']);
    for (const user of users) {
      expect(user.mustChangePassword).toBe(user.username === 'nouveau');
      await expect(verify(user.passwordHash, 'MotDePasse-E2E-2026!')).resolves.toBe(true);
    }
  });

  it('est idempotent : un second passage ne duplique rien et ne réinitialise pas les mots de passe', async () => {
    await runSeed(prisma, { log: () => undefined });
    const before = await prisma.user.findMany({ orderBy: { username: 'asc' } });
    await runSeed(prisma, { log: () => undefined });
    const after = await prisma.user.findMany({ orderBy: { username: 'asc' } });
    expect(after.map((u) => u.passwordHash)).toEqual(before.map((u) => u.passwordHash));
    await expect(prisma.category.count()).resolves.toBe(2);
    await expect(prisma.deadlineRule.count()).resolves.toBe(8);
  });
});
