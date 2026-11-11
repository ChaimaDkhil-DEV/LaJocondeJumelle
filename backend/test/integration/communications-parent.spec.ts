import { setupCommunications, type ConversationView, type Fixture } from '../utils/communications-fixture';

/**
 * 017 — US4 : le parent écrit à l'école. Conversations PARENT seulement, au sujet de ses enfants (FR-016,
 * FR-017) ; jamais d'accès à une conversation interne (FR-020) ni aux vocaux qu'elle contient (FR-024).
 */
describe('Communications — parent (017, US4)', () => {
  let f: Fixture;
  let mine: ConversationView;
  let internalId: string;
  let internalVoice: string;

  beforeAll(async () => {
    f = await setupCommunications();
    internalVoice = await f.uploadVoice(f.cookies.enseignante);
    const internal = await f.send('post', '/api/communications/teacher/conversations', f.cookies.enseignante, {
      studentId: f.ids.lina,
      text: 'Signalement interne au sujet de Lina',
      voiceFileId: internalVoice,
    });
    expect(internal.status).toBe(201);
    internalId = internal.body.id;
  });

  afterAll(() => f.close());

  const start = (cookie: string, body: object) => f.send('post', '/api/parent/messages/conversations', cookie, body);

  it('voit ses enfants, sans leurs enseignants', async () => {
    const res = await f.get('/api/parent/messages/children', f.cookies.sonia);
    expect(res.status).toBe(200);
    const children = res.body as Array<{ id: string; teachers?: unknown }>;
    expect(children.map((c) => c.id).sort()).toEqual([f.ids.lina, f.ids.adam].sort());
    expect(children.every((c) => c.teachers === undefined)).toBe(true);
  });

  it('commence une conversation au sujet de son enfant : reçue directement par l’administration', async () => {
    const voiceFileId = await f.uploadVoice(f.cookies.sonia);
    const res = await start(f.cookies.sonia, { studentId: f.ids.adam, voiceFileId, text: 'Adam sera absent demain.' });
    expect(res.status).toBe(201);
    mine = res.body as ConversationView;
    expect(mine).toMatchObject({ type: 'PARENT', status: 'OPEN', student: { id: f.ids.adam } });
    expect(mine.messages![0]).toMatchObject({ authorKind: 'PARENT', mine: true, status: 'SENT' });
    expect(mine.teacher).toBeUndefined();
    const notified = await f.prisma.notification.findMany({ where: { type: 'COMM_PARENT_NEW', communicationId: mine.messages![0].id } });
    expect(notified.map((n) => n.userId)).toEqual(expect.arrayContaining([f.ids.admin, f.ids.superadmin]));
    const inbox = (await f.get('/api/admin/communications/inbox', f.cookies.admin)).body as ConversationView[];
    expect(inbox.find((c) => c.id === mine.id)).toMatchObject({ type: 'PARENT', guardian: { id: f.ids.sonia } });
  });

  it('refuse un enfant qui n’est pas le sien', async () => {
    const res = await start(f.cookies.sonia, { studentId: f.ids.yassine, text: 'Pas mon enfant' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PARENT_COMM_RECIPIENT_INVALID');
  });

  it('lit la réponse de l’école, signée « L’école », marquée lue à l’ouverture', async () => {
    await f.send('post', `/api/admin/communications/conversations/${mine.id}/messages`, f.cookies.superadmin, { text: 'Bien noté.' }).expect(201);
    const list = (await f.get('/api/parent/messages/conversations', f.cookies.sonia)).body as ConversationView[];
    expect(list.find((c) => c.id === mine.id)?.unread).toBe(1);
    const detail = (await f.get(`/api/parent/messages/conversations/${mine.id}`, f.cookies.sonia)).body as ConversationView;
    const answer = detail.messages!.find((m) => m.authorKind === 'ADMIN')!;
    expect(answer.authorLabel).toBe('L’école');
    expect(answer.readAt).not.toBeNull();
    expect(detail.canPost).toBe(true);
    expect(JSON.stringify(detail)).not.toMatch(/displayName|responsibleAdmin/);
  });

  it('répond par texte ou vocal', async () => {
    const res = await f.send('post', `/api/parent/messages/conversations/${mine.id}/messages`, f.cookies.sonia, { text: 'Merci' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'SENT', mine: true });
  });

  it('ne voit jamais une conversation interne, même au sujet de son enfant et par son identifiant (FR-020)', async () => {
    const list = (await f.get('/api/parent/messages/conversations', f.cookies.sonia)).body as ConversationView[];
    expect(list.map((c) => c.id)).not.toContain(internalId);
    expect((await f.get(`/api/parent/messages/conversations/${internalId}`, f.cookies.sonia)).status).toBe(404);
    expect((await f.send('post', `/api/parent/messages/conversations/${internalId}/messages`, f.cookies.sonia, { text: 'x' })).status).toBe(404);
    expect((await f.get(`/api/files/${internalVoice}`, f.cookies.sonia)).status).toBe(404);
  });

  it('ne voit pas la conversation d’une autre famille (FR-017)', async () => {
    expect((await f.get(`/api/parent/messages/conversations/${mine.id}`, f.cookies.karim)).status).toBe(404);
    const list = (await f.get('/api/parent/messages/conversations', f.cookies.karim)).body as ConversationView[];
    expect(list).toEqual([]);
  });

  it('les routes de l’administration et de l’enseignant lui sont fermées (403)', async () => {
    expect((await f.get('/api/admin/communications/inbox', f.cookies.sonia)).status).toBe(403);
    expect((await f.get('/api/communications/teacher/conversations', f.cookies.sonia)).status).toBe(403);
  });

  it('retrouve la conversation d’un message (anciens liens de notification)', async () => {
    const messageId = mine.messages![0].id;
    const res = await f.get(`/api/parent/messages/by-message/${messageId}`, f.cookies.sonia);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ conversationId: mine.id });
    expect((await f.get(`/api/parent/messages/by-message/${messageId}`, f.cookies.karim)).status).toBe(404);
  });

  it('représentant délié de l’enfant : lecture conservée, écriture refusée (FR-022, FR-023)', async () => {
    await f.prisma.guardianStudent.delete({ where: { guardianId_studentId: { guardianId: f.ids.sonia, studentId: f.ids.adam } } });
    const read = await f.get(`/api/parent/messages/conversations/${mine.id}`, f.cookies.sonia);
    expect(read.status).toBe(200);
    expect((read.body as ConversationView).canPost).toBe(false);
    const write = await f.send('post', `/api/parent/messages/conversations/${mine.id}/messages`, f.cookies.sonia, { text: 'x' });
    expect(write.status).toBe(422);
    await f.prisma.guardianStudent.create({ data: { guardianId: f.ids.sonia, studentId: f.ids.adam } });
  });

  it('compte parent désactivé : plus aucun accès', async () => {
    await f.prisma.user.update({ where: { id: f.ids.karimUser }, data: { active: false } });
    expect((await f.get('/api/parent/messages/conversations', f.cookies.karim)).status).toBe(401);
  });
});
