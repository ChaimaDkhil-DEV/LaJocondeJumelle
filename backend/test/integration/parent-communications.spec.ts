import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AuthService } from '../../src/auth/auth.service';
import { loginAs, SEED_PASSWORD, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * 015 — Représentants et classes attribuées aux enseignants (administration), comptes parents. Les
 * conversations sont testées par les suites communications-*.spec.ts (017) : les brouillons de
 * l'enseignant au parent, la validation des deux sens et les discussions 015 n'existent plus.
 */
describe('Communication enseignant / parents (015)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let superadmin: string;
  let admin: string;
  let reprographie: string;
  let enseignanteId: string;
  let violet: string;
  let bleu: string;
  let studentA: string;
  let studentB: string;
  let guardianA: string;
  let guardianB: string;

  const api = () => request(app.getHttpServer());
  const get = (path: string, cookie: string) => api().get(path).set('Cookie', cookie);
  const send = (
    method: 'post' | 'patch' | 'put',
    path: string,
    cookie: string,
    body: object = {},
  ) => api()[method](path).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  async function parentAccount(guardianId: string, username: string): Promise<string> {
    const res = await send('post', `/api/admin/guardians/${guardianId}/account`, admin, {
      username,
    });
    expect(res.status).toBe(201);
    expect(res.body.temporaryPassword).toEqual(expect.any(String));
    // Premier changement de mot de passe court-circuité : le mot de passe commun des tests le remplace.
    const passwordHash = await app.get(AuthService).hashPassword(SEED_PASSWORD);
    await prisma.user.update({
      where: { username },
      data: { passwordHash, mustChangePassword: false },
    });
    return loginAs(app, username);
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    superadmin = await loginAs(app, 'superadmin');
    admin = await loginAs(app, 'admin');
    reprographie = await loginAs(app, 'reprographie');
    enseignanteId = await userId(prisma, 'enseignante');
    violet = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '1ère année Violet' } }))
      .id;
    bleu = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '2e année Bleu' } })).id;
    studentA = (
      await prisma.student.create({
        data: {
          firstName: 'Lina',
          lastName: 'Ben Salah',
          classId: violet,
          parentPhone: '+21620000001',
          mealService: 'CANTINE',
        },
      })
    ).id;
    studentB = (
      await prisma.student.create({
        data: {
          firstName: 'Yassine',
          lastName: 'Trabelsi',
          classId: bleu,
          parentPhone: '+21620000002',
          mealService: 'CANTINE',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('administration : classes des enseignants et représentants', () => {
    it('refuse un employé', async () => {
      expect((await get('/api/admin/guardians', reprographie)).status).toBe(403);
      expect(
        (
          await send('put', `/api/admin/teacher-classes/${enseignanteId}`, reprographie, {
            classIds: [violet],
          })
        ).status,
      ).toBe(403);
    });

    it('attribue des classes à un membre du groupe Enseignants seulement', async () => {
      const res = await send('put', `/api/admin/teacher-classes/${enseignanteId}`, admin, {
        classIds: [violet],
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ teacherId: enseignanteId, classIds: [violet] });
      const notTeacher = await send(
        'put',
        `/api/admin/teacher-classes/${await userId(prisma, 'reprographie')}`,
        admin,
        { classIds: [violet] },
      );
      expect(notTeacher.status).toBe(422);
      const list = await get('/api/admin/teacher-classes', admin);
      expect(list.body).toEqual([
        expect.objectContaining({
          teacher: expect.objectContaining({ id: enseignanteId }),
          classIds: [violet],
        }),
      ]);
    });

    it('crée les représentants liés à leurs élèves', async () => {
      const a = await send('post', '/api/admin/guardians', admin, {
        firstName: 'Sonia',
        lastName: 'Ben Salah',
        relationship: 'Mère',
        email: 'sonia@example.org',
        phone: '+21620000001',
        studentIds: [studentA],
      });
      expect(a.status).toBe(201);
      guardianA = a.body.id;
      expect(a.body.students).toEqual([expect.objectContaining({ id: studentA })]);
      const b = await send('post', '/api/admin/guardians', admin, {
        firstName: 'Karim',
        lastName: 'Trabelsi',
        relationship: 'Père',
        studentIds: [studentB],
      });
      guardianB = b.body.id;
      expect(
        (
          await send('post', '/api/admin/guardians', admin, {
            firstName: 'X',
            lastName: 'Y',
            studentIds: ['00000000-0000-4000-8000-000000000000'],
          })
        ).status,
      ).toBe(422);
    });

    it('crée les comptes parents, absents des listes d’employés ; un compte PARENT ne se crée pas ailleurs', async () => {
      await parentAccount(guardianA, 'parent.lina');
      await parentAccount(guardianB, 'parent.yassine');
      expect(
        (
          await send('post', `/api/admin/guardians/${guardianA}/account`, admin, {
            username: 'parent.lina2',
          })
        ).status,
      ).toBe(409);
      const users = await get('/api/admin/users?limit=100', superadmin);
      expect(JSON.stringify(users.body)).not.toContain('parent.lina');
      const employees = await get('/api/admin/employees', admin);
      expect(JSON.stringify(employees.body)).not.toContain('Ben Salah');
      const direct = await send('post', '/api/admin/users', superadmin, {
        username: 'parent.direct',
        displayName: 'Parent direct',
        role: 'PARENT',
      });
      expect(direct.status).toBe(400);
    });
  });
});
