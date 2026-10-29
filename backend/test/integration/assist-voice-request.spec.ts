import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import request from 'supertest';
import { TRANSCRIPTION_PROVIDER } from '../../src/assist/providers/assist-providers';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * Création vocale assistée : le vocal reste la pièce centrale. Propositions de catégorie, de
 * destinataire (règles d'affectation seulement), de priorité et de titre ; le vocal original est
 * conservé, transmis et lisible par le destinataire, même quand l'analyse échoue.
 */
const ASSIST_ENV = { ASSIST_SUGGESTION_PROVIDER: 'demo', ASSIST_TRANSCRIPTION_PROVIDER: 'demo', ASSIST_RATE_LIMIT: '1000' } as const;
const audio = join(__dirname, '..', 'fixtures', 'audio', 'sample.webm');
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const [key, value] of Object.entries(ASSIST_ENV)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }
});

afterAll(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('Création vocale assistée', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let enseignante: string;
  let photocopies: string;
  let circuitB: string;
  let peer: string;
  const id: Record<string, string> = {};
  // Transcription simulée : texte choisi par le test, ou panne du fournisseur.
  let heard: string | Error = 'Bonjour. La photocopieuse du premier étage est en panne depuis ce matin.';
  const transcriptions = {
    name: 'test',
    transcribe: async () => {
      if (heard instanceof Error) throw heard;
      return heard;
    },
  };

  const api = () => request(app.getHttpServer());
  const transcribe = (cookie = enseignante) => api().post('/api/assist/transcriptions').set('Cookie', cookie).set('Origin', TEST_ORIGIN).attach('file', audio);
  const suggest = (body: { text: string; categoryId?: string }, cookie = enseignante) =>
    api().post('/api/assist/suggestions').set('Cookie', cookie).set('Origin', TEST_ORIGIN).send(body);
  const uploadVoice = (cookie = enseignante) =>
    api().post('/api/files').set('Cookie', cookie).set('Origin', TEST_ORIGIN).field('kind', 'VOICE').attach('file', audio);
  const create = (body: Record<string, unknown>, cookie = enseignante) =>
    api().post('/api/requests').set('Cookie', cookie).set('Origin', TEST_ORIGIN).send({ clientId: randomUUID(), ...body });

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp([], [{ provide: TRANSCRIPTION_PROVIDER, useValue: transcriptions }]);
    enseignante = await loginAs(app, 'enseignante');
    for (const who of ['enseignante', 'reprographie', 'autre', 'surveillant', 'nouveau', 'superadmin']) id[who] = await userId(prisma, who);
    photocopies = await categoryId(prisma, CATEGORIES.photocopies);
    circuitB = await categoryId(prisma, CATEGORIES.circuitB);
    await prisma.guideline.create({
      data: {
        title: 'Pannes de reprographie',
        body: 'Une photocopieuse en panne bloque les cours. Priorité : Haute.',
        categoryId: photocopies,
        updatedById: id.superadmin,
      },
    });

    // Catégorie entre enseignants : plusieurs destinataires possibles, le demandeur exclu.
    const superadmin = await loginAs(app, 'superadmin');
    const created = await api()
      .post('/api/admin/categories')
      .set('Cookie', superadmin)
      .set('Origin', TEST_ORIGIN)
      .send({ name: 'Entre collègues', routingMode: 'PEER', creatorRoles: ['EMPLOYEE'], closureMode: 'REQUESTER' });
    expect(created.status).toBe(201);
    peer = created.body.id;
    const members = await api()
      .put(`/api/admin/categories/${peer}/recipients`)
      .set('Cookie', superadmin)
      .set('Origin', TEST_ORIGIN)
      .send({ userIds: [id.enseignante, id.autre, id.surveillant, id.nouveau] });
    expect(members.status).toBe(200);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    heard = 'Bonjour. La photocopieuse du premier étage est en panne depuis ce matin.';
  });

  it('transcription puis propositions : catégorie, destinataire autorisé, priorité et titre sans formule de politesse', async () => {
    const transcript = await transcribe();
    expect(transcript.status).toBe(200);
    const res = await suggest({ text: transcript.body.text });
    expect(res.status).toBe(200);
    expect(res.body.suggestion).toMatchObject({
      title: 'La photocopieuse du premier étage est en panne depuis ce matin',
      categoryId: photocopies,
      priority: 'HIGH',
      recipientId: id.reprographie,
      recipientName: 'Reprographie',
      recipientReason: 'Seul destinataire prévu pour cette catégorie.',
    });
  });

  it('catégorie choisie par l’utilisateur : elle seule est retenue ; circuit B : aucun destinataire proposé', async () => {
    const res = await suggest({ text: 'La photocopieuse du premier étage est en panne depuis ce matin.', categoryId: circuitB });
    expect(res.status).toBe(200);
    expect(res.body.suggestion.categoryId).toBe(circuitB);
    expect(res.body.suggestion).not.toHaveProperty('recipientId');
  });

  it('catégorie choisie inconnue ou non autorisée : ignorée, jamais proposée', async () => {
    const res = await suggest({ text: 'La photocopieuse du premier étage est en panne.', categoryId: randomUUID() });
    expect(res.status).toBe(200);
    expect(res.body.suggestion.categoryId).toBe(photocopies);
    expect((await suggest({ text: 'Photocopieuse en panne.', categoryId: 'pas-un-uuid' })).status).toBe(400);
  });

  it('entre enseignants : destinataire cité et autorisé seulement, jamais soi-même ni un non-destinataire', async () => {
    const cited = await suggest({ text: 'Peux-tu transmettre les copies à Autre employé pour demain matin ?', categoryId: peer });
    expect(cited.body.suggestion).toMatchObject({ categoryId: peer, recipientId: id.autre, recipientName: 'Autre employé' });

    const self = await suggest({ text: 'Rappel pour Enseignante : les copies du contrôle.', categoryId: peer });
    expect(self.body.suggestion).not.toHaveProperty('recipientId');

    const outsider = await suggest({ text: 'Demande à transmettre à Reprographie pour les copies.', categoryId: peer });
    expect(outsider.body.suggestion).not.toHaveProperty('recipientId');

    // Destinataire désactivé : plus proposable.
    await prisma.user.update({ where: { id: id.autre }, data: { active: false } });
    try {
      const inactive = await suggest({ text: 'Peux-tu transmettre les copies à Autre employé ?', categoryId: peer });
      expect(inactive.body.suggestion).not.toHaveProperty('recipientId');
    } finally {
      await prisma.user.update({ where: { id: id.autre }, data: { active: true } });
    }
  });

  it('le vocal original est envoyé avec la demande et lisible par le destinataire ; les propositions sont tracées', async () => {
    const voice = await uploadVoice();
    expect(voice.status).toBe(201);
    const transcript = await transcribe();
    const { body } = await suggest({ text: transcript.body.text });
    const { suggestion, token } = body;

    // L'utilisateur garde la catégorie et le destinataire proposés, mais choisit une autre priorité.
    const sent = await create({
      title: suggestion.title,
      categoryId: suggestion.categoryId,
      recipientId: suggestion.recipientId,
      priority: 'URGENT',
      voiceFileId: voice.body.id,
      assistToken: token,
    });
    expect(sent.status).toBe(201);
    expect(sent.body.voice).toMatchObject({ fileId: voice.body.id });
    expect(sent.body.assignee).toMatchObject({ id: id.reprographie });

    const reprographie = await loginAs(app, 'reprographie');
    const played = await api().get(`/api/files/${voice.body.id}`).set('Cookie', reprographie);
    expect(played.status).toBe(200);
    expect(played.headers['content-type']).toBe('audio/mp4');
    // Un tiers sans lien avec la demande ne peut pas l'écouter.
    const autre = await loginAs(app, 'autre');
    expect((await api().get(`/api/files/${voice.body.id}`).set('Cookie', autre)).status).toBe(404);

    const event = await prisma.requestEvent.findFirstOrThrow({ where: { requestId: sent.body.id, type: 'ASSIST_SUGGESTED' } });
    expect(event.fromValue).toMatchObject({ categoryId: photocopies, priority: 'HIGH', recipientId: id.reprographie });
    expect(event.toValue).toMatchObject({ categoryId: photocopies, priority: 'URGENT', recipientId: id.reprographie });
  });

  it('un destinataire non autorisé est refusé à l’envoi, même avec un jeton de propositions', async () => {
    const voice = await uploadVoice();
    const { body } = await suggest({ text: 'La photocopieuse du premier étage est en panne.' });
    const sent = await create({
      title: 'Photocopieuse en panne',
      categoryId: photocopies,
      recipientId: id.autre,
      priority: 'HIGH',
      voiceFileId: voice.body.id,
      assistToken: body.token,
    });
    expect(sent.status).toBe(422);
    expect(sent.body.error.code).toBe('RECIPIENT_NOT_ALLOWED');
  });

  it('transcription en panne : erreur explicite, le vocal reste envoyable et lisible par le destinataire', async () => {
    heard = new Error('serveur de transcription injoignable');
    const failed = await transcribe();
    expect(failed.status).toBe(503);
    expect(failed.body.error.code).toBe('ASSIST_UNAVAILABLE');

    // Saisie manuelle des champs, sans jeton : le parcours habituel reste possible.
    const voice = await uploadVoice();
    expect(voice.status).toBe(201);
    const sent = await create({ title: 'Panne photocopieuse', categoryId: photocopies, priority: 'NORMAL', voiceFileId: voice.body.id });
    expect(sent.status).toBe(201);
    expect(sent.body.voice).toMatchObject({ fileId: voice.body.id });
    const reprographie = await loginAs(app, 'reprographie');
    expect((await api().get(`/api/files/${voice.body.id}`).set('Cookie', reprographie)).status).toBe(200);
  });
});
