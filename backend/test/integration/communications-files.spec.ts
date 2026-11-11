import { setupCommunications, type Fixture } from '../utils/communications-fixture';

/**
 * 017 — FR-013, FR-024 : un vocal n'est servi qu'aux lecteurs du message qui le porte ; un vocal ne sert
 * qu'à un seul message, de son auteur.
 */
describe('Communications — vocaux (017)', () => {
  let f: Fixture;
  let teacherVoice: string;
  let adminVoice: string;
  let pendingId: string;

  beforeAll(async () => {
    f = await setupCommunications();
    teacherVoice = await f.uploadVoice(f.cookies.enseignante);
    await f
      .send('post', '/api/communications/teacher/conversations', f.cookies.enseignante, { studentId: f.ids.lina, voiceFileId: teacherVoice })
      .expect(201);
    adminVoice = await f.uploadVoice(f.cookies.admin);
    const family = await f.send('post', '/api/admin/communications/conversations', f.cookies.admin, {
      type: 'PARENT',
      studentId: f.ids.lina,
      guardianId: f.ids.sonia,
      voiceFileId: adminVoice,
    });
    expect(family.status).toBe(201);
    pendingId = family.body.messages[0].id;
  });

  afterAll(() => f.close());

  const status = async (id: string, cookie: string) => (await f.get(`/api/files/${id}`, cookie)).status;

  it('vocal d’un signalement : l’auteur et l’administration, personne d’autre', async () => {
    expect(await status(teacherVoice, f.cookies.enseignante)).toBe(200);
    expect(await status(teacherVoice, f.cookies.admin2)).toBe(200);
    expect(await status(teacherVoice, f.cookies.collegue)).toBe(404);
    expect(await status(teacherVoice, f.cookies.sonia)).toBe(404);
    expect(await status(teacherVoice, f.cookies.reprographie)).toBe(404);
  });

  it('vocal d’un message aux parents en attente : jamais servi au parent avant approbation', async () => {
    expect(await status(adminVoice, f.cookies.sonia)).toBe(404);
    expect(await status(adminVoice, f.cookies.enseignante)).toBe(404);
    const version = (await f.prisma.parentCommunication.findUniqueOrThrow({ where: { id: pendingId } })).version;
    await f
      .send('post', `/api/admin/communications/messages/${pendingId}/decision`, f.cookies.admin2, { action: 'APPROVE', revision: 1, version })
      .expect(200);
    expect(await status(adminVoice, f.cookies.sonia)).toBe(200);
    expect(await status(adminVoice, f.cookies.karim)).toBe(404);
    expect(await status(adminVoice, f.cookies.enseignante)).toBe(404);
  });

  it('un vocal déjà rattaché ne sert pas une seconde fois', async () => {
    const res = await f.send('post', '/api/communications/teacher/conversations', f.cookies.enseignante, {
      studentId: f.ids.adam,
      voiceFileId: teacherVoice,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PARENT_COMM_VOICE_INVALID');
  });
});
