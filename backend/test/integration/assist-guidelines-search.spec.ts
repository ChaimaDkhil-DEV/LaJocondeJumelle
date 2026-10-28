import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { GuidelinesService } from '../../src/assist/guidelines.service';
import { CATEGORIES, categoryId, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/** 009, FR-016, FR-017, SC-006 (T015) : recherche plein texte filtrée par les droits. */
describe('Recherche des consignes', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let service: GuidelinesService;
  let photocopiesId: string;
  let travauxId: string;

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp();
    service = app.get(GuidelinesService);
    photocopiesId = await categoryId(prisma, CATEGORIES.photocopies);
    travauxId = await categoryId(prisma, CATEGORIES.petitsTravaux);
    const author = await userId(prisma, 'superadmin');
    const make = (title: string, body: string, categoryId: string | null, active = true) =>
      prisma.guideline.create({ data: { title, body, categoryId, active, updatedById: author } });
    await make('Pannes de reprographie', 'Photocopieuse en panne, bourrage papier, toner vide. Priorité : Haute', photocopiesId);
    await make('Réservée aux travaux', 'Fuite d’eau ou photocopieuse bloquant une porte.', travauxId);
    await make('Ancienne consigne', 'Photocopieuse en panne : appeler le prestataire.', photocopiesId, false);
    await make('Sécurité', 'Tout danger immédiat près d’une photocopieuse : priorité urgente.', null);
    for (let i = 0; i < 6; i++) await make(`Consigne générale ${i}`, `Photocopieuse numéro ${i}`, null);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('retrouve les consignes pertinentes, la plus proche d’abord, 5 au plus, avec un extrait', async () => {
    const found = await service.search('La photocopieuse est en panne, bourrage de papier', [photocopiesId]);
    expect(found.length).toBeLessThanOrEqual(5);
    expect(found[0]).toMatchObject({ title: 'Pannes de reprographie', categoryId: photocopiesId });
    expect(found[0].excerpt.length).toBeLessThanOrEqual(200);
    expect(found[0].body).toContain('Priorité : Haute');
  });

  it('ignore les consignes inactives et celles des catégories non autorisées ; garde les générales', async () => {
    const titles = (await service.search('photocopieuse panne porte fuite', [photocopiesId])).map((g) => g.title);
    expect(titles).not.toContain('Ancienne consigne');
    expect(titles).not.toContain('Réservée aux travaux');
    expect(titles.some((t) => t === 'Sécurité' || t.startsWith('Consigne générale'))).toBe(true);
    const none = (await service.search('photocopieuse panne', [])).map((g) => g.title);
    expect(none).not.toContain('Pannes de reprographie');
  });

  it('retrouve les formes fléchies françaises (pluriels, accents)', async () => {
    const titles = (await service.search('Les photocopieuses sont bloquées', [photocopiesId])).map((g) => g.title);
    expect(titles).toContain('Pannes de reprographie');
  });

  it('ne renvoie rien sans mot commun, ou pour un texte vide', async () => {
    expect(await service.search('cantine menu végétarien', [photocopiesId])).toEqual([]);
    expect(await service.search('   ', [photocopiesId])).toEqual([]);
    expect(await service.search('le la les de', [photocopiesId])).toEqual([]);
  });

  it.each(["l'imprimante | & ! : \\ ( ) <-> *", "'; DROP TABLE \"Guideline\"; --", 'panne:* & !toner'])(
    'n’échoue pas sur un texte contenant des caractères spéciaux (%s)',
    async (text) => {
      await expect(service.search(text, [photocopiesId])).resolves.toEqual(expect.any(Array));
      expect(await prisma.guideline.count()).toBe(10);
    },
  );
});
