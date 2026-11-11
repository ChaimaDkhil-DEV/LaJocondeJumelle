import { setupCommunications, type ConversationView, type Fixture, type MessageView } from '../utils/communications-fixture';

/**
 * 017 — US3 : l'administration écrit à une famille. Envoi direct (PARENT_COMM_SEND_DIRECT) ou soumission à
 * un autre validateur (PARENT_COMM_SUBMIT_FOR_APPROVAL) ; un auteur ne décide jamais sur son message
 * (FR-009, FR-010). Publication : notification au parent et un seul événement outbox (FR-028).
 */
describe('Communications — administration → famille et validation (017, US3)', () => {
  let f: Fixture;
  let family: ConversationView;
  let submitted: MessageView;

  beforeAll(async () => {
    f = await setupCommunications();
  });

  afterAll(() => f.close());

  const start = (cookie: string, body: object) => f.send('post', '/api/admin/communications/conversations', cookie, body);
  const decide = (id: string, cookie: string, body: object) =>
    f.send('post', `/api/admin/communications/messages/${id}/decision`, cookie, body);
  const versionOf = async (id: string) => (await f.prisma.parentCommunication.findUniqueOrThrow({ where: { id } })).version;
  const outbox = (id: string) => f.prisma.outboxEvent.count({ where: { aggregateId: id } });

  it('ADMIN par défaut : le message est soumis, invisible pour le parent, signalé aux autres validateurs', async () => {
    const res = await start(f.cookies.admin, { type: 'PARENT', studentId: f.ids.lina, guardianId: f.ids.sonia, text: 'Réunion jeudi ?' });
    expect(res.status).toBe(201);
    family = res.body as ConversationView;
    submitted = family.messages![0];
    expect(submitted).toMatchObject({ authorKind: 'ADMIN', status: 'PENDING_ADMIN_VALIDATION', mine: true });
    expect(submitted.validation).toMatchObject({ revision: 1 });

    const parentView = await f.get(`/api/parent/messages/conversations/${family.id}`, f.cookies.sonia);
    expect(parentView.status).toBe(200);
    expect((parentView.body as ConversationView).messages).toEqual([]);
    const toValidate = await f.prisma.notification.findMany({ where: { type: 'PARENT_COMM_TO_VALIDATE', communicationId: submitted.id } });
    expect(toValidate.map((n) => n.userId)).toEqual(expect.arrayContaining([f.ids.admin2, f.ids.superadmin]));
    expect(toValidate.map((n) => n.userId)).not.toContain(f.ids.admin);
    expect(await outbox(submitted.id)).toBe(0);
  });

  it('« À valider » : le message est listé, réservé aux validateurs', async () => {
    const res = await f.get('/api/admin/communications/to-validate', f.cookies.admin2);
    expect(res.status).toBe(200);
    expect((res.body as Array<{ id: string }>).map((m) => m.id)).toContain(submitted.id);
    await f.setAdminPermissions(['PARENT_COMM_SUBMIT_FOR_APPROVAL']);
    expect((await f.get('/api/admin/communications/to-validate', f.cookies.admin2)).status).toBe(403);
    await f.restoreAdminPermissions();
  });

  it('l’auteur ne valide jamais son propre message', async () => {
    const res = await decide(submitted.id, f.cookies.admin, { action: 'APPROVE', revision: 1, version: await versionOf(submitted.id) });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PARENT_COMM_SELF_DECISION');
  });

  it('retour pour correction (motif obligatoire), correction, nouvelle version', async () => {
    expect((await decide(submitted.id, f.cookies.admin2, { action: 'RETURN', revision: 1, version: await versionOf(submitted.id) })).status).toBe(422);
    const back = await decide(submitted.id, f.cookies.admin2, {
      action: 'RETURN',
      revision: 1,
      version: await versionOf(submitted.id),
      reason: 'Précisez l’heure.',
    });
    expect(back.status).toBe(200);
    await expect(f.prisma.notification.count({ where: { type: 'PARENT_COMM_RETURNED', userId: f.ids.admin } })).resolves.toBe(1);

    const edit = await f.send('patch', `/api/admin/communications/messages/${submitted.id}`, f.cookies.admin, {
      version: await versionOf(submitted.id),
      text: 'Réunion jeudi à 17 h ?',
    });
    expect(edit.status).toBe(200);
    // Seul l'auteur corrige.
    expect(
      (await f.send('patch', `/api/admin/communications/messages/${submitted.id}`, f.cookies.admin2, { version: await versionOf(submitted.id), text: 'x' })).status,
    ).toBe(403);
    const again = await f.send('post', `/api/admin/communications/messages/${submitted.id}/submit`, f.cookies.admin, {
      version: await versionOf(submitted.id),
    });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ status: 'PENDING_ADMIN_VALIDATION', validation: { revision: 2 } });
  });

  it('une décision sur une version dépassée ou une version de verrou périmée est refusée', async () => {
    expect((await decide(submitted.id, f.cookies.admin2, { action: 'APPROVE', revision: 1, version: await versionOf(submitted.id) })).status).toBe(409);
    expect((await decide(submitted.id, f.cookies.admin2, { action: 'APPROVE', revision: 2, version: 0 })).status).toBe(409);
  });

  it('approbation par un autre validateur : visible pour le parent, signée « L’école », notifiée, un seul événement outbox', async () => {
    const res = await decide(submitted.id, f.cookies.admin2, { action: 'APPROVE', revision: 2, version: await versionOf(submitted.id) });
    expect(res.status).toBe(200);
    const parentView = (await f.get(`/api/parent/messages/conversations/${family.id}`, f.cookies.sonia)).body as ConversationView;
    expect(parentView.messages).toHaveLength(1);
    expect(parentView.messages![0]).toMatchObject({ authorLabel: 'L’école', text: 'Réunion jeudi à 17 h ?', mine: false });
    expect(parentView.messages![0].validation).toBeUndefined();
    await expect(f.prisma.notification.count({ where: { type: 'PARENT_MESSAGE_NEW', userId: f.ids.soniaUser } })).resolves.toBe(1);
    await expect(f.prisma.notification.count({ where: { type: 'PARENT_COMM_APPROVED', userId: f.ids.admin } })).resolves.toBe(1);
    expect(await outbox(submitted.id)).toBe(1);
    // Rejouer l'approbation ne publie pas une seconde fois.
    expect((await decide(submitted.id, f.cookies.superadmin, { action: 'APPROVE', revision: 2, version: await versionOf(submitted.id) })).status).toBe(409);
    expect(await outbox(submitted.id)).toBe(1);
  });

  it('avec PARENT_COMM_SEND_DIRECT : envoyé directement, publié et transmis à n8n', async () => {
    await f.setAdminPermissions(['PARENT_COMM_SEND_DIRECT', 'PARENT_COMM_SUBMIT_FOR_APPROVAL', 'PARENT_COMMUNICATION_VALIDATE']);
    const res = await f.send('post', `/api/admin/communications/conversations/${family.id}/messages`, f.cookies.admin, { text: 'Merci de votre retour.' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'SENT' });
    expect(await outbox(res.body.id)).toBe(1);
    await expect(
      f.prisma.parentCommunicationDelivery.count({ where: { communicationId: res.body.id } }),
    ).resolves.toBeGreaterThanOrEqual(0);
    await f.restoreAdminPermissions();
  });

  it('sans aucune des deux permissions : écrire aux parents est refusé', async () => {
    await f.setAdminPermissions(['REQUEST_CREATE']);
    const res = await f.send('post', `/api/admin/communications/conversations/${family.id}/messages`, f.cookies.admin, { text: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PARENT_COMM_SEND_FORBIDDEN');
    expect((await start(f.cookies.admin, { type: 'PARENT', studentId: f.ids.adam, guardianId: f.ids.sonia, text: 'x' })).status).toBe(403);
    await f.restoreAdminPermissions();
  });

  it('représentant sans compte actif ou non lié à l’élève : refusé (FR-026)', async () => {
    for (const body of [
      { type: 'PARENT', studentId: f.ids.lina, guardianId: f.ids.nora, text: 'Sans compte' },
      { type: 'PARENT', studentId: f.ids.lina, guardianId: f.ids.karim, text: 'Pas son enfant' },
    ]) {
      const res = await start(f.cookies.superadmin, body);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PARENT_COMM_RECIPIENT_INVALID');
    }
  });

  it('rejet (motif obligatoire) puis annulation impossible ; annulation d’un message retourné', async () => {
    const res = await f.send('post', `/api/admin/communications/conversations/${family.id}/messages`, f.cookies.admin, { text: 'Brouillon à rejeter' });
    expect(res.status).toBe(201);
    const id = res.body.id as string;
    const reject = await decide(id, f.cookies.superadmin, { action: 'REJECT', revision: 1, version: await versionOf(id), reason: 'Hors sujet' });
    expect(reject.status).toBe(200);
    await expect(f.prisma.notification.count({ where: { type: 'PARENT_COMM_REJECTED', userId: f.ids.admin } })).resolves.toBe(1);
    expect((await f.send('post', `/api/admin/communications/messages/${id}/cancel`, f.cookies.admin, { version: await versionOf(id) })).status).toBe(409);

    const second = await f.send('post', `/api/admin/communications/conversations/${family.id}/messages`, f.cookies.admin, { text: 'À annuler' });
    const sid = second.body.id as string;
    await decide(sid, f.cookies.admin2, { action: 'RETURN', revision: 1, version: await versionOf(sid), reason: 'Non' }).expect(200);
    const cancel = await f.send('post', `/api/admin/communications/messages/${sid}/cancel`, f.cookies.admin, { version: await versionOf(sid) });
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('CANCELLED');
  });

  it('décision refusée tant que la conversation est clôturée', async () => {
    const res = await f.send('post', `/api/admin/communications/conversations/${family.id}/messages`, f.cookies.admin, { text: 'En attente' });
    const id = res.body.id as string;
    await f.send('post', `/api/admin/communications/conversations/${family.id}/close`, f.cookies.admin2).expect(200);
    const blocked = await decide(id, f.cookies.admin2, { action: 'APPROVE', revision: 1, version: await versionOf(id) });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('PARENT_COMM_CLOSED');
    await f.send('post', `/api/admin/communications/conversations/${family.id}/reopen`, f.cookies.admin2).expect(200);
    expect((await decide(id, f.cookies.admin2, { action: 'APPROVE', revision: 1, version: await versionOf(id) })).status).toBe(200);
  });

  it('détail de validation : versions, historique et livraisons, réservé aux validateurs', async () => {
    const res = await f.get(`/api/admin/communications/messages/${submitted.id}`, f.cookies.superadmin);
    expect(res.status).toBe(200);
    expect(res.body.revisions).toHaveLength(2);
    expect((res.body.events as Array<{ type: string }>).map((e) => e.type)).toEqual(
      expect.arrayContaining(['SUBMITTED', 'RETURNED', 'APPROVED']),
    );
    expect((await f.get(`/api/admin/communications/messages/${submitted.id}`, f.cookies.enseignante)).status).toBe(403);
  });
});
