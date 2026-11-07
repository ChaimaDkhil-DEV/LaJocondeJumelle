import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * 011 (US3, FR-004, FR-005, SC-004) : liste des employés en lecture seule pour l'admin et le super
 * administrateur, limitée à six informations ; refusée aux employés (AdministrationGuard).
 */
describe('Liste des employés (011)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookies: Record<string, string> = {};

  type Item = {
    id: string;
    displayName: string;
    jobTitle: string | null;
    role: string;
    active: boolean;
    groups: Array<{ id: string; name: string }>;
    floor: { id: string; name: string } | null;
  };
  const list = async (as: string) => request(app.getHttpServer()).get('/api/admin/employees').set('Cookie', cookies[as]);

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    for (const username of ['superadmin', 'admin', 'enseignante']) cookies[username] = await loginAs(app, username);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it.each(['admin', 'superadmin'])('%s : tous les comptes, triés par nom, avec exactement six informations', async (as) => {
    await prisma.user.upsert({
      where: { username: 'ancien.employe' },
      update: {},
      create: { username: 'ancien.employe', displayName: 'Ancien employé', role: 'EMPLOYEE', passwordHash: 'x', active: false, jobTitle: '' },
    });
    const res = await list(as);
    expect(res.status).toBe(200);
    const items = res.body as Item[];

    expect(items).toHaveLength(await prisma.user.count());
    expect(items.map((i) => i.displayName)).toEqual(
      (await prisma.user.findMany({ orderBy: { displayName: 'asc' }, select: { displayName: true } })).map((u) => u.displayName),
    );
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(['active', 'displayName', 'floor', 'groups', 'id', 'jobTitle', 'role']);
    }
    // Comptes inactifs et super administrateur inclus, en lecture.
    expect(items.find((i) => i.displayName === 'Ancien employé')).toMatchObject({ active: false, jobTitle: null, groups: [], floor: null });
    expect(items.some((i) => i.role === 'SUPER_ADMIN')).toBe(true);
    // Aucun identifiant de connexion ni état du mot de passe dans la réponse.
    expect(JSON.stringify(res.body)).not.toMatch(/username|mustChangePassword|passwordHash|createdAt|recipient/);
  });

  it('groupes actifs seulement, triés par nom ; étage du surveillant', async () => {
    const surveillantId = await userId(prisma, 'surveillant');
    const supervisor = await prisma.user.findUniqueOrThrow({ where: { id: surveillantId }, include: { floor: true } });
    const extra = await prisma.employeeGroup.create({
      data: { name: 'Aaa groupe actif', members: { create: [{ userId: surveillantId }] } },
    });
    const closed = await prisma.employeeGroup.create({
      data: { name: 'Groupe fermé', active: false, members: { create: [{ userId: surveillantId }] } },
    });

    const item = ((await list('admin')).body as Item[]).find((i) => i.id === surveillantId)!;
    const names = item.groups.map((g) => g.name);
    expect(names).toContain('Aaa groupe actif');
    expect(names).not.toContain('Groupe fermé');
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(item.groups.find((g) => g.name === 'Aaa groupe actif')).toEqual({ id: extra.id, name: extra.name });
    expect(item.floor).toEqual(supervisor.floor ? { id: supervisor.floor.id, name: supervisor.floor.name } : null);

    await prisma.employeeGroup.deleteMany({ where: { id: { in: [extra.id, closed.id] } } });
  });

  it('employé : refusé (403) et journalisé NOT_ADMINISTRATION', async () => {
    const enseignanteId = await userId(prisma, 'enseignante');
    const denied = { action: 'ACCESS_DENIED' as const, actorId: enseignanteId, details: { path: ['reason'], equals: 'NOT_ADMINISTRATION' } };
    const before = await prisma.auditLog.count({ where: denied });
    expect((await list('enseignante')).status).toBe(403);
    expect(await prisma.auditLog.count({ where: denied })).toBe(before + 1);
  });

  it('sans session : 401', async () => {
    expect((await request(app.getHttpServer()).get('/api/admin/employees')).status).toBe(401);
  });
});
