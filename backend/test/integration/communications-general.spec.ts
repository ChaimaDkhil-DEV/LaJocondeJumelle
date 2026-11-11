import { OrphanFilesJob } from '../../src/scheduler/orphan-files.job';
import { setupCommunications, type Fixture } from '../utils/communications-fixture';

/**
 * 017 — règles transverses reprises de 015 : la cloche ne porte jamais le contenu d'un message, un compte
 * parent n'accède qu'à « Messages de l'école », le nettoyage des fichiers garde les vocaux de communication,
 * un parent ne voit que les photos des enseignants de ses enfants.
 */
describe('Communications — règles transverses (017)', () => {
  let f: Fixture;
  let conversationId: string;
  let voiceFileId: string;

  beforeAll(async () => {
    f = await setupCommunications();
    voiceFileId = await f.uploadVoice(f.cookies.superadmin);
    const res = await f.send('post', '/api/admin/communications/conversations', f.cookies.superadmin, {
      type: 'PARENT',
      studentId: f.ids.lina,
      guardianId: f.ids.sonia,
      text: 'Contenu confidentiel de la cloche',
      voiceFileId,
    });
    expect(res.status).toBe(201);
    conversationId = res.body.id;
  });

  afterAll(() => f.close());

  it('cloche : l’élève et la conversation, jamais le texte ni une demande', async () => {
    const bell = await f.get('/api/notifications?limit=100', f.cookies.sonia);
    expect(bell.status).toBe(200);
    const item = (
      bell.body.items as Array<{ type: string; request: unknown; communication: { conversationId: string; studentName: string } | null }>
    ).find((n) => n.type === 'PARENT_MESSAGE_NEW');
    expect(item).toMatchObject({ request: null, communication: { conversationId, studentName: 'Lina Famille' } });
    expect(JSON.stringify(bell.body)).not.toContain('Contenu confidentiel');
  });

  it('un compte parent n’accède à aucune autre partie de l’application', async () => {
    for (const path of [
      '/api/requests',
      '/api/communications/teacher/conversations',
      '/api/admin/communications/inbox',
      '/api/coverage',
      '/api/admin/guardians',
    ]) {
      expect((await f.get(path, f.cookies.sonia)).status).toBe(403);
    }
    expect((await f.get('/api/parent/messages/conversations', f.cookies.enseignante)).status).toBe(403);
  });

  it('le nettoyage des fichiers provisoires ne supprime jamais un vocal de communication', async () => {
    await f.app.get(OrphanFilesJob).runOnce(new Date(Date.now() + 7 * 86_400_000));
    expect(await f.prisma.file.count({ where: { id: voiceFileId } })).toBe(1);
  });

  it('photos : un parent ne voit que celles des enseignants de ses enfants', async () => {
    const reprographieId = (await f.prisma.user.findUniqueOrThrow({ where: { username: 'reprographie' } })).id;
    await f.prisma.user.update({
      where: { id: reprographieId },
      data: { avatarType: 'CUSTOM', avatarUrl: `/api/users/${reprographieId}/avatar?v=1` },
    });
    const listed = (await f.get('/api/users/avatars', f.cookies.sonia)).body as Array<{ id: string }>;
    expect(listed.map((a) => a.id)).not.toContain(reprographieId);
    expect((await f.get(`/api/users/${reprographieId}/avatar`, f.cookies.sonia)).status).toBe(404);
    const staff = (await f.get('/api/users/avatars', f.cookies.admin)).body as Array<{ id: string }>;
    expect(staff.map((a) => a.id)).toContain(reprographieId);
  });
});
