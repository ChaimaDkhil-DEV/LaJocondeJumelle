import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { join } from 'node:path';
import request from 'supertest';
import { AuthService } from '../../src/auth/auth.service';
import { OrphanFilesJob } from '../../src/scheduler/orphan-files.job';
import { loginAs, SEED_PASSWORD, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * 015 — Communication enseignant / parents : représentants et classes attribuées (administration),
 * brouillon, soumission, validation (approuver, retourner, rejeter), nouvelle version, espace parent,
 * protection des vocaux, doublons et cloisonnement des comptes parents.
 */
const audio = join(__dirname, '..', 'fixtures', 'audio', 'sample.webm');

describe('Communication enseignant / parents (015)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let superadmin: string;
  let admin: string;
  let enseignante: string;
  let reprographie: string;
  let parentA: string;
  let parentB: string;
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
  const uploadVoice = async (cookie = enseignante): Promise<string> => {
    const res = await api()
      .post('/api/files')
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .field('kind', 'VOICE')
      .attach('file', audio);
    expect(res.status).toBe(201);
    return res.body.id as string;
  };
  const createDraft = async (body: object = {}) => {
    const res = await send('post', '/api/parent-communications', enseignante, {
      studentId: studentA,
      guardianId: guardianA,
      ...body,
    });
    expect(res.status).toBe(201);
    return res.body as { id: string; version: number; status: string };
  };
  /** Brouillon complet puis soumis : renvoie l'identifiant et la version courante. */
  const submitted = async (text = 'Lina a fait de grands progrès en lecture ce trimestre.') => {
    const draft = await createDraft({ text, voiceFileId: await uploadVoice() });
    const res = await send('post', `/api/parent-communications/${draft.id}/submit`, enseignante, {
      version: draft.version,
    });
    expect(res.status).toBe(200);
    return res.body as { id: string; version: number; currentRevision: number };
  };
  const decide = (id: string, body: object, cookie = superadmin) =>
    send('post', `/api/admin/parent-communications/${id}/decision`, cookie, body);

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
    enseignante = await loginAs(app, 'enseignante');
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
      parentA = await parentAccount(guardianA, 'parent.lina');
      parentB = await parentAccount(guardianB, 'parent.yassine');
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

  describe('enseignant : brouillon et soumission', () => {
    it('ne propose que les élèves de ses classes, avec leurs représentants ; refusé hors groupe Enseignants', async () => {
      const res = await get('/api/parent-communications/students', enseignante);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        expect.objectContaining({
          id: studentA,
          guardians: [expect.objectContaining({ id: guardianA, relationship: 'Mère' })],
        }),
      ]);
      expect(JSON.stringify(res.body)).not.toContain('sonia@example.org');
      expect((await get('/api/parent-communications/students', reprographie)).status).toBe(403);
    });

    it('refuse un élève hors de ses classes ou un représentant non lié', async () => {
      expect(
        (
          await send('post', '/api/parent-communications', enseignante, {
            studentId: studentB,
            guardianId: guardianB,
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await send('post', '/api/parent-communications', enseignante, {
            studentId: studentA,
            guardianId: guardianB,
          })
        ).status,
      ).toBe(422);
    });

    it('crée et modifie un brouillon ; le vocal d’un autre utilisateur est refusé', async () => {
      const draft = await createDraft({ text: 'Premier jet' });
      expect(draft.status).toBe('DRAFT');
      const foreign = await uploadVoice(reprographie);
      expect(
        (
          await send('patch', `/api/parent-communications/${draft.id}`, enseignante, {
            version: draft.version,
            voiceFileId: foreign,
          })
        ).status,
      ).toBe(422);
      const voice = await uploadVoice();
      const updated = await send('patch', `/api/parent-communications/${draft.id}`, enseignante, {
        version: draft.version,
        text: 'Texte corrigé',
        voiceFileId: voice,
      });
      expect(updated.status).toBe(200);
      expect(updated.body.draft).toEqual({
        text: 'Texte corrigé',
        voice: expect.objectContaining({ id: voice }),
      });
      // Version périmée : la modification concurrente est refusée.
      expect(
        (
          await send('patch', `/api/parent-communications/${draft.id}`, enseignante, {
            version: draft.version,
            text: 'x',
          })
        ).status,
      ).toBe(409);
      // Brouillon : invisible de la validation.
      expect((await get(`/api/admin/parent-communications/${draft.id}`, superadmin)).status).toBe(
        404,
      );
    });

    it('exige la remarque et le vocal ; soumise, elle ne se modifie plus et la validation est prévenue', async () => {
      const draft = await createDraft({ text: 'Sans vocal' });
      const incomplete = await send(
        'post',
        `/api/parent-communications/${draft.id}/submit`,
        enseignante,
        { version: draft.version },
      );
      expect(incomplete.status).toBe(422);
      expect(incomplete.body.error.code).toBe('PARENT_COMM_INCOMPLETE');

      const sent = await submitted();
      expect(sent).toMatchObject({ status: 'PENDING_ADMIN_VALIDATION', currentRevision: 1 });
      const edit = await send('patch', `/api/parent-communications/${sent.id}`, enseignante, {
        version: sent.version,
        text: 'Modifiée',
      });
      expect(edit.status).toBe(409);
      expect(edit.body.error.code).toBe('PARENT_COMM_NOT_EDITABLE');
      const superadminId = await userId(prisma, 'superadmin');
      expect(
        await prisma.notification.count({
          where: {
            communicationId: sent.id,
            userId: superadminId,
            type: 'PARENT_COMM_TO_VALIDATE',
          },
        }),
      ).toBe(1);
    });
  });

  describe('validation', () => {
    it('réservée à la permission : un admin sans elle est refusé, puis accepté quand le rôle la reçoit', async () => {
      const sent = await submitted();
      expect((await get('/api/admin/parent-communications', admin)).status).toBe(403);
      expect(
        (await decide(sent.id, { action: 'APPROVE', revision: 1, version: sent.version }, admin))
          .status,
      ).toBe(403);
      await prisma.rolePermission.create({
        data: { role: 'ADMIN', permission: 'PARENT_COMMUNICATION_VALIDATE' },
      });
      try {
        const list = await get('/api/admin/parent-communications', admin);
        expect(list.status).toBe(200);
        expect(list.body.map((c: { id: string }) => c.id)).toContain(sent.id);
      } finally {
        await prisma.rolePermission.delete({
          where: {
            role_permission: { role: 'ADMIN', permission: 'PARENT_COMMUNICATION_VALIDATE' },
          },
        });
      }
    });

    it('refus avant toute lecture de la requête : 403 journalisé, même avec un corps ou un filtre invalide', async () => {
      const id = '00000000-0000-4000-8000-000000000000';
      const before = await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } });
      expect(
        (await send('post', `/api/admin/parent-communications/${id}/decision`, enseignante, {}))
          .status,
      ).toBe(403);
      expect(
        (
          await send('post', `/api/admin/parent-communications/${id}/decision`, admin, {
            action: 'X',
          })
        ).status,
      ).toBe(403);
      expect((await get('/api/admin/parent-communications?status=INCONNU', admin)).status).toBe(
        403,
      );
      // Hors groupe Enseignants : refus avant la validation du brouillon.
      expect((await send('post', '/api/parent-communications', reprographie, {})).status).toBe(403);
      expect(
        (await send('patch', `/api/parent-communications/${id}`, reprographie, {})).status,
      ).toBe(403);
      expect((await get('/api/parent-communications?x=1', reprographie)).status).toBe(403);
      expect(await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } })).toBe(before + 6);
    });

    it('l’enseignant ne valide jamais sa propre communication, même avec la permission', async () => {
      const sent = await submitted();
      await prisma.rolePermission.create({
        data: { role: 'EMPLOYEE', permission: 'PARENT_COMMUNICATION_VALIDATE' },
      });
      try {
        const own = await decide(
          sent.id,
          { action: 'APPROVE', revision: 1, version: sent.version },
          await loginAs(app, 'enseignante'),
        );
        expect(own.status).toBe(403);
        expect(own.body.error.code).toBe('PARENT_COMM_SELF_DECISION');
      } finally {
        await prisma.rolePermission.delete({
          where: {
            role_permission: { role: 'EMPLOYEE', permission: 'PARENT_COMMUNICATION_VALIDATE' },
          },
        });
      }
    });

    it('filtre par enseignant, élève, classe et date', async () => {
      const sent = await submitted();
      const ids = async (qs: string) =>
        (
          (await get(`/api/admin/parent-communications?${qs}`, superadmin)).body as Array<{
            id: string;
          }>
        ).map((c) => c.id);
      expect(await ids(`teacherId=${enseignanteId}`)).toContain(sent.id);
      expect(await ids(`studentId=${studentA}`)).toContain(sent.id);
      expect(await ids(`classId=${violet}`)).toContain(sent.id);
      expect(await ids(`classId=${bleu}`)).not.toContain(sent.id);
      expect(await ids('from=2020-01-01&to=2020-01-31')).not.toContain(sent.id);
    });

    it('retour pour correction : motif obligatoire, enseignant prévenu, nouvelle version, approbation de la version examinée seulement', async () => {
      const sent = await submitted('Version un');
      expect(
        (await decide(sent.id, { action: 'RETURN', revision: 1, version: sent.version })).status,
      ).toBe(422);
      const returned = await decide(sent.id, {
        action: 'RETURN',
        revision: 1,
        version: sent.version,
        reason: 'Merci de préciser la matière concernée.',
      });
      expect(returned.status).toBe(200);
      expect(returned.body.status).toBe('RETURNED_FOR_CORRECTION');
      expect(
        await prisma.notification.count({
          where: { communicationId: sent.id, userId: enseignanteId, type: 'PARENT_COMM_RETURNED' },
        }),
      ).toBe(1);

      const mine = await get(`/api/parent-communications/${sent.id}`, enseignante);
      expect(mine.body.decisionReason).toBe('Merci de préciser la matière concernée.');
      const edited = await send('patch', `/api/parent-communications/${sent.id}`, enseignante, {
        version: mine.body.version,
        text: 'Version deux : progrès en mathématiques.',
      });
      const resubmitted = await send(
        'post',
        `/api/parent-communications/${sent.id}/submit`,
        enseignante,
        { version: edited.body.version },
      );
      expect(resubmitted.body).toMatchObject({
        status: 'PENDING_ADMIN_VALIDATION',
        currentRevision: 2,
      });

      const stale = await decide(sent.id, {
        action: 'APPROVE',
        revision: 1,
        version: resubmitted.body.version,
      });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('PARENT_COMM_REVISION_CHANGED');
      const approved = await decide(sent.id, {
        action: 'APPROVE',
        revision: 2,
        version: resubmitted.body.version,
      });
      expect(approved.status).toBe(200);
      expect(approved.body).toMatchObject({ status: 'APPROVED', approvedRevision: 2 });

      // Historique complet : versions et décisions.
      const detail = await get(`/api/admin/parent-communications/${sent.id}`, superadmin);
      expect(
        detail.body.revisions.map((r: { number: number; text: string }) => [r.number, r.text]),
      ).toEqual([
        [1, 'Version un'],
        [2, 'Version deux : progrès en mathématiques.'],
      ]);
      expect(detail.body.events.map((e: { type: string }) => e.type)).toEqual([
        'CREATED',
        'SUBMITTED',
        'RETURNED',
        'UPDATED',
        'SUBMITTED',
        'APPROVED',
      ]);
      // Ajout seul : une version ne se modifie pas en base.
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "ParentCommunicationRevision" SET "text" = 'x' WHERE "communicationId" = '${sent.id}'`,
        ),
      ).rejects.toThrow(/ajout seul/);
    });

    it('approbation exécutée deux fois : une seule décision, un seul événement outbox ; plus aucune modification', async () => {
      const sent = await submitted();
      const [first, second] = await Promise.all([
        decide(sent.id, { action: 'APPROVE', revision: 1, version: sent.version }),
        decide(sent.id, { action: 'APPROVE', revision: 1, version: sent.version }),
      ]);
      expect([first.status, second.status].sort()).toEqual([200, 409]);
      expect(
        await prisma.outboxEvent.count({
          where: { aggregateId: sent.id, type: 'PARENT_COMMUNICATION_APPROVED' },
        }),
      ).toBe(1);
      expect(
        await prisma.parentCommunicationEvent.count({
          where: { communicationId: sent.id, type: 'APPROVED' },
        }),
      ).toBe(1);
      const current = await get(`/api/parent-communications/${sent.id}`, enseignante);
      expect(
        (
          await send('patch', `/api/parent-communications/${sent.id}`, enseignante, {
            version: current.body.version,
            text: 'Après coup',
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await send('post', `/api/parent-communications/${sent.id}/cancel`, enseignante, {
            version: current.body.version,
          })
        ).status,
      ).toBe(409);
      expect(
        await prisma.notification.count({
          where: { communicationId: sent.id, userId: enseignanteId, type: 'PARENT_COMM_APPROVED' },
        }),
      ).toBe(1);
      const parentUser = await userId(prisma, 'parent.lina');
      expect(
        await prisma.notification.count({
          where: { communicationId: sent.id, userId: parentUser, type: 'PARENT_MESSAGE_NEW' },
        }),
      ).toBe(1);
    });

    it('rejet : motif obligatoire, définitif, enseignant prévenu', async () => {
      const sent = await submitted('À rejeter');
      expect(
        (
          await decide(sent.id, {
            action: 'REJECT',
            revision: 1,
            version: sent.version,
            reason: '',
          })
        ).status,
      ).toBe(422);
      const rejected = await decide(sent.id, {
        action: 'REJECT',
        revision: 1,
        version: sent.version,
        reason: 'Ce sujet relève d’un rendez-vous.',
      });
      expect(rejected.body.status).toBe('REJECTED');
      expect(
        await prisma.notification.count({
          where: { communicationId: sent.id, userId: enseignanteId, type: 'PARENT_COMM_REJECTED' },
        }),
      ).toBe(1);
      expect(
        (
          await send('post', `/api/parent-communications/${sent.id}/submit`, enseignante, {
            version: rejected.body.version,
          })
        ).status,
      ).toBe(409);
      expect(await prisma.outboxEvent.count({ where: { aggregateId: sent.id } })).toBe(0);
    });
  });

  describe('espace parent', () => {
    it('ne montre que les messages approuvés de ses enfants, et note la lecture', async () => {
      const approved = await submitted('Message approuvé pour Lina');
      await decide(approved.id, { action: 'APPROVE', revision: 1, version: approved.version });
      const pending = await submitted('Message en attente');

      const list = await get('/api/parent/messages', parentA);
      expect(list.status).toBe(200);
      const ids = (list.body as Array<{ id: string }>).map((m) => m.id);
      expect(ids).toContain(approved.id);
      expect(ids).not.toContain(pending.id);
      expect(list.body.find((m: { id: string }) => m.id === approved.id)).toMatchObject({
        read: false,
        teacher: { displayName: expect.any(String) },
        student: { firstName: 'Lina' },
      });

      const detail = await get(`/api/parent/messages/${approved.id}`, parentA);
      expect(detail.body).toMatchObject({
        text: 'Message approuvé pour Lina',
        voiceFileId: expect.any(String),
      });
      expect(JSON.stringify(detail.body)).not.toMatch(/decisionReason|revisions|events/);
      expect(
        (await get('/api/parent/messages', parentA)).body.find(
          (m: { id: string }) => m.id === approved.id,
        ).read,
      ).toBe(true);
      expect(
        await prisma.auditLog.count({
          where: { action: 'PARENT_COMMUNICATION_READ', targetId: approved.id },
        }),
      ).toBe(1);
      // FR-008 : chaque entrée d'audit garde son détail (événement, version…), jamais le texte.
      const trail = await prisma.auditLog.findMany({
        where: { targetType: 'ParentCommunication', targetId: approved.id },
        select: { action: true, details: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(trail.map((row) => [row.action, row.details])).toEqual([
        ['PARENT_COMMUNICATION_CHANGED', { event: 'CREATED', studentId: expect.any(String) }],
        ['PARENT_COMMUNICATION_CHANGED', { event: 'SUBMITTED', revision: 1 }],
        ['PARENT_COMMUNICATION_DECIDED', { decision: 'APPROVE', revision: 1 }],
        ['PARENT_COMMUNICATION_READ', null],
      ]);
      expect(JSON.stringify(trail)).not.toContain('Message approuvé pour Lina');

      expect((await get(`/api/parent/messages/${pending.id}`, parentA)).status).toBe(404);
      expect((await get(`/api/parent/messages/${approved.id}`, parentB)).status).toBe(404);
      expect((await get('/api/parent/messages', parentB)).body).toEqual([]);
    });

    it('cloche : la notification d’une communication donne l’élève, jamais la remarque ni une demande', async () => {
      const bell = await get('/api/notifications?limit=100', parentA);
      expect(bell.status).toBe(200);
      const item = (
        bell.body.items as Array<{
          type: string;
          request: unknown;
          communication: { id: string; studentName: string } | null;
        }>
      ).find((n) => n.type === 'PARENT_MESSAGE_NEW');
      expect(item).toMatchObject({
        request: null,
        communication: { id: expect.any(String), studentName: 'Lina Ben Salah' },
      });
      expect(JSON.stringify(bell.body)).not.toContain('Message approuvé pour Lina');
    });

    it('un compte parent n’accède à aucune autre partie de l’application', async () => {
      for (const path of [
        '/api/requests',
        '/api/parent-communications',
        '/api/admin/parent-communications',
        '/api/coverage',
        '/api/admin/guardians',
      ]) {
        expect((await get(path, parentA)).status).toBe(403);
      }
      expect((await get('/api/parent/messages', enseignante)).status).toBe(403);
    });
  });

  describe('vocaux', () => {
    it('lisibles par l’auteur et la validation ; par le parent destinataire seulement une fois approuvés', async () => {
      const pending = await submitted('Vocal en attente');
      const pendingVoice = (await get(`/api/admin/parent-communications/${pending.id}`, superadmin))
        .body.revisions[0].voiceFileId as string;
      expect((await get(`/api/files/${pendingVoice}`, enseignante)).status).toBe(200);
      expect((await get(`/api/files/${pendingVoice}`, superadmin)).status).toBe(200);
      expect((await get(`/api/files/${pendingVoice}`, parentA)).status).toBe(404);

      await decide(pending.id, { action: 'APPROVE', revision: 1, version: pending.version });
      expect((await get(`/api/files/${pendingVoice}`, parentA)).status).toBe(200);
      expect((await get(`/api/files/${pendingVoice}`, parentB)).status).toBe(404);
      expect((await get(`/api/files/${pendingVoice}`, reprographie)).status).toBe(404);
    });

    it('le nettoyage des fichiers provisoires ne supprime jamais un vocal de communication', async () => {
      const sent = await submitted('Vocal à garder');
      const voice = (await get(`/api/parent-communications/${sent.id}`, enseignante)).body.draft
        .voice.id as string;
      await app.get(OrphanFilesJob).runOnce(new Date(Date.now() + 7 * 86_400_000));
      expect(await prisma.file.count({ where: { id: voice } })).toBe(1);
    });
  });
});
