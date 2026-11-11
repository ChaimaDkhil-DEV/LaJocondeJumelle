import { setupCommunications, type ConversationView, type Fixture } from '../utils/communications-fixture';

/**
 * 017 — US1 : l'enseignant signale à l'administration (conversations INTERNAL). Envoi direct, texte et/ou
 * vocal, au sujet d'un élève de ses classes seulement (FR-015) ; jamais de conversation parent (FR-019).
 */
describe('Communications — enseignant (017, US1)', () => {
  let f: Fixture;
  let created: ConversationView;

  beforeAll(async () => {
    f = await setupCommunications();
  });

  afterAll(() => f.close());

  const start = (cookie: string, body: object) => f.send('post', '/api/communications/teacher/conversations', cookie, body);

  it('liste les élèves de ses classes, sans représentants', async () => {
    const res = await f.get('/api/communications/teacher/students', f.cookies.enseignante);
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string; class: { name: string }; guardians?: unknown }>).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining([f.ids.lina, f.ids.adam, f.ids.yassine]));
    expect((res.body as Array<{ guardians?: unknown }>).every((s) => s.guardians === undefined)).toBe(true);
    const collegue = await f.get('/api/communications/teacher/students', f.cookies.collegue);
    expect((collegue.body as Array<{ id: string }>).map((s) => s.id)).not.toContain(f.ids.adam);
  });

  it('un employé qui n’est pas enseignant n’a pas accès (403)', async () => {
    expect((await f.get('/api/communications/teacher/conversations', f.cookies.reprographie)).status).toBe(403);
    expect((await f.get('/api/communications/teacher/conversations', f.cookies.sonia)).status).toBe(403);
  });

  it('envoie un vocal seul : conversation interne ouverte, message envoyé directement, administration prévenue', async () => {
    const voiceFileId = await f.uploadVoice(f.cookies.enseignante);
    const res = await start(f.cookies.enseignante, { studentId: f.ids.lina, voiceFileId });
    expect(res.status).toBe(201);
    created = res.body as ConversationView;
    expect(created).toMatchObject({ type: 'INTERNAL', status: 'OPEN', student: { id: f.ids.lina } });
    expect(created.messages).toHaveLength(1);
    expect(created.messages![0]).toMatchObject({ authorKind: 'TEACHER', mine: true, status: 'SENT', text: null });
    expect(created.messages![0].voice?.fileId).toBe(voiceFileId);
    const notified = await f.prisma.notification.findMany({
      where: { type: 'COMM_INTERNAL_NEW', communicationId: created.messages![0].id },
      select: { userId: true },
    });
    expect(notified.map((n) => n.userId)).toEqual(expect.arrayContaining([f.ids.admin, f.ids.admin2, f.ids.superadmin]));
    expect(notified.map((n) => n.userId)).not.toContain(f.ids.enseignante);
  });

  it('accepte un texte seul ; refuse un message vide ou trop long', async () => {
    expect((await start(f.cookies.enseignante, { studentId: f.ids.adam, text: 'Adam a oublié son cahier.' })).status).toBe(201);
    const empty = await start(f.cookies.enseignante, { studentId: f.ids.adam, text: '   ' });
    expect(empty.status).toBe(422);
    expect(empty.body.error.code).toBe('PARENT_COMM_INCOMPLETE');
    expect((await start(f.cookies.enseignante, { studentId: f.ids.adam, text: 'x'.repeat(2001) })).status).toBe(400);
  });

  it('refuse un élève hors de ses classes, et journalise la tentative', async () => {
    const res = await start(f.cookies.collegue, { studentId: f.ids.adam, text: 'Hors classe' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PARENT_COMM_RECIPIENT_INVALID');
    await expect(
      f.prisma.conversation.count({ where: { teacherId: f.ids.collegue, studentId: f.ids.adam } }),
    ).resolves.toBe(0);
  });

  it('refuse le vocal d’un autre utilisateur', async () => {
    const other = await f.uploadVoice(f.cookies.collegue);
    const res = await start(f.cookies.enseignante, { studentId: f.ids.lina, voiceFileId: other });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PARENT_COMM_VOICE_INVALID');
  });

  it('liste ses conversations ; ne voit pas celles d’une collègue', async () => {
    const mine = await f.get('/api/communications/teacher/conversations', f.cookies.enseignante);
    expect(mine.status).toBe(200);
    expect((mine.body as ConversationView[]).map((c) => c.id)).toContain(created.id);
    const other = await f.get('/api/communications/teacher/conversations', f.cookies.collegue);
    expect((other.body as ConversationView[]).map((c) => c.id)).not.toContain(created.id);
    // L'identifiant ne suffit pas (FR-025) : introuvable pour la collègue, tentative journalisée.
    expect((await f.get(`/api/communications/teacher/conversations/${created.id}`, f.cookies.collegue)).status).toBe(404);
    await expect(
      f.prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId: f.ids.collegue, details: { path: ['reason'], equals: 'COMMUNICATION_OUT_OF_SCOPE' } } }),
    ).resolves.toBeGreaterThan(0);
  });

  it('reçoit la réponse de l’administration signée « Administration (Prénom Nom) », non lue jusqu’à l’ouverture', async () => {
    const reply = await f.send('post', `/api/admin/communications/conversations/${created.id}/messages`, f.cookies.admin, {
      text: 'Merci, je m’en occupe.',
    });
    expect(reply.status).toBe(201);
    await expect(
      f.prisma.notification.count({ where: { type: 'COMM_ADMIN_REPLY', userId: f.ids.enseignante } }),
    ).resolves.toBe(1);
    const list = (await f.get('/api/communications/teacher/conversations', f.cookies.enseignante)).body as ConversationView[];
    expect(list.find((c) => c.id === created.id)?.unread).toBe(1);

    const detail = await f.get(`/api/communications/teacher/conversations/${created.id}`, f.cookies.enseignante);
    expect(detail.status).toBe(200);
    const answer = (detail.body as ConversationView).messages!.find((m) => m.authorKind === 'ADMIN')!;
    const adminName = (await f.prisma.user.findUniqueOrThrow({ where: { id: f.ids.admin } })).displayName;
    expect(answer.authorLabel).toBe(`Administration (${adminName})`);
    expect(answer.mine).toBe(false);
    expect(answer.readAt).not.toBeNull();
    expect((detail.body as ConversationView).canPost).toBe(true);
    const again = (await f.get('/api/communications/teacher/conversations', f.cookies.enseignante)).body as ConversationView[];
    expect(again.find((c) => c.id === created.id)?.unread).toBe(0);
  });

  it('répond dans la conversation ; plus après le retrait de la classe, mais garde la lecture (FR-022, FR-023)', async () => {
    const path = `/api/communications/teacher/conversations/${created.id}/messages`;
    expect((await f.send('post', path, f.cookies.enseignante, { text: 'Merci !' })).status).toBe(201);

    await f.send('put', `/api/admin/teacher-classes/${f.ids.enseignante}`, f.cookies.admin, { classIds: [f.ids.bleu] }).expect(200);
    const refused = await f.send('post', path, f.cookies.enseignante, { text: 'Encore un mot' });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('PARENT_COMM_RECIPIENT_INVALID');
    const read = await f.get(`/api/communications/teacher/conversations/${created.id}`, f.cookies.enseignante);
    expect(read.status).toBe(200);
    expect((read.body as ConversationView).canPost).toBe(false);
    await f.send('put', `/api/admin/teacher-classes/${f.ids.enseignante}`, f.cookies.admin, { classIds: [f.ids.violet, f.ids.bleu] }).expect(200);
  });

  it('une conversation clôturée refuse ses messages', async () => {
    await f.send('post', `/api/admin/communications/conversations/${created.id}/close`, f.cookies.admin).expect(200);
    const res = await f.send('post', `/api/communications/teacher/conversations/${created.id}/messages`, f.cookies.enseignante, { text: 'Fermée ?' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_COMM_CLOSED');
    await f.send('post', `/api/admin/communications/conversations/${created.id}/reopen`, f.cookies.admin).expect(200);
  });

  it('ne voit jamais une conversation parent, même par son identifiant (FR-019)', async () => {
    const family = await f.send('post', '/api/admin/communications/conversations', f.cookies.superadmin, {
      type: 'PARENT',
      studentId: f.ids.lina,
      guardianId: f.ids.sonia,
      text: 'Bonjour Madame',
    });
    expect(family.status).toBe(201);
    const id = (family.body as ConversationView).id;
    expect((await f.get(`/api/communications/teacher/conversations/${id}`, f.cookies.enseignante)).status).toBe(404);
    expect((await f.send('post', `/api/communications/teacher/conversations/${id}/messages`, f.cookies.enseignante, { text: 'x' })).status).toBe(404);
    const list = (await f.get('/api/communications/teacher/conversations', f.cookies.enseignante)).body as ConversationView[];
    expect(list.map((c) => c.id)).not.toContain(id);
  });
});
