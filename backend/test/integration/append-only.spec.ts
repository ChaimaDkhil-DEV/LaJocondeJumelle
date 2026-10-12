import { PrismaClient } from '@prisma/client';
import { resetDatabase } from '../utils/test-db';

/**
 * V17 — L'historique des demandes et le journal d'audit sont en ajout seul :
 * la base elle-même refuse UPDATE, DELETE et TRUNCATE (principe V, research R6).
 */
describe('Tables en ajout seul (AuditLog, RequestEvent)', () => {
  const prisma = new PrismaClient();
  let requestId: string;
  let auditId: string;
  let eventId: string;

  beforeAll(async () => {
    await resetDatabase(prisma);
    const user = await prisma.user.create({
      data: { username: 'auteur', displayName: 'Auteur', role: 'EMPLOYEE', passwordHash: 'x' },
    });
    const category = await prisma.category.create({
      data: { name: 'Photocopies', circuit: 'A_DIRECT', creatorRoles: ['EMPLOYEE'], closureMode: 'AUTO' },
    });
    const request = await prisma.request.create({
      data: {
        reference: 'D-2026-000001',
        clientId: '7b1f0a52-3c3d-4f7e-9a51-0d2f3b0b6a01',
        title: 'Photocopies',
        categoryId: category.id,
        priority: 'NORMAL',
        requesterId: user.id,
        status: 'SENT',
        rulesSnapshot: {},
      },
    });
    requestId = request.id;
    eventId = (
      await prisma.requestEvent.create({
        data: { requestId, actorId: user.id, type: 'CREATED' },
      })
    ).id;
    auditId = (await prisma.auditLog.create({ data: { actorId: user.id, action: 'LOGIN_SUCCESS' } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('accepte les insertions', async () => {
    await expect(prisma.auditLog.count()).resolves.toBe(1);
    await expect(prisma.requestEvent.count()).resolves.toBe(1);
  });

  it.each([
    ['AuditLog', () => `UPDATE "AuditLog" SET "ip" = '1.2.3.4' WHERE "id" = '${auditId}'`],
    ['AuditLog', () => `DELETE FROM "AuditLog" WHERE "id" = '${auditId}'`],
    ['AuditLog', () => 'TRUNCATE TABLE "AuditLog"'],
    ['RequestEvent', () => `UPDATE "RequestEvent" SET "comment" = 'modifié' WHERE "id" = '${eventId}'`],
    ['RequestEvent', () => `DELETE FROM "RequestEvent" WHERE "id" = '${eventId}'`],
    ['RequestEvent', () => 'TRUNCATE TABLE "RequestEvent" CASCADE'],
  ])('refuse la modification de %s : %s', async (_table, sql) => {
    await expect(prisma.$executeRawUnsafe(sql())).rejects.toThrow(/ajout seul/);
  });

  it('ne modifie aucune ligne après les tentatives refusées', async () => {
    const audit = await prisma.auditLog.findUniqueOrThrow({ where: { id: auditId } });
    const event = await prisma.requestEvent.findUniqueOrThrow({ where: { id: eventId } });
    expect(audit.ip).toBeNull();
    expect(event.comment).toBeNull();
  });
});
