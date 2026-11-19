import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma.service';
import { applyRuntimeRole, leastPrivilegeProblems } from '../../src/database/runtime-role';
import { categoryId, CATEGORIES, loginAs, seedDemo } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Audit de sécurité R02 — l'API se connectait avec le superutilisateur PostgreSQL, propriétaire de toutes les
 * tables : il peut désactiver les triggers d'ajout seul, supprimer des tables ou lancer des commandes système
 * (COPY … PROGRAM). Le rôle d'exécution n'a que la lecture et l'écriture des lignes ; les tables en ajout seul
 * perdent en plus UPDATE et DELETE, comme leurs triggers. L'application complète fonctionne avec lui.
 */
describe('Rôle d’exécution PostgreSQL de l’API (R02)', () => {
  const owner = new PrismaClient();
  const ROLE = 'ljj_runtime_test';
  const PASSWORD = 'a1'.repeat(20);
  const urlFor = (password: string) => {
    const url = new URL(process.env.DATABASE_URL!);
    url.username = ROLE;
    url.password = password;
    return url.toString();
  };
  let runtime: PrismaClient;

  /** Message de l'erreur PostgreSQL d'une instruction exécutée avec le rôle d'exécution. */
  async function refusal(sql: string): Promise<string> {
    try {
      await runtime.$executeRawUnsafe(sql);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error(`Instruction acceptée alors qu'elle devait être refusée : ${sql}`);
  }

  beforeAll(async () => {
    await resetDatabase(owner);
    await seedDemo(owner);
    await applyRuntimeRole(owner, { role: ROLE, password: PASSWORD });
    runtime = new PrismaClient({ datasources: { db: { url: urlFor(PASSWORD) } } });
  });

  afterAll(async () => {
    await runtime.$disconnect();
    await owner.$executeRawUnsafe(`DROP OWNED BY "${ROLE}"`);
    await owner.$executeRawUnsafe(`DROP ROLE IF EXISTS "${ROLE}"`);
    await owner.$disconnect();
  });

  it('ni superutilisateur, ni propriétaire, ni créateur de rôles ou de bases', async () => {
    const [attributes] = await runtime.$queryRaw<Record<string, boolean>[]>`
      SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication
      FROM pg_roles WHERE rolname = current_user`;
    expect(attributes).toEqual({
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolbypassrls: false,
      rolreplication: false,
    });
    expect(await leastPrivilegeProblems(runtime)).toEqual([]);
  });

  it('toute la suite d’intégration fait tourner l’application avec le rôle d’exécution', async () => {
    const app = await createTestApp();
    try {
      const prisma = app.get(PrismaService);
      const [{ user }] = await prisma.$queryRaw<{ user: string }[]>`SELECT current_user AS user`;
      expect(user).toBe('ljj_runtime');
      expect(await leastPrivilegeProblems(prisma)).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('le superutilisateur est signalé : l’API refuse de démarrer avec lui en production', async () => {
    const problems = await leastPrivilegeProblems(owner);
    expect(problems.join(' ')).toMatch(/superutilisateur/);
    expect(problems.join(' ')).toMatch(/propriétaire/);
  });

  it('lecture, écriture et verrous consultatifs autorisés', async () => {
    expect(await runtime.user.count()).toBeGreaterThan(0);
    const floor = await runtime.floor.create({ data: { name: 'Étage R02', position: 99 } });
    await runtime.floor.update({ where: { id: floor.id }, data: { active: false } });
    await runtime.floor.delete({ where: { id: floor.id } });
    await runtime.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('r02'))::text`;
    });
  });

  it.each([
    ['supprimer une table', 'DROP TABLE "Notification"'],
    ['désactiver les triggers d’ajout seul', 'ALTER TABLE "AuditLog" DISABLE TRIGGER ALL'],
    ['créer une table', 'CREATE TABLE "Intrus" (id int)'],
    ['vider une table', 'TRUNCATE "Notification"'],
    ['lancer une commande système', "COPY (SELECT 1) TO PROGRAM 'true'"],
    ['contourner les triggers', 'SET session_replication_role = replica'],
    ['lire l’historique des migrations', 'SELECT * FROM "_prisma_migrations"'],
    ['créer un rôle', 'CREATE ROLE "intrus"'],
  ])('refus : %s', async (_label, sql) => {
    expect(await refusal(sql)).toMatch(/permission denied|must be owner|must be superuser|insufficient privilege/i);
  });

  it('tables en ajout seul : ni modification ni suppression, même sans trigger', async () => {
    for (const table of ['AuditLog', 'RequestEvent', 'RequestAssignment', 'ParentCommunicationRevision', 'ParentCommunicationEvent']) {
      expect(await refusal(`UPDATE "${table}" SET "id" = "id" WHERE false`)).toMatch(/permission denied/);
      expect(await refusal(`DELETE FROM "${table}" WHERE false`)).toMatch(/permission denied/);
    }
    // Suppression interdite, modification permise (anonymisation des présences, R09).
    for (const table of ['TeacherAttendance', 'TeacherDeparture', 'TeachingSession', 'TimetableSeries']) {
      expect(await refusal(`DELETE FROM "${table}" WHERE false`)).toMatch(/permission denied/);
      await expect(runtime.$executeRawUnsafe(`UPDATE "${table}" SET "id" = "id" WHERE false`)).resolves.toBe(0);
    }
  });

  it('droits retirés exactement là où un trigger interdit l’opération', async () => {
    const rows = await owner.$queryRaw<{ table: string; update: boolean; delete: boolean }[]>`
      SELECT c.relname AS table,
             has_table_privilege(${ROLE}, c.oid, 'UPDATE') AS update,
             has_table_privilege(${ROLE}, c.oid, 'DELETE') AS delete
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
      ORDER BY c.relname`;
    const without = (privilege: 'update' | 'delete') => rows.filter((r) => !r[privilege]).map((r) => r.table);
    expect(without('update')).toEqual([
      'AuditLog',
      'ParentCommunicationEvent',
      'ParentCommunicationRevision',
      'RequestAssignment',
      'RequestEvent',
    ]);
    expect(without('delete')).toEqual([
      'AuditLog',
      'ParentCommunicationEvent',
      'ParentCommunicationRevision',
      'RequestAssignment',
      'RequestEvent',
      'TeacherAttendance',
      'TeacherDeparture',
      'TeachingSession',
      'TimetableSeries',
    ]);
  });

  it('idempotent ; un nouveau mot de passe remplace l’ancien', async () => {
    const next = 'b2'.repeat(20);
    await applyRuntimeRole(owner, { role: ROLE, password: next });
    const renewed = new PrismaClient({ datasources: { db: { url: urlFor(next) } } });
    const stale = new PrismaClient({ datasources: { db: { url: urlFor(PASSWORD) } } });
    try {
      expect(await renewed.user.count()).toBeGreaterThan(0);
      await expect(stale.user.count()).rejects.toThrow(/authentication failed|password/i);
    } finally {
      await renewed.$disconnect();
      await stale.$disconnect();
      await applyRuntimeRole(owner, { role: ROLE, password: PASSWORD });
    }
  });

  it.each([
    ['mot de passe trop court', { role: ROLE, password: 'court' }],
    ['mot de passe hors [A-Za-z0-9]', { role: ROLE, password: `${'a'.repeat(32)}'; DROP TABLE "User"; --` }],
    ['nom de rôle invalide', { role: 'x"; DROP TABLE "User"; --', password: PASSWORD }],
    ['rôle propriétaire', { role: 'postgres', password: PASSWORD }],
  ])('refus avant toute modification : %s', async (_label, options) => {
    await expect(applyRuntimeRole(owner, options)).rejects.toThrow();
    expect(await owner.user.count()).toBeGreaterThan(0);
  });

  describe('application complète avec le rôle d’exécution', () => {
    let app: INestApplication;
    const suiteRuntimeUrl = process.env.RUNTIME_DATABASE_URL_TEST;

    beforeAll(async () => {
      // Rôle créé par ce fichier (createTestApp branche l'application sur RUNTIME_DATABASE_URL_TEST).
      process.env.RUNTIME_DATABASE_URL_TEST = urlFor(PASSWORD);
      app = await createTestApp();
    });

    afterAll(async () => {
      await app.close();
      process.env.RUNTIME_DATABASE_URL_TEST = suiteRuntimeUrl;
    });

    it('l’application est bien connectée avec le rôle d’exécution', async () => {
      const [{ user }] = await app.get(PrismaService).$queryRaw<{ user: string }[]>`SELECT current_user AS user`;
      expect(user).toBe(ROLE);
    });

    it('connexion, création d’une demande, historique et journal d’audit écrits', async () => {
      const before = await owner.auditLog.count();
      const cookie = await loginAs(app, 'enseignante');
      const created = await request(app.getHttpServer())
        .post('/api/requests')
        .set('Cookie', cookie)
        .set('Origin', TEST_ORIGIN)
        .send({
          clientId: randomUUID(),
          priority: 'NORMAL',
          categoryId: await categoryId(owner, CATEGORIES.photocopies),
          title: 'Photocopies (rôle d’exécution)',
          description: '30 copies',
        });
      expect(created.status).toBe(201);
      expect(await owner.requestEvent.count({ where: { requestId: created.body.id } })).toBeGreaterThan(0);
      expect(await owner.auditLog.count()).toBeGreaterThan(before);
    });
  });
});
