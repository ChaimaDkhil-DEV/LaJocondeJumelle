import { setupCommunications, type ConversationView, type Fixture } from '../utils/communications-fixture';

/**
 * 017 — US2 : l'administration traite les signalements et répond. Boîte de réception commune, recherche,
 * réponse directe, clôture et réouverture, prise en charge, destinataires, mode d'envoi.
 */
describe('Communications — administration (017, US2)', () => {
  let f: Fixture;
  let report: ConversationView;

  beforeAll(async () => {
    f = await setupCommunications();
    const res = await f.send('post', '/api/communications/teacher/conversations', f.cookies.enseignante, {
      studentId: f.ids.lina,
      text: 'Lina pleure en classe depuis lundi.',
    });
    expect(res.status).toBe(201);
    report = res.body as ConversationView;
  });

  afterAll(() => f.close());

  const conv = (id: string) => `/api/admin/communications/conversations/${id}`;

  it('réservé aux ADMIN et SUPER_ADMIN actifs (403 sinon, avant le corps)', async () => {
    for (const cookie of [f.cookies.enseignante, f.cookies.reprographie, f.cookies.sonia]) {
      expect((await f.get('/api/admin/communications/inbox', cookie)).status).toBe(403);
      expect((await f.send('post', '/api/admin/communications/conversations', cookie, { type: 'INTERNAL' })).status).toBe(403);
    }
  });

  it('boîte de réception : le signalement non lu, avec type, enseignant, élève et classe', async () => {
    const res = await f.get('/api/admin/communications/inbox', f.cookies.admin2);
    expect(res.status).toBe(200);
    const line = (res.body as ConversationView[]).find((c) => c.id === report.id)!;
    expect(line).toMatchObject({
      type: 'INTERNAL',
      status: 'OPEN',
      unread: 1,
      teacher: { id: f.ids.enseignante },
      student: { id: f.ids.lina, class: { id: f.ids.violet } },
    });
  });

  it('ouvrir la conversation la marque lue pour toute l’administration', async () => {
    const res = await f.get(conv(report.id), f.cookies.admin);
    expect(res.status).toBe(200);
    expect((res.body as ConversationView).messages![0]).toMatchObject({ authorKind: 'TEACHER', status: 'SENT' });
    const inbox = (await f.get('/api/admin/communications/inbox', f.cookies.admin2)).body as ConversationView[];
    expect(inbox.map((c) => c.id)).not.toContain(report.id);
    await expect(
      f.prisma.parentCommunicationEvent.count({ where: { type: 'READ', actorId: f.ids.admin } }),
    ).resolves.toBe(1);
  });

  it('répond par vocal, envoyé directement', async () => {
    const voiceFileId = await f.uploadVoice(f.cookies.admin);
    const res = await f.send('post', `${conv(report.id)}/messages`, f.cookies.admin, { voiceFileId });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ authorKind: 'ADMIN', mine: true, status: 'SENT' });
  });

  it('prend en charge, puis libère ; refuse un responsable qui n’est pas administrateur', async () => {
    const take = await f.send('put', `${conv(report.id)}/responsible`, f.cookies.admin, { adminId: f.ids.admin });
    expect(take.status).toBe(200);
    expect((await f.get(conv(report.id), f.cookies.admin2)).body.responsibleAdmin).toMatchObject({ id: f.ids.admin });
    const mine = await f.get('/api/admin/communications/conversations?mine=true', f.cookies.admin);
    expect((mine.body.items as ConversationView[]).map((c) => c.id)).toContain(report.id);
    expect((await f.send('put', `${conv(report.id)}/responsible`, f.cookies.admin, { adminId: f.ids.enseignante })).status).toBe(422);
    expect((await f.send('put', `${conv(report.id)}/responsible`, f.cookies.admin, { adminId: null })).status).toBe(200);
    await expect(
      f.prisma.auditLog.count({ where: { action: 'COMMUNICATION_CONVERSATION_CHANGED', targetId: report.id } }),
    ).resolves.toBe(2);
  });

  it('clôture puis rouvre, avec audit ; une conversation clôturée refuse les messages de tous', async () => {
    expect((await f.send('post', `${conv(report.id)}/close`, f.cookies.admin)).status).toBe(200);
    const closed = (await f.get(conv(report.id), f.cookies.admin)).body as ConversationView;
    expect(closed).toMatchObject({ status: 'CLOSED', canPost: false });
    const res = await f.send('post', `${conv(report.id)}/messages`, f.cookies.admin2, { text: 'Fermée' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARENT_COMM_CLOSED');
    expect((await f.send('post', `${conv(report.id)}/close`, f.cookies.admin)).status).toBe(409);
    expect((await f.send('post', `${conv(report.id)}/reopen`, f.cookies.admin2)).status).toBe(200);
    expect(((await f.get(conv(report.id), f.cookies.admin)).body as ConversationView).status).toBe('OPEN');
  });

  it('recherche : filtres type, statut, élève, classe, enseignant, période ; pagination', async () => {
    const byType = await f.get('/api/admin/communications/conversations?type=INTERNAL', f.cookies.admin);
    expect(byType.status).toBe(200);
    expect((byType.body.items as ConversationView[]).every((c) => c.type === 'INTERNAL')).toBe(true);
    const byClass = await f.get(`/api/admin/communications/conversations?classId=${f.ids.bleu}`, f.cookies.admin);
    expect((byClass.body.items as ConversationView[]).map((c) => c.id)).not.toContain(report.id);
    const byTeacher = await f.get(`/api/admin/communications/conversations?teacherId=${f.ids.enseignante}&studentId=${f.ids.lina}`, f.cookies.admin);
    expect((byTeacher.body.items as ConversationView[]).map((c) => c.id)).toContain(report.id);
    const future = await f.get('/api/admin/communications/conversations?from=2099-01-01', f.cookies.admin);
    expect(future.body.items).toEqual([]);
    expect((await f.get('/api/admin/communications/conversations?limit=51', f.cookies.admin)).status).toBe(400);
    expect((await f.get('/api/admin/communications/conversations?type=AUTRE', f.cookies.admin)).status).toBe(400);
  });

  it('l’administration commence une conversation interne avec l’enseignant de la classe de l’élève', async () => {
    const ok = await f.send('post', '/api/admin/communications/conversations', f.cookies.admin, {
      type: 'INTERNAL',
      studentId: f.ids.adam,
      teacherId: f.ids.enseignante,
      text: 'Pouvez-vous me rappeler ?',
    });
    expect(ok.status).toBe(201);
    expect(await f.prisma.notification.count({ where: { type: 'COMM_ADMIN_REPLY', userId: f.ids.enseignante } })).toBeGreaterThan(0);
    const wrong = await f.send('post', '/api/admin/communications/conversations', f.cookies.admin, {
      type: 'INTERNAL',
      studentId: f.ids.adam,
      teacherId: f.ids.collegue,
      text: 'Pas sa classe',
    });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.code).toBe('PARENT_COMM_RECIPIENT_INVALID');
  });

  it('destinataires d’un élève : enseignants de sa classe, représentants avec l’état de leur compte', async () => {
    const res = await f.get(`/api/admin/communications/recipients?studentId=${f.ids.lina}`, f.cookies.admin);
    expect(res.status).toBe(200);
    expect((res.body.teachers as Array<{ id: string }>).map((t) => t.id).sort()).toEqual([f.ids.collegue, f.ids.enseignante].sort());
    const guardians = res.body.guardians as Array<{ id: string; hasActiveAccount: boolean }>;
    expect(guardians.find((g) => g.id === f.ids.sonia)?.hasActiveAccount).toBe(true);
    expect(guardians.find((g) => g.id === f.ids.nora)?.hasActiveAccount).toBe(false);
  });

  it('mode d’envoi aux parents selon les permissions (D6)', async () => {
    expect((await f.get('/api/admin/communications/send-mode', f.cookies.admin)).body).toEqual({ toParents: 'SUBMIT', canValidate: true });
    expect((await f.get('/api/admin/communications/send-mode', f.cookies.superadmin)).body).toEqual({ toParents: 'DIRECT', canValidate: true });
    await f.setAdminPermissions(['REQUEST_CREATE']);
    expect((await f.get('/api/admin/communications/send-mode', f.cookies.admin)).body).toEqual({ toParents: 'FORBIDDEN', canValidate: false });
    await f.restoreAdminPermissions();
  });

  it('« Contacter le parent » : conversation parent liée à la conversation interne, même élève', async () => {
    const res = await f.send('post', '/api/admin/communications/conversations', f.cookies.superadmin, {
      type: 'PARENT',
      studentId: f.ids.lina,
      guardianId: f.ids.sonia,
      linkedInternalId: report.id,
      text: 'Pouvons-nous parler de Lina ?',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'PARENT', linkedInternalId: report.id });
    // Rien de la conversation interne n'est copié.
    const messages = (res.body as ConversationView).messages!;
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe('Pouvons-nous parler de Lina ?');
    await expect(
      f.prisma.auditLog.count({ where: { action: 'COMMUNICATION_CONVERSATION_CHANGED', targetId: res.body.id } }),
    ).resolves.toBe(1);
    const otherStudent = await f.send('post', '/api/admin/communications/conversations', f.cookies.superadmin, {
      type: 'PARENT',
      studentId: f.ids.adam,
      guardianId: f.ids.sonia,
      linkedInternalId: report.id,
      text: 'x',
    });
    expect(otherStudent.status).toBe(422);
  });

  it('identifiant inconnu ou mal formé : 404', async () => {
    expect((await f.get(conv('00000000-0000-4000-8000-000000000000'), f.cookies.admin)).status).toBe(404);
    expect((await f.get(conv('pas-un-uuid'), f.cookies.admin)).status).toBe(404);
  });
});
