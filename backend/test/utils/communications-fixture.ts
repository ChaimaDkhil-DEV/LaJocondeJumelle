import type { INestApplication } from '@nestjs/common';
import { PrismaClient, type Permission } from '@prisma/client';
import { join } from 'node:path';
import request from 'supertest';
import { AuthService } from '../../src/auth/auth.service';
import { loginAs, SEED_PASSWORD, seedDemo, userId } from './auth-helpers';
import { createTestApp, TEST_ORIGIN } from './test-app';
import { resetDatabase } from './test-db';

/**
 * Données communes des tests 017 (communications centrées sur l'administration).
 *
 * - enseignante : classes Violet et Bleu ; collegue : Violet seulement ; reprographie : employé non enseignant.
 * - admin (rôle ADMIN : soumission pour validation par défaut, validation) ; admin2 (second ADMIN) ;
 *   superadmin (tout, envoi direct).
 * - Sonia : représentante de Lina (Violet) et Adam (Bleu), compte parent.
 * - Karim : représentant de Yassine (Violet), compte parent.
 * - Nora : représentante de Lina, sans compte parent.
 */

const AUDIO = join(__dirname, '..', 'fixtures', 'audio', 'sample.webm');

export interface Fixture {
  app: INestApplication;
  prisma: PrismaClient;
  cookies: Record<
    'superadmin' | 'admin' | 'admin2' | 'enseignante' | 'collegue' | 'reprographie' | 'sonia' | 'karim',
    string
  >;
  ids: {
    superadmin: string;
    admin: string;
    admin2: string;
    enseignante: string;
    collegue: string;
    sonia: string;
    karim: string;
    nora: string;
    soniaUser: string;
    karimUser: string;
    lina: string;
    adam: string;
    yassine: string;
    violet: string;
    bleu: string;
  };
  get: (path: string, cookie: string) => request.Test;
  send: (method: 'post' | 'patch' | 'put', path: string, cookie: string, body?: object) => request.Test;
  uploadVoice: (cookie: string) => Promise<string>;
  /** Remplace les permissions configurables du rôle ADMIN (rétablies par `restoreAdminPermissions`). */
  setAdminPermissions: (permissions: Permission[]) => Promise<void>;
  restoreAdminPermissions: () => Promise<void>;
  close: () => Promise<void>;
}

export async function setupCommunications(): Promise<Fixture> {
  const prisma = new PrismaClient();
  await resetDatabase(prisma);
  await seedDemo(prisma);
  const app = await createTestApp();
  const api = () => request(app.getHttpServer());
  const get = (path: string, cookie: string) => api().get(path).set('Cookie', cookie);
  const send = (method: 'post' | 'patch' | 'put', path: string, cookie: string, body: object = {}) =>
    api()[method](path).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  const passwordHash = await app.get(AuthService).hashPassword(SEED_PASSWORD);

  const teachers = await prisma.employeeGroup.findFirstOrThrow({ where: { systemKey: 'TEACHERS' } });
  const collegue = await prisma.user.create({
    data: {
      username: 'enseignante.math',
      displayName: 'Mme Mathlouthi',
      role: 'EMPLOYEE',
      mustChangePassword: false,
      passwordHash,
    },
  });
  await prisma.employeeGroupMember.create({ data: { groupId: teachers.id, userId: collegue.id } });
  const admin2 = await prisma.user.create({
    data: {
      username: 'admin.deux',
      displayName: 'Mme Deux',
      role: 'ADMIN',
      mustChangePassword: false,
      passwordHash,
    },
  });

  const cookies = {
    superadmin: await loginAs(app, 'superadmin'),
    admin: await loginAs(app, 'admin'),
    admin2: await loginAs(app, 'admin.deux'),
    enseignante: await loginAs(app, 'enseignante'),
    collegue: await loginAs(app, 'enseignante.math'),
    reprographie: await loginAs(app, 'reprographie'),
    sonia: '',
    karim: '',
  };

  const violet = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '1ère année Violet' } })).id;
  const bleu = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '2e année Bleu' } })).id;
  const student = async (firstName: string, classId: string) =>
    (
      await prisma.student.create({
        data: { firstName, lastName: 'Famille', classId, parentPhone: '+21620000001' },
      })
    ).id;
  const lina = await student('Lina', violet);
  const adam = await student('Adam', bleu);
  const yassine = await student('Yassine', violet);

  const enseignante = await userId(prisma, 'enseignante');
  for (const [teacherId, classIds] of [
    [enseignante, [violet, bleu]],
    [collegue.id, [violet]],
  ] as const) {
    const res = await send('put', `/api/admin/teacher-classes/${teacherId}`, cookies.admin, { classIds });
    if (res.status !== 200) throw new Error(`teacher-classes ${res.status}`);
  }

  const guardian = async (firstName: string, lastName: string, studentIds: string[], email?: string) => {
    const res = await send('post', '/api/admin/guardians', cookies.admin, {
      firstName,
      lastName,
      relationship: 'Mère',
      studentIds,
      ...(email ? { email } : {}),
    });
    if (res.status !== 201) throw new Error(`guardian ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id as string;
  };
  const account = async (guardianId: string, username: string) => {
    const res = await send('post', `/api/admin/guardians/${guardianId}/account`, cookies.admin, { username });
    if (res.status !== 201) throw new Error(`account ${res.status}`);
    await prisma.user.update({ where: { username }, data: { passwordHash, mustChangePassword: false } });
    return loginAs(app, username);
  };
  const sonia = await guardian('Sonia', 'Famille', [lina, adam], 'sonia@example.test');
  const karim = await guardian('Karim', 'Autre', [yassine]);
  const nora = await guardian('Nora', 'Famille', [lina]);
  cookies.sonia = await account(sonia, 'parent.sonia');
  cookies.karim = await account(karim, 'parent.karim');

  const defaultAdmin = (await prisma.rolePermission.findMany({ where: { role: 'ADMIN' } })).map((r) => r.permission);
  const setAdminPermissions = async (permissions: Permission[]) => {
    await prisma.rolePermission.deleteMany({ where: { role: 'ADMIN' } });
    await prisma.rolePermission.createMany({ data: permissions.map((permission) => ({ role: 'ADMIN' as const, permission })) });
  };

  return {
    app,
    prisma,
    cookies,
    ids: {
      superadmin: await userId(prisma, 'superadmin'),
      admin: await userId(prisma, 'admin'),
      admin2: admin2.id,
      enseignante,
      collegue: collegue.id,
      sonia,
      karim,
      nora,
      soniaUser: await userId(prisma, 'parent.sonia'),
      karimUser: await userId(prisma, 'parent.karim'),
      lina,
      adam,
      yassine,
      violet,
      bleu,
    },
    get,
    send,
    uploadVoice: async (cookie: string) => {
      const res = await api().post('/api/files').set('Cookie', cookie).set('Origin', TEST_ORIGIN).field('kind', 'VOICE').attach('file', AUDIO);
      if (res.status !== 201) throw new Error(`upload ${res.status} ${JSON.stringify(res.body)}`);
      return res.body.id as string;
    },
    setAdminPermissions,
    restoreAdminPermissions: () => setAdminPermissions(defaultAdmin),
    close: async () => {
      await app.close();
      await prisma.$disconnect();
    },
  };
}

/** Types des réponses (contracts/api.md). */
export interface MessageView {
  id: string;
  authorKind: 'TEACHER' | 'PARENT' | 'ADMIN';
  authorLabel: string;
  mine: boolean;
  status: string;
  text: string | null;
  voice: { fileId: string; durationSeconds: number | null } | null;
  createdAt: string;
  readAt: string | null;
  validation?: { revision: number; version: number; decisionReason: string | null; decidedAt: string | null };
}

export interface ConversationView {
  id: string;
  type: 'INTERNAL' | 'PARENT' | 'LEGACY_TEACHER_PARENT';
  status: 'OPEN' | 'CLOSED';
  student: { id: string; firstName: string; lastName: string; class: { id: string; name: string } };
  teacher?: { id: string; displayName: string };
  guardian?: { id: string; firstName: string; lastName: string };
  responsibleAdmin?: { id: string; displayName: string } | null;
  linkedInternalId?: string | null;
  unread: number;
  lastMessageAt: string;
  messages?: MessageView[];
  canPost?: boolean;
}
