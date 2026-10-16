import { PrismaClient } from '@prisma/client';
import { verify } from 'argon2';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { bootstrapProduction, resetSuperAdminPassword } from '../../src/cli/bootstrap';
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

/** T017 — FR-007, FR-010 : réinitialisation du super administrateur par l'outil d'initialisation, tracée. */
describe('resetSuperAdminPassword', () => {
  const prisma = new PrismaClient();
  const BACKEND = resolve(__dirname, '../..');
  const REFUSAL = (username: string) => `Compte « ${username} » introuvable ou non super administrateur : aucune modification.`;

  /** Lance la ligne de commande réelle, comme en exploitation (tsx appelé par node, sans shell). */
  const TSX = require.resolve('tsx/cli', { paths: [BACKEND] });
  const cli = (args: string[], env: NodeJS.ProcessEnv = process.env) =>
    spawnSync(process.execPath, [TSX, 'src/cli/bootstrap.ts', ...args], { cwd: BACKEND, env, encoding: 'utf8' });

  const userNamed = (username: string) => prisma.user.findUniqueOrThrow({ where: { username } });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await bootstrapProduction(prisma, { username: 'direction', displayName: 'Direction' });
    // Plus ancien, mais inactif : jamais visé par défaut.
    await prisma.user.create({
      data: { username: 'ancien', displayName: 'Ancien', role: 'SUPER_ADMIN', active: false, passwordHash: 'x', createdAt: new Date('2020-01-01') },
    });
    await prisma.user.create({ data: { username: 'agent', displayName: 'Agent', role: 'EMPLOYEE', passwordHash: 'x' } });
    const direction = await userNamed('direction');
    await prisma.user.update({ where: { id: direction.id }, data: { mustChangePassword: false } });
    for (const id of ['s1', 's2']) {
      await prisma.session.create({ data: { id, userId: direction.id, expiresAt: new Date(Date.now() + 3_600_000) } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('(a) remplace le mot de passe, ferme les sessions et trace l’action dans l’audit', async () => {
    const before = await userNamed('direction');
    const result = await resetSuperAdminPassword(prisma, 'direction');

    expect(result.username).toBe('direction');
    expect(result.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const after = await userNamed('direction');
    expect(after.mustChangePassword).toBe(true);
    expect(after.passwordHash).not.toBe(before.passwordHash);
    await expect(verify(after.passwordHash, result.temporaryPassword)).resolves.toBe(true);
    await expect(prisma.session.count({ where: { userId: after.id } })).resolves.toBe(0);

    const audit = await prisma.auditLog.findMany({ where: { action: 'PASSWORD_RESET' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: null, targetType: 'User', targetId: after.id, details: { reason: 'CLI' }, ip: null });
  });

  it('(b) sans identifiant, vise le plus ancien super administrateur actif', async () => {
    await expect(resetSuperAdminPassword(prisma)).resolves.toMatchObject({ username: 'direction' });
  });

  it.each(['inconnu', 'agent'])('(c) refuse « %s » sans rien écrire', async (username) => {
    const before = await prisma.user.findMany({ orderBy: { username: 'asc' } });
    await expect(resetSuperAdminPassword(prisma, username)).rejects.toThrow(REFUSAL(username));
    await expect(prisma.user.findMany({ orderBy: { username: 'asc' } })).resolves.toEqual(before);
    await expect(prisma.session.count()).resolves.toBe(2);
    await expect(prisma.auditLog.count({ where: { action: 'PASSWORD_RESET' } })).resolves.toBe(0);
  });

  it('(d) ne journalise jamais le mot de passe en clair', async () => {
    const { temporaryPassword } = await resetSuperAdminPassword(prisma, 'direction');
    expect(JSON.stringify(await prisma.auditLog.findMany())).not.toContain(temporaryPassword);
  });

  it('(e) ligne de commande : refus en code 1 sur stderr, appel historique inchangé', () => {
    const refused = cli(['--reset-password', 'inconnu']);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain(REFUSAL('inconnu'));
    expect(refused.stdout).toBe('');

    const historic = cli([]);
    expect(historic.status).toBe(0);
    expect(historic.stdout).toContain('existe déjà');
  }, 60_000);

  it('(f) base inaccessible : échec complet, aucun mot de passe renvoyé', async () => {
    const unreachable = 'postgresql://u:p@127.0.0.1:1/absente';
    const offline = new PrismaClient({ datasourceUrl: unreachable });
    try {
      await expect(resetSuperAdminPassword(offline, 'direction')).rejects.toThrow();
    } finally {
      await offline.$disconnect();
    }
    expect(cli(['--reset-password', 'direction'], { ...process.env, DATABASE_URL: unreachable }).status).toBe(1);
  }, 60_000);
});
