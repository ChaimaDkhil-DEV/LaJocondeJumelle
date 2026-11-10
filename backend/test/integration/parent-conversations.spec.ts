import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { join } from 'node:path';
import request from 'supertest';
import { AuthService } from '../../src/auth/auth.service';
import { loginAs, SEED_PASSWORD, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * 015 — conversations parent ↔ enseignant : le parent choisit un enfant puis un enseignant de sa
 * classe ; une conversation par trio parent + enseignant + enfant ; chaque message, dans les deux
 * sens, est validé par l'administration (un seul validateur) avant d'être transmis.
 */
const audio = join(__dirname, '..', 'fixtures', 'audio', 'sample.webm');

interface ConversationMessage {
  id: string;
  author: 'TEACHER' | 'PARENT';
  own: boolean;
  status: string;
  version: number | null;
  revision: number | null;
  text: string | null;
  voiceFileId: string | null;
  decisionReason: string | null;
  readAt: string | null;
}

describe('Conversations parent ↔ enseignant (015)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let superadmin: string;
  let admin: string;
  let enseignante: string;
  let reprographie: string;
  let parent: string;
  let autreParent: string;
  let enseignanteId: string;
  let collegueId: string;
  let lina: string;
  let adam: string;
  let yassine: string;
  let sonia: string;
  let karim: string;

  const api = () => request(app.getHttpServer());
  const get = (path: string, cookie: string) => api().get(path).set('Cookie', cookie);
  const send = (
    method: 'post' | 'patch' | 'put',
    path: string,
    cookie: string,
    body: object = {},
  ) => api()[method](path).set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  const uploadVoice = async (cookie: string): Promise<string> => {
    const res = await api()
      .post('/api/files')
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .field('kind', 'VOICE')
      .attach('file', audio);
    expect(res.status).toBe(201);
    return res.body.id as string;
  };
  const conversation = (teacherId: string, studentId: string) =>
    `/api/parent/messages/conversations/${teacherId}/${studentId}`;
  const parentSends = async (
    teacherId: string,
    studentId: string,
    text: string,
    voiceFileId: string | null = null,
  ): Promise<ConversationMessage> => {
    const res = await send('post', conversation(teacherId, studentId), parent, {
      text,
      voiceFileId,
    });
    expect(res.status).toBe(201);
    return res.body as ConversationMessage;
  };
  const decide = (id: string, body: object, cookie = admin) =>
    send('post', `/api/admin/parent-communications/${id}/decision`, cookie, body);
  const approve = async (id: string, revision = 1, cookie = admin) => {
    const version = (await prisma.parentCommunication.findUniqueOrThrow({ where: { id } })).version;
    const res = await decide(id, { action: 'APPROVE', revision, version }, cookie);
    expect(res.status).toBe(200);
    return res;
  };
  const teacherThread = async (studentId: string, guardianId: string) => {
    const res = await get(
      `/api/parent-communications/conversations/${studentId}/${guardianId}`,
      enseignante,
    );
    expect(res.status).toBe(200);
    return res.body as { messages: ConversationMessage[] };
  };
  const parentThread = async (teacherId: string, studentId: string) => {
    const res = await get(conversation(teacherId, studentId), parent);
    expect(res.status).toBe(200);
    return res.body as { canSend: boolean; messages: ConversationMessage[] };
  };

  async function parentAccount(guardianId: string, username: string): Promise<string> {
    const res = await send('post', `/api/admin/guardians/${guardianId}/account`, admin, {
      username,
    });
    expect(res.status).toBe(201);
    const passwordHash = await app.get(AuthService).hashPassword(SEED_PASSWORD);
    await prisma.user.update({
      where: { username },
      data: { passwordHash, mustChangePassword: false },
    });
    return loginAs(app, username);
  }

  async function guardian(firstName: string, lastName: string, studentIds: string[]) {
    const res = await send('post', '/api/admin/guardians', admin, {
      firstName,
      lastName,
      relationship: 'Mère',
      studentIds,
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
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

    // Une seconde enseignante, membre du groupe Enseignants.
    const collegue = await prisma.user.create({
      data: {
        username: 'enseignante.math',
        displayName: 'Mme Mathlouthi',
        jobTitle: 'Mathématiques',
        role: 'EMPLOYEE',
        mustChangePassword: false,
        passwordHash: await app.get(AuthService).hashPassword(SEED_PASSWORD),
      },
    });
    collegueId = collegue.id;
    const teachers = await prisma.employeeGroup.findFirstOrThrow({
      where: { systemKey: 'TEACHERS' },
    });
    await prisma.employeeGroupMember.create({ data: { groupId: teachers.id, userId: collegueId } });

    const violet = (
      await prisma.schoolClass.findUniqueOrThrow({ where: { name: '1ère année Violet' } })
    ).id;
    const bleu = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '2e année Bleu' } }))
      .id;
    const student = async (firstName: string, classId: string) =>
      (
        await prisma.student.create({
          data: {
            firstName,
            lastName: 'Famille',
            classId,
            parentPhone: '+21620000001',
            mealService: 'CANTINE',
          },
        })
      ).id;
    lina = await student('Lina', violet);
    adam = await student('Adam', bleu);
    yassine = await student('Yassine', violet);

    for (const [teacherId, classIds] of [
      [enseignanteId, [violet, bleu]],
      [collegueId, [violet]],
    ] as const) {
      const res = await send('put', `/api/admin/teacher-classes/${teacherId}`, admin, {
        classIds,
      });
      expect(res.status).toBe(200);
    }
    // Sonia : deux enfants (Lina en Violet, Adam en Bleu). Karim : une autre famille.
    sonia = await guardian('Sonia', 'Famille', [lina, adam]);
    karim = await guardian('Karim', 'Autre', [yassine]);
    parent = await parentAccount(sonia, 'parent.sonia');
    autreParent = await parentAccount(karim, 'parent.karim');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('le parent voit ses enfants et seulement les enseignants affectés à leur classe', async () => {
    const res = await get('/api/parent/messages/children', parent);
    expect(res.status).toBe(200);
    const children = res.body as Array<{
      id: string;
      class: { name: string };
      teachers: Array<{ id: string; displayName: string; jobTitle: string | null }>;
    }>;
    expect(children.map((c) => c.id).sort()).toEqual([lina, adam].sort());
    const byId = new Map(children.map((c) => [c.id, c]));
    expect(byId.get(lina)!.class.name).toBe('1ère année Violet');
    expect(
      byId
        .get(lina)!
        .teachers.map((t) => t.id)
        .sort(),
    ).toEqual([enseignanteId, collegueId].sort());
    expect(byId.get(adam)!.teachers.map((t) => t.id)).toEqual([enseignanteId]);
    expect(byId.get(lina)!.teachers.find((t) => t.id === collegueId)!.jobTitle).toBe(
      'Mathématiques',
    );
    // Rien sur l'autre famille.
    expect(JSON.stringify(res.body)).not.toContain(yassine);
  });

  it('isolement des familles : enfant d’une autre famille ou enseignant non affecté → refus', async () => {
    expect((await get(conversation(enseignanteId, yassine), parent)).status).toBe(404);
    const other = await send('post', conversation(enseignanteId, yassine), parent, {
      text: 'Bonjour',
    });
    expect(other.status).toBe(422);
    expect(other.body.error.code).toBe('PARENT_COMM_RECIPIENT_INVALID');
    // Mme Mathlouthi n'enseigne pas en 2e année Bleu (Adam).
    const notAssigned = await send('post', conversation(collegueId, adam), parent, {
      text: 'Bonjour',
    });
    expect(notAssigned.status).toBe(422);
    expect((await get(conversation(collegueId, adam), parent)).status).toBe(404);
    // Conversation pas encore commencée avec un enseignant affecté : vide, ouverte à l'écriture.
    const empty = await parentThread(enseignanteId, lina);
    expect(empty).toEqual(expect.objectContaining({ canSend: true, messages: [] }));
  });

  it('le premier message du parent part à la validation : invisible pour l’enseignant, sans contenu dans les notifications', async () => {
    const voice = await uploadVoice(parent);
    const first = await parentSends(
      enseignanteId,
      lina,
      'Bonjour Madame, Lina sera absente vendredi.',
      voice,
    );
    expect(first).toEqual(
      expect.objectContaining({
        author: 'PARENT',
        own: true,
        status: 'PENDING_ADMIN_VALIDATION',
        revision: 1,
      }),
    );
    // Validateurs prévenus (admin et super administrateur), pas l'enseignante.
    const notified = await prisma.notification.findMany({ where: { communicationId: first.id } });
    expect(notified.map((n) => n.type)).toEqual(
      expect.arrayContaining(['PARENT_COMM_TO_VALIDATE']),
    );
    expect(notified.map((n) => n.userId)).not.toContain(enseignanteId);
    expect(notified.map((n) => n.userId)).toEqual(
      expect.arrayContaining([await userId(prisma, 'admin'), await userId(prisma, 'superadmin')]),
    );
    const bell = await get('/api/notifications?limit=100', admin);
    expect(JSON.stringify(bell.body)).not.toContain('absente vendredi');

    // L'enseignante ne voit rien : ni conversation, ni message, ni vocal.
    expect((await get('/api/parent-communications/conversations', enseignante)).body).toEqual([]);
    expect((await teacherThread(lina, sonia)).messages).toEqual([]);
    expect((await get(`/api/parent-communications/${first.id}`, enseignante)).status).toBe(404);
    expect(
      (
        await send('post', `/api/parent-communications/${first.id}/submit`, enseignante, {
          version: 0,
        })
      ).status,
    ).toBe(404);
    expect(
      JSON.stringify((await get('/api/parent-communications', enseignante)).body),
    ).not.toContain(first.id);
    expect((await get(`/api/files/${voice}`, enseignante)).status).toBe(404);
    // Le parent réécoute son propre vocal.
    expect((await get(`/api/files/${voice}`, parent)).status).toBe(200);
  });

  it('deux enfants : deux conversations distinctes avec la même enseignante', async () => {
    await parentSends(enseignanteId, adam, 'Adam a oublié son cahier.');
    const list = await get('/api/parent/messages/conversations', parent);
    expect(list.status).toBe(200);
    const conversations = list.body as Array<{
      key: string;
      teacher: { id: string };
      student: { id: string };
      pending: number;
    }>;
    expect(conversations).toHaveLength(2);
    expect(new Set(conversations.map((c) => c.key)).size).toBe(2);
    expect(conversations.map((c) => c.student.id).sort()).toEqual([lina, adam].sort());
    expect(conversations.every((c) => c.teacher.id === enseignanteId && c.pending === 1)).toBe(
      true,
    );
    expect((await parentThread(enseignanteId, adam)).messages.map((m) => m.text)).toEqual([
      'Adam a oublié son cahier.',
    ]);
    // Côté validation aussi : deux discussions, chacune avec son élève.
    const discussions = (await get('/api/admin/parent-communications/discussions', admin))
      .body as Array<{ student: { id: string }; lastMessage: { author: string } }>;
    const mine = discussions.filter((d) => [lina, adam].includes(d.student.id));
    expect(mine).toHaveLength(2);
    expect(mine.every((d) => d.lastMessage.author === 'PARENT')).toBe(true);
  });

  it('un seul validateur suffit ; deux validations simultanées ne transmettent qu’une fois', async () => {
    const [linaMessage] = (await parentThread(enseignanteId, lina)).messages;
    const row = await prisma.parentCommunication.findUniqueOrThrow({
      where: { id: linaMessage!.id },
    });
    const [a, b] = await Promise.all([
      decide(row.id, { action: 'APPROVE', revision: 1, version: row.version }, admin),
      decide(row.id, { action: 'APPROVE', revision: 1, version: row.version }, superadmin),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(
      await prisma.notification.count({
        where: { communicationId: row.id, type: 'TEACHER_MESSAGE_NEW' },
      }),
    ).toBe(1);
    expect(
      await prisma.parentCommunicationEvent.count({
        where: { communicationId: row.id, type: 'APPROVED' },
      }),
    ).toBe(1);
    // Message de parent : ni livraison externe ni événement n8n.
    expect(await prisma.outboxEvent.count({ where: { aggregateId: row.id } })).toBe(0);
    expect(
      await prisma.notification.count({
        where: {
          communicationId: row.id,
          type: 'PARENT_COMM_APPROVED',
          userId: await userId(prisma, 'parent.sonia'),
        },
      }),
    ).toBe(1);

    // Validé : la conversation s'ouvre pour l'enseignante, avec le message et son vocal.
    const list = (await get('/api/parent-communications/conversations', enseignante))
      .body as Array<{
      student: { id: string };
      guardian: { id: string };
      unread: number;
    }>;
    expect(list).toEqual([
      expect.objectContaining({ student: expect.objectContaining({ id: lina }), unread: 1 }),
    ]);
    const thread = await teacherThread(lina, sonia);
    expect(thread.messages).toEqual([
      expect.objectContaining({
        author: 'PARENT',
        own: false,
        status: 'APPROVED',
        text: 'Bonjour Madame, Lina sera absente vendredi.',
        decisionReason: null,
        version: null,
      }),
    ]);
    expect((await get(`/api/files/${thread.messages[0]!.voiceFileId}`, enseignante)).status).toBe(
      200,
    );
    // Lecture notée une seule fois.
    expect(
      (await get('/api/parent-communications/conversations', enseignante)).body[0].unread,
    ).toBe(0);
    expect(
      await prisma.parentCommunicationEvent.count({
        where: { communicationId: row.id, type: 'READ' },
      }),
    ).toBe(1);
    // Lien de la notification : la conversation du message validé.
    expect(
      (await get(`/api/parent-communications/messages/${row.id}/conversation`, enseignante)).body,
    ).toEqual({ studentId: lina, guardianId: sonia });
    // L'autre message (Adam) reste en attente : la validation ne s'étend jamais à la conversation.
    const adamMessage = (await parentThread(enseignanteId, adam)).messages[0]!;
    expect(adamMessage.status).toBe('PENDING_ADMIN_VALIDATION');
    expect((await teacherThread(adam, sonia)).messages).toEqual([]);
    expect(
      (await get(`/api/parent-communications/messages/${adamMessage.id}/conversation`, enseignante))
        .status,
    ).toBe(404);
  });

  it('premier message de l’enseignante : remarque et vocal obligatoires, même si un message du parent attend sa validation', async () => {
    // Conversation d'Adam : seul un message du parent, encore en attente, invisible pour l'enseignante.
    const draft = await send('post', '/api/parent-communications', enseignante, {
      studentId: adam,
      guardianId: sonia,
      text: 'Bonjour, Adam a bien travaillé.',
    });
    expect(draft.status).toBe(201);
    const submitted = await send(
      'post',
      `/api/parent-communications/${draft.body.id}/submit`,
      enseignante,
      { version: draft.body.version },
    );
    expect(submitted.status).toBe(422);
    expect(submitted.body.error.code).toBe('PARENT_COMM_INCOMPLETE');
    await send('post', `/api/parent-communications/${draft.body.id}/cancel`, enseignante, {
      version: draft.body.version,
    });
  });

  it('la réponse de l’enseignante (vocal facultatif) est validée avant d’être transmise au parent', async () => {
    // Réponse dans une conversation commencée : le vocal devient facultatif.
    const draft = await send('post', '/api/parent-communications', enseignante, {
      studentId: lina,
      guardianId: sonia,
      text: 'Merci, c’est noté.',
    });
    expect(draft.status).toBe(201);
    const submitted = await send(
      'post',
      `/api/parent-communications/${draft.body.id}/submit`,
      enseignante,
      { version: draft.body.version },
    );
    expect(submitted.status).toBe(200);
    // En attente : le parent ne voit que son propre message.
    expect((await parentThread(enseignanteId, lina)).messages.map((m) => m.author)).toEqual([
      'PARENT',
    ]);
    // L'enseignante voit sa réponse et son état.
    expect((await teacherThread(lina, sonia)).messages.map((m) => [m.author, m.status])).toEqual([
      ['PARENT', 'APPROVED'],
      ['TEACHER', 'PENDING_ADMIN_VALIDATION'],
    ]);
    // L'enseignante ne valide pas sa propre réponse (elle n'a pas la permission).
    expect(
      (
        await decide(
          draft.body.id,
          { action: 'APPROVE', revision: 1, version: submitted.body.version },
          enseignante,
        )
      ).status,
    ).toBe(403);
    await approve(draft.body.id, 1, superadmin);
    const thread = await parentThread(enseignanteId, lina);
    expect(thread.messages.map((m) => [m.author, m.text])).toEqual([
      ['PARENT', 'Bonjour Madame, Lina sera absente vendredi.'],
      ['TEACHER', 'Merci, c’est noté.'],
    ]);
    expect(thread.messages[1]!.voiceFileId).toBeNull();
    // « Messages de l'école » ne liste que les messages de l'école, jamais ceux du parent.
    const school = (await get('/api/parent/messages', parent)).body as Array<{ id: string }>;
    expect(school.map((m) => m.id)).toEqual([draft.body.id]);
  });

  it('retour pour correction puis nouvelle version ; un rejet n’est jamais transmis', async () => {
    const message = await parentSends(enseignanteId, lina, 'Pouvez-vous me rappeler ?');
    const row = await prisma.parentCommunication.findUniqueOrThrow({ where: { id: message.id } });
    const returned = await decide(row.id, {
      action: 'RETURN',
      revision: 1,
      version: row.version,
      reason: 'Précisez le motif et un créneau.',
    });
    expect(returned.status).toBe(200);
    const own = (await parentThread(enseignanteId, lina)).messages.find((m) => m.id === row.id)!;
    expect(own).toEqual(
      expect.objectContaining({
        status: 'RETURNED_FOR_CORRECTION',
        decisionReason: 'Précisez le motif et un créneau.',
      }),
    );
    expect(
      await prisma.notification.count({
        where: { communicationId: row.id, type: 'PARENT_COMM_RETURNED' },
      }),
    ).toBe(1);
    expect((await teacherThread(lina, sonia)).messages.map((m) => m.id)).not.toContain(row.id);

    const resubmitted = await send('post', `/api/parent/messages/${row.id}/resubmit`, parent, {
      version: own.version,
      text: 'Pouvez-vous me rappeler mardi après 16 h au sujet de la cantine ?',
    });
    expect(resubmitted.status).toBe(200);
    expect(resubmitted.body).toEqual(
      expect.objectContaining({ status: 'PENDING_ADMIN_VALIDATION', revision: 2 }),
    );
    const fresh = await prisma.parentCommunication.findUniqueOrThrow({ where: { id: row.id } });
    // Une décision sur l'ancienne version est refusée.
    const stale = await decide(row.id, { action: 'APPROVE', revision: 1, version: fresh.version });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('PARENT_COMM_REVISION_CHANGED');
    await approve(row.id, 2);
    const forTeacher = (await teacherThread(lina, sonia)).messages.find((m) => m.id === row.id)!;
    expect(forTeacher.text).toBe(
      'Pouvez-vous me rappeler mardi après 16 h au sujet de la cantine ?',
    );
    expect(JSON.stringify(forTeacher)).not.toContain('Pouvez-vous me rappeler ?"');

    // Rejet : définitif, jamais transmis, motif visible par le parent seulement.
    const rejected = await parentSends(enseignanteId, lina, 'Message hors sujet.');
    const r = await prisma.parentCommunication.findUniqueOrThrow({ where: { id: rejected.id } });
    expect(
      (
        await decide(r.id, {
          action: 'REJECT',
          revision: 1,
          version: r.version,
          reason: 'Hors sujet.',
        })
      ).status,
    ).toBe(200);
    expect((await teacherThread(lina, sonia)).messages.map((m) => m.id)).not.toContain(r.id);
    expect(
      await prisma.notification.count({ where: { communicationId: r.id, userId: enseignanteId } }),
    ).toBe(0);
    const again = await send('post', `/api/parent/messages/${r.id}/resubmit`, parent, {
      version: r.version + 1,
      text: 'Autre chose',
    });
    expect(again.status).toBe(409);
    // Les messages déjà validés gardent leur état.
    expect(
      (await parentThread(enseignanteId, lina)).messages
        .filter((m) => m.author === 'PARENT')
        .map((m) => m.status),
    ).toEqual(['APPROVED', 'APPROVED', 'REJECTED']);
  });

  it('l’administration voit les deux sens dans une seule discussion', async () => {
    const any = (await parentThread(enseignanteId, lina)).messages[0]!;
    const res = await get(`/api/admin/parent-communications/${any.id}/discussion`, admin);
    expect(res.status).toBe(200);
    const authors = (res.body.messages as Array<{ author: string }>).map((m) => m.author);
    expect(authors).toEqual(['PARENT', 'TEACHER', 'PARENT', 'PARENT']);
  });

  it('permissions : chaque espace est réservé à son rôle', async () => {
    // Un parent n'accède ni à la validation ni à l'espace enseignant, et ne téléverse qu'un vocal.
    expect((await get('/api/admin/parent-communications/discussions', parent)).status).toBe(403);
    expect((await get('/api/parent-communications/conversations', parent)).status).toBe(403);
    const photo = await api()
      .post('/api/files')
      .set('Cookie', parent)
      .set('Origin', TEST_ORIGIN)
      .field('kind', 'PHOTO')
      .attach('file', audio);
    expect(photo.status).toBe(403);
    // L'autre famille ne voit rien de cette conversation, même avec les identifiants.
    expect((await get(conversation(enseignanteId, lina), autreParent)).status).toBe(404);
    expect((await get('/api/parent/messages/conversations', autreParent)).body).toEqual([]);
    const someone = (await parentThread(enseignanteId, lina)).messages[0]!;
    expect((await get(`/api/parent/messages/${someone.id}/conversation`, autreParent)).status).toBe(
      404,
    );
    expect((await get(`/api/parent/messages/${someone.id}/conversation`, parent)).body).toEqual({
      teacherId: enseignanteId,
      studentId: lina,
    });
    // Un employé hors du groupe Enseignants et le personnel n'utilisent pas les routes parent.
    expect((await get('/api/parent-communications/conversations', reprographie)).status).toBe(403);
    expect((await get('/api/parent/messages/conversations', enseignante)).status).toBe(403);
    // Une enseignante ne lit pas la conversation d'un élève hors de ses classes.
    expect(
      (await get(`/api/parent-communications/conversations/${yassine}/${sonia}`, enseignante))
        .status,
    ).toBe(404);
  });

  it('photos : un parent ne voit que celles des enseignants de ses enfants', async () => {
    expect((await get('/api/users/avatars', parent)).status).toBe(200);
    const reprographieId = await userId(prisma, 'reprographie');
    await prisma.user.update({
      where: { id: reprographieId },
      data: { avatarType: 'CUSTOM', avatarUrl: `/api/users/${reprographieId}/avatar?v=1` },
    });
    const listed = (await get('/api/users/avatars', parent)).body as Array<{ id: string }>;
    expect(listed.map((a) => a.id)).not.toContain(reprographieId);
    expect((await get(`/api/users/${reprographieId}/avatar`, parent)).status).toBe(404);
    // Le personnel garde la liste complète.
    const staff = (await get('/api/users/avatars', admin)).body as Array<{ id: string }>;
    expect(staff.map((a) => a.id)).toContain(reprographieId);
  });
});
