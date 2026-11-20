import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { loginAs, seedDemo } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Historique des classes d'un élève (021) : chaque création ou changement de classe ajoute une période, dans la
 * même transaction que l'élève ; l'audit garde l'avant et l'après (jamais le téléphone) ; la lecture est réservée
 * à l'administration.
 */
/** Marque d'ordre des octets que met Excel en tête d'un fichier CSV. */
const BOM = String.fromCharCode(0xfeff);

describe('Historique des classes d’un élève', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const cookies: Record<string, string> = {};
  let floorId: string;
  let levelId: string;
  const classes: Record<'A' | 'B' | 'C', string> = { A: '', B: '', C: '' };

  const api = () => request(app.getHttpServer());
  const get = (as: string, url: string) => api().get(url).set('Cookie', cookies[as]);
  const send = (as: string, method: 'post' | 'patch', url: string, body: Record<string, unknown>) =>
    api()[method](url).set('Cookie', cookies[as]).set('Origin', TEST_ORIGIN).send(body);
  const adminId = async (username: string) => (await prisma.user.findUniqueOrThrow({ where: { username } })).id;

  const createClass = async (name: string) => {
    const res = await send('superadmin', 'post', '/api/admin/coverage/classes', { name, floorId, levelId });
    expect(res.status).toBe(201);
    return (res.body as Array<{ id: string; name: string }>).find((c) => c.name === name)!.id;
  };
  const createStudent = async (as: string, classId: string, extra: Record<string, unknown> = {}) => {
    const res = await send(as, 'post', '/api/admin/students', { firstName: 'Amine', lastName: 'Historique', classId, parentPhone: '+216 20 123 456', ...extra });
    expect(res.status).toBe(201);
    return (res.body as { id: string }).id;
  };
  const updateStudent = (as: string, id: string, body: Record<string, unknown>) => send(as, 'patch', `/api/admin/students/${id}`, body);
  const rowsOf = (studentId: string) => prisma.studentClassHistory.findMany({ where: { studentId }, orderBy: [{ startedAt: 'asc' }, { seq: 'asc' }] });

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    for (const username of ['superadmin', 'admin', 'surveillant', 'enseignante']) cookies[username] = await loginAs(app, username);
    floorId = (await prisma.floor.findFirstOrThrow()).id;
    const level = await send('superadmin', 'post', '/api/admin/levels', { name: 'Niveau historique', cycle: 'PRIMARY', position: 50 });
    expect(level.status).toBe(201);
    levelId = (level.body as Array<{ id: string; name: string }>).find((l) => l.name === 'Niveau historique')!.id;
    for (const key of ['A', 'B', 'C'] as const) classes[key] = await createClass(`Histo ${key}`);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('écriture', () => {
    it('la création d’un élève ajoute sa première période, à son nom et à l’heure du serveur', async () => {
      const before = Date.now();
      const id = await createStudent('admin', classes.A);
      const rows = await rowsOf(id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ classId: classes.A, changedById: await adminId('admin'), reconstructed: false });
      expect(rows[0].startedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(rows[0].startedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('A → B → C : trois périodes dans l’ordre, avec leur auteur', async () => {
      const id = await createStudent('superadmin', classes.A);
      expect((await updateStudent('admin', id, { firstName: 'Amine', lastName: 'Historique', classId: classes.B, parentPhone: '+216 20 123 456' })).status).toBe(200);
      expect((await updateStudent('superadmin', id, { firstName: 'Amine', lastName: 'Historique', classId: classes.C, parentPhone: '+216 20 123 456' })).status).toBe(200);
      const rows = await rowsOf(id);
      expect(rows.map((r) => r.classId)).toEqual([classes.A, classes.B, classes.C]);
      expect(rows.map((r) => r.changedById)).toEqual([await adminId('superadmin'), await adminId('admin'), await adminId('superadmin')]);
      expect(rows[1].startedAt.getTime()).toBeGreaterThanOrEqual(rows[0].startedAt.getTime());
      expect((await prisma.student.findUniqueOrThrow({ where: { id } })).classId).toBe(classes.C);
    });

    it('un changement qui ne touche pas la classe n’ajoute aucune période (FR-003)', async () => {
      const id = await createStudent('admin', classes.A);
      const res = await updateStudent('admin', id, { firstName: 'Amine', lastName: 'Renommé', classId: classes.A, parentPhone: '+216 20 999 888', active: false });
      expect(res.status).toBe(200);
      expect(await rowsOf(id)).toHaveLength(1);
    });

    it('deux changements dans la même minute : l’ordre d’écriture départage, la dernière ligne est la classe actuelle', async () => {
      const id = await createStudent('admin', classes.A);
      for (const classId of [classes.B, classes.C, classes.A]) {
        await updateStudent('admin', id, { firstName: 'Amine', lastName: 'Historique', classId, parentPhone: '+216 20 123 456' });
      }
      const rows = await rowsOf(id);
      expect(rows.map((r) => r.classId)).toEqual([classes.A, classes.B, classes.C, classes.A]);
      expect(rows.at(-1)!.classId).toBe((await prisma.student.findUniqueOrThrow({ where: { id } })).classId);
    });

    it('tout ou rien : si l’écriture de l’élève échoue, aucune période n’est conservée', async () => {
      const id = await createStudent('admin', classes.A);
      // Classe inexistante : refusée avant toute écriture.
      const refused = await updateStudent('admin', id, { firstName: 'Amine', lastName: 'Historique', classId: '00000000-0000-4000-8000-00000000dead', parentPhone: '+216 20 123 456' });
      expect(refused.status).toBeGreaterThanOrEqual(400);
      expect(await rowsOf(id)).toHaveLength(1);
      // Échec au milieu de la transaction : l'écriture de l'historique est refusée par la base.
      await prisma.$executeRawUnsafe(`ALTER TABLE "StudentClassHistory" ADD CONSTRAINT "tmp_refuse" CHECK ("classId" <> '${classes.B}') NOT VALID`);
      try {
        const res = await updateStudent('admin', id, { firstName: 'Amine', lastName: 'Historique', classId: classes.B, parentPhone: '+216 20 123 456' });
        expect(res.status).toBeGreaterThanOrEqual(500);
      } finally {
        await prisma.$executeRawUnsafe(`ALTER TABLE "StudentClassHistory" DROP CONSTRAINT "tmp_refuse"`);
      }
      expect((await prisma.student.findUniqueOrThrow({ where: { id } })).classId).toBe(classes.A);
      expect(await rowsOf(id)).toHaveLength(1);
    });
  });

  describe('import CSV (FR-002 : il ne fait que créer des élèves)', () => {
    const csv = (lines: string[]) => `${BOM}${['prenom;nom;classe;telephone_parent', ...lines].join('\r\n')}\r\n`;

    it('chaque élève importé reçoit sa période, au nom de celui qui importe', async () => {
      const res = await send('admin', 'post', '/api/admin/students/import', {
        csv: csv(['Nour;ImportHisto;Histo A;+216 20 777 771', 'Sami;ImportHisto;Histo B;+216 20 777 772']),
        dryRun: false,
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ created: true, count: 2 });
      const students = await prisma.student.findMany({ where: { lastName: 'ImportHisto' } });
      expect(students).toHaveLength(2);
      for (const student of students) {
        const rows = await rowsOf(student.id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ classId: student.classId, changedById: await adminId('admin'), reconstructed: false });
      }
    });

    it('un fichier refusé n’écrit ni élève ni période', async () => {
      const before = await prisma.studentClassHistory.count();
      const res = await send('admin', 'post', '/api/admin/students/import', { csv: csv(['Bon;Fichier;Histo A;+216 20 777 773', 'Mauvais;Fichier;Classe inconnue;+216 20 777 774']), dryRun: false });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ created: false });
      expect(await prisma.studentClassHistory.count()).toBe(before);
    });

    it('l’aperçu n’écrit rien', async () => {
      const before = await prisma.studentClassHistory.count();
      await send('admin', 'post', '/api/admin/students/import', { csv: csv(['Aperçu;Seul;Histo A;+216 20 777 775']), dryRun: true });
      expect(await prisma.studentClassHistory.count()).toBe(before);
    });
  });

  describe('journal d’audit (FR-007)', () => {
    it('un changement de classe garde l’avant et l’après, sans le téléphone', async () => {
      const id = await createStudent('admin', classes.A);
      await updateStudent('admin', id, { firstName: 'Amine', lastName: 'Historique', classId: classes.B, parentPhone: '+216 20 111 222' });
      const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'STUDENT_CHANGED', targetId: id }, orderBy: { createdAt: 'desc' } });
      expect(entry.details).toMatchObject({
        action: 'update',
        fields: expect.arrayContaining(['classId', 'parentPhone']),
        before: { classId: classes.A },
        after: { classId: classes.B },
      });
      expect(JSON.stringify(entry.details)).not.toContain('+216');
      const details = entry.details as { before: Record<string, unknown>; after: Record<string, unknown> };
      expect(details.before).not.toHaveProperty('parentPhone');
      expect(details.after).not.toHaveProperty('parentPhone');
      expect(Object.keys(details.before)).toEqual(['classId']);
    });

    it('seuls les champs modifiés figurent dans l’avant et l’après', async () => {
      const id = await createStudent('admin', classes.A);
      await updateStudent('admin', id, { firstName: 'Amine', lastName: 'Autre', classId: classes.A, parentPhone: '+216 20 123 456', active: false });
      const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'STUDENT_CHANGED', targetId: id }, orderBy: { createdAt: 'desc' } });
      expect(entry.details).toMatchObject({ before: { lastName: 'Historique', active: true }, after: { lastName: 'Autre', active: false } });
      expect(Object.keys((entry.details as { before: object }).before).sort()).toEqual(['active', 'lastName']);
    });

    it('à la création, l’entrée garde l’action et la classe', async () => {
      const id = await createStudent('admin', classes.B);
      const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'STUDENT_CHANGED', targetId: id } });
      expect(entry.details).toEqual({ action: 'create', classId: classes.B });
    });
  });

  describe('lecture : GET /admin/students/:id/class-history', () => {
    it('liste les périodes, la plus récente d’abord, chacune finissant quand la suivante commence', async () => {
      const id = await createStudent('admin', classes.A);
      await updateStudent('admin', id, { firstName: 'Amine', lastName: 'Historique', classId: classes.B, parentPhone: '+216 20 123 456' });
      const res = await get('admin', `/api/admin/students/${id}/class-history`);
      expect(res.status).toBe(200);
      const body = res.body as { studentId: string; items: Array<{ class: { id: string; name: string; level: string; floor: string }; startedAt: string; endedAt: string | null; changedBy: { displayName: string } | null; reconstructed: boolean; availability: string; warning: string | null }> };
      expect(body.studentId).toBe(id);
      expect(body.items.map((i) => i.class.name)).toEqual(['Histo B', 'Histo A']);
      expect(body.items[0].endedAt).toBeNull();
      expect(body.items[1].endedAt).toBe(body.items[0].startedAt);
      expect(body.items[0]).toMatchObject({ reconstructed: false, availability: 'KNOWN', warning: null, class: { level: 'Niveau historique' } });
      expect(body.items[0].changedBy?.displayName).toBeTruthy();
    });

    it('une ligne reconstituée est « probable » avec son avertissement, jusqu’à la mise en service', async () => {
      const id = await createStudent('admin', classes.A);
      const goLive = new Date(Date.now() + 3_600_000);
      await prisma.$executeRawUnsafe(`ALTER TABLE "StudentClassHistory" DISABLE TRIGGER "StudentClassHistory_append_only"`);
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "StudentClassHistory" SET "reconstructed" = true, "changedById" = NULL, "createdAt" = '${goLive.toISOString()}', "startedAt" = '2026-09-01T07:00:00Z' WHERE "studentId" = '${id}'`,
        );
      } finally {
        await prisma.$executeRawUnsafe(`ALTER TABLE "StudentClassHistory" ENABLE TRIGGER "StudentClassHistory_append_only"`);
      }
      const res = await get('admin', `/api/admin/students/${id}/class-history`);
      const [item] = (res.body as { items: Array<{ reconstructed: boolean; availability: string; warning: string; changedBy: unknown; probableUntil: string }> }).items;
      expect(item).toMatchObject({ reconstructed: true, availability: 'PROBABLE', changedBy: null, probableUntil: goLive.toISOString() });
      expect(item.warning).toMatch(/non garantie/i);
    });

    it('un identifiant inconnu ou mal formé : 404', async () => {
      expect((await get('admin', '/api/admin/students/00000000-0000-4000-8000-00000000dead/class-history')).status).toBe(404);
      expect((await get('admin', '/api/admin/students/pas-un-uuid/class-history')).status).toBe(404);
    });

    it.each(['surveillant', 'enseignante'])('%s : 404, sans rien révéler de l’élève', async (who) => {
      const id = await createStudent('admin', classes.A);
      const res = await get(who, `/api/admin/students/${id}/class-history`);
      expect([403, 404]).toContain(res.status);
      expect(JSON.stringify(res.body)).not.toContain('Historique');
    });
  });
});
