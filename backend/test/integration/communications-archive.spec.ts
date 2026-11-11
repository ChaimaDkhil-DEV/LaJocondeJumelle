import type { ParentCommunicationStatus } from '@prisma/client';
import { setupCommunications, type ConversationView, type Fixture } from '../utils/communications-fixture';

/**
 * 017 — US5 : les échanges 015 deviennent des archives en lecture seule (D3, D4). L'administration voit
 * tout ; l'enseignant ses messages et les messages approuvés du parent ; le parent les messages approuvés
 * de l'enseignant et les siens ; personne n'écrit ni ne décide plus.
 */
describe('Communications — archives 015 (017, US5)', () => {
  let f: Fixture;
  let archiveId: string;
  const msg: Record<string, string> = {};

  beforeAll(async () => {
    f = await setupCommunications();
    // Archive comme la migration 0026 la crée : insertion directe, déclencheur suspendu le temps du seed.
    await f.prisma.$executeRawUnsafe(`ALTER TABLE "Conversation" DISABLE TRIGGER "Conversation_guard"`);
    try {
      archiveId = (
        await f.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `INSERT INTO "Conversation" ("id", "type", "studentId", "teacherId", "guardianId", "status", "closedAt", "updatedAt")
           VALUES (gen_random_uuid(), 'LEGACY_TEACHER_PARENT', $1::uuid, $2::uuid, $3::uuid, 'CLOSED', now(), now())
           RETURNING "id"::text`,
          f.ids.lina,
          f.ids.enseignante,
          f.ids.sonia,
        )
      )[0].id;
    } finally {
      await f.prisma.$executeRawUnsafe(`ALTER TABLE "Conversation" ENABLE TRIGGER "Conversation_guard"`);
    }
    await f.prisma.$executeRawUnsafe(`ALTER TABLE "ParentCommunication" DISABLE TRIGGER "ParentCommunication_conversation_guard"`);
    try {
      const rows: Array<[string, 'TEACHER' | 'PARENT', ParentCommunicationStatus, number, number | null]> = [
        ['teacherApproved', 'TEACHER', 'APPROVED', 1, 1],
        ['teacherPending', 'TEACHER', 'PENDING_ADMIN_VALIDATION', 1, null],
        ['teacherDraft', 'TEACHER', 'DRAFT', 0, null],
        ['parentApproved', 'PARENT', 'APPROVED', 1, 1],
        ['parentPending', 'PARENT', 'PENDING_ADMIN_VALIDATION', 1, null],
      ];
      for (const [key, author, status, current, approved] of rows) {
        const row = await f.prisma.parentCommunication.create({
          data: {
            conversationId: archiveId,
            author,
            authorId: author === 'TEACHER' ? f.ids.enseignante : f.ids.soniaUser,
            teacherId: f.ids.enseignante,
            studentId: f.ids.lina,
            guardianId: f.ids.sonia,
            status,
            draftText: `brouillon ${key}`,
            currentRevision: current,
            approvedRevision: approved,
            ...(current > 0 ? { revisions: { create: { number: 1, text: `texte ${key}` } } } : {}),
          },
        });
        msg[key] = row.id;
      }
    } finally {
      await f.prisma.$executeRawUnsafe(`ALTER TABLE "ParentCommunication" ENABLE TRIGGER "ParentCommunication_conversation_guard"`);
    }
  });

  afterAll(() => f.close());

  const ids = (c: ConversationView) => c.messages!.map((m) => m.id).sort();

  it('l’administration voit tous les messages, quel que soit leur état (D4)', async () => {
    const res = await f.get(`/api/admin/communications/conversations/${archiveId}`, f.cookies.admin);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ type: 'LEGACY_TEACHER_PARENT', status: 'CLOSED', canPost: false });
    expect(ids(res.body)).toEqual(Object.values(msg).sort());
  });

  it('l’enseignant : ses messages et les messages approuvés du parent', async () => {
    const res = await f.get(`/api/communications/teacher/conversations/${archiveId}`, f.cookies.enseignante);
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual([msg.teacherApproved, msg.teacherPending, msg.teacherDraft, msg.parentApproved].sort());
    const list = (await f.get('/api/communications/teacher/conversations', f.cookies.enseignante)).body as ConversationView[];
    expect(list.find((c) => c.id === archiveId)?.type).toBe('LEGACY_TEACHER_PARENT');
  });

  it('le parent : les messages approuvés de l’enseignant et les siens, jamais un message non validé de l’enseignant', async () => {
    const res = await f.get(`/api/parent/messages/conversations/${archiveId}`, f.cookies.sonia);
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual([msg.teacherApproved, msg.parentApproved, msg.parentPending].sort());
    const teacherMessage = (res.body as ConversationView).messages!.find((m) => m.id === msg.teacherApproved)!;
    expect(teacherMessage.text).toBe('texte teacherApproved');
  });

  it('les autres n’y ont pas accès', async () => {
    expect((await f.get(`/api/communications/teacher/conversations/${archiveId}`, f.cookies.collegue)).status).toBe(404);
    expect((await f.get(`/api/parent/messages/conversations/${archiveId}`, f.cookies.karim)).status).toBe(404);
  });

  it('personne n’écrit dans une archive, et elle ne se rouvre pas', async () => {
    for (const [path, cookie] of [
      [`/api/admin/communications/conversations/${archiveId}/messages`, f.cookies.superadmin],
      [`/api/communications/teacher/conversations/${archiveId}/messages`, f.cookies.enseignante],
      [`/api/parent/messages/conversations/${archiveId}/messages`, f.cookies.sonia],
    ] as const) {
      const res = await f.send('post', path, cookie, { text: 'Encore ?' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PARENT_COMM_ARCHIVED');
    }
    const reopen = await f.send('post', `/api/admin/communications/conversations/${archiveId}/reopen`, f.cookies.superadmin);
    expect(reopen.status).toBe(409);
    expect(reopen.body.error.code).toBe('PARENT_COMM_ARCHIVED');
  });

  it('un ancien message en attente ne peut plus être validé (D4)', async () => {
    const version = (await f.prisma.parentCommunication.findUniqueOrThrow({ where: { id: msg.teacherPending } })).version;
    const res = await f.send('post', `/api/admin/communications/messages/${msg.teacherPending}/decision`, f.cookies.superadmin, {
      action: 'APPROVE',
      revision: 1,
      version,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_COMM_ARCHIVED');
    const list = (await f.get('/api/admin/communications/to-validate', f.cookies.superadmin)).body as Array<{ id: string }>;
    expect(list.map((m) => m.id)).not.toContain(msg.teacherPending);
  });
});
