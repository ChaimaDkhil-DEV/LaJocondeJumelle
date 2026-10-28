import type { INestApplication } from '@nestjs/common';
import { PrismaClient, type Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { SimilarRequestsService } from '../../src/assist/similar-requests.service';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** 010, US1 (T005) : demandes similaires, jamais au-delà de ce que l'utilisateur voit déjà. */
describe('SimilarRequestsService', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let similar: SimilarRequestsService;
  let photocopies: string;
  let reprographieId: string;
  const ids: Record<string, string> = {};

  const policyUser = async (username: string) => {
    const u = await prisma.user.findUniqueOrThrow({ where: { username } });
    return { id: u.id, role: u.role as Role, active: u.active };
  };

  async function create(cookie: string, title: string, extra: Record<string, unknown> = {}): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/requests')
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .send({ clientId: randomUUID(), title, description: 'Rien ne s’imprime.', categoryId: photocopies, recipientId: reprographieId, priority: 'HIGH', ...extra });
    if (res.status !== 201) throw new Error(`${title} : ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id;
  }

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    similar = app.get(SimilarRequestsService);
    photocopies = await categoryId(prisma, CATEGORIES.photocopies);
    reprographieId = await userId(prisma, 'reprographie');
    const enseignante = await loginAs(app, 'enseignante');
    const autre = await loginAs(app, 'autre');

    ids.mine = await create(enseignante, 'Photocopieuse du premier étage en panne');
    ids.mineOther = await create(enseignante, 'Chauffage de la salle 12 trop faible');
    ids.draft = await create(enseignante, 'Photocopieuse du rez-de-chaussée en panne', { asDraft: true });
    ids.colleague = await create(autre, 'Photocopieuse du deuxième étage en panne');
    ids.coverage = await create(enseignante, 'Photocopieuse en panne, surveillance de la salle');
    // Une garde de classe ne doit jamais remonter, même proche et visible par ailleurs.
    await prisma.request.update({ where: { id: ids.coverage }, data: { kind: 'COVERAGE' } });
    ids.extra1 = await create(autre, 'Photocopieuse de la salle des professeurs en panne');
    ids.extra2 = await create(autre, 'Photocopieuse bloquée, bourrage papier en panne');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('ne renvoie que des demandes visibles : ni celles d’un collègue, ni un brouillon, ni une garde', async () => {
    const found = await similar.find(await policyUser('enseignante'), 'La photocopieuse est en panne');
    expect(found.map((r) => r.id)).toEqual([ids.mine]);
    expect(found[0]).toEqual({
      id: ids.mine,
      reference: expect.stringMatching(/^D-\d{4}-\d{6}$/),
      title: 'Photocopieuse du premier étage en panne',
      categoryName: 'Photocopies',
      priority: 'HIGH',
      status: expect.any(String),
    });
    // Aucun champ au-delà du contrat (ni description, ni personnes).
    expect(Object.keys(found[0]!).sort()).toEqual(['categoryName', 'id', 'priority', 'reference', 'status', 'title']);
  });

  it('au plus 3 demandes, pour un compte qui en voit davantage (employé affecté)', async () => {
    const found = await similar.find(await policyUser('reprographie'), 'photocopieuse en panne');
    expect(found).toHaveLength(3);
    expect(found.map((r) => r.id)).not.toContain(ids.draft);
    expect(found.map((r) => r.id)).not.toContain(ids.coverage);
  });

  it('admin de la catégorie : voit les demandes des collègues de sa catégorie', async () => {
    const found = await similar.find(await policyUser('admin'), 'photocopieuse du deuxième étage en panne');
    expect(found.map((r) => r.id)).toContain(ids.colleague);
  });

  it('aucun mot commun : aucune demande ; caractères spéciaux : aucune erreur', async () => {
    const me = await policyUser('enseignante');
    expect(await similar.find(me, 'Zèbre girafe hippopotame')).toEqual([]);
    expect(await similar.find(me, '')).toEqual([]);
    await expect(similar.find(me, "photocopieuse ' | & ! : \\ ( ) <-> * panne")).resolves.toEqual(expect.any(Array));
  });

  it('un compte désactivé ne voit rien', async () => {
    const me = await policyUser('enseignante');
    expect(await similar.find({ ...me, active: false }, 'photocopieuse en panne')).toEqual([]);
  });
});
