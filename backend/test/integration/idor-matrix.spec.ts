import { randomUUID } from 'node:crypto';
import { createECDH, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import request from 'supertest';
import { categoryId, CATEGORIES, loginAs, userId } from '../utils/auth-helpers';
import { setupCommunications, type Fixture } from '../utils/communications-fixture';
import { createSecondAdmin } from '../utils/second-admin';
import { TEST_ORIGIN } from '../utils/test-app';

/**
 * Audit de sécurité du 2026-11-18, tests manquants G.2 : accès direct à la ressource d'un autre (IDOR).
 *
 * Pour chaque ressource, créée par son propriétaire, chaque lecture et chaque écriture par identifiant est rejouée :
 *  - le propriétaire lit (200) ;
 *  - un tiers du même rôle obtient 404 (le serveur ne révèle pas l'existence, principe V), le refus est journalisé
 *    (ACCESS_DENIED) et la ressource n'a pas changé ;
 *  - un compte parent obtient 403 ou 404 ;
 *  - un identifiant inconnu donne 404 et un identifiant mal formé 400 ou 404, jamais 500.
 * Les écritures reçoivent un corps valide : un refus ne doit pas se cacher derrière une erreur de validation.
 */

const FIXTURES = join(__dirname, '..', 'fixtures');
const UNKNOWN = '00000000-0000-4000-8000-000000000000';
const MALFORMED = 'pas-un-identifiant';

type Verb = 'get' | 'post' | 'patch' | 'delete';
interface Call {
  verb: Verb;
  path: string;
  body?: object;
}
interface Case {
  resource: string;
  /** Lectures par identifiant (le propriétaire obtient 200). */
  reads: (id: string) => Call[];
  /** Écritures par identifiant, corps valide. */
  writes: (id: string) => Call[];
  owner: () => string;
  /** Tiers du même rôle, sans lien avec la ressource. */
  outsiders: () => Array<[string, string]>;
  /** Compte d'un autre rôle (parent, ou personnel pour une ressource de parent) : 403 ou 404. */
  otherRole: () => [string, string];
  /** Crée la ressource et renvoie son identifiant. */
  create: () => Promise<string>;
  /** Empreinte de l'état, comparée avant et après les tentatives des tiers. */
  snapshot: (id: string) => Promise<unknown>;
}

describe('IDOR : ressource d’un autre utilisateur (audit G.2)', () => {
  let f: Fixture;
  const extra: Record<'admin2' | 'admin3', string> = { admin2: '', admin3: '' };
  let photocopies: string;
  let circuitB: string;
  let reprographieId: string;

  const api = () => request(f.app.getHttpServer());
  function call(cookie: string, { verb, path, body }: Call): request.Test {
    const req = api()[verb](path).set('Cookie', cookie).set('Origin', TEST_ORIGIN);
    return body ? req.send(body) : req;
  }
  const version = async (id: string) => (await f.prisma.request.findUniqueOrThrow({ where: { id } })).version;
  const denials = (actorId: string) => f.prisma.auditLog.count({ where: { action: 'ACCESS_DENIED', actorId } });
  const actorOf = async (username: string) => userId(f.prisma, username);

  async function createRequest(cookie: string, body: object): Promise<{ id: string; version: number }> {
    const res = await call(cookie, {
      verb: 'post',
      path: '/api/requests',
      body: { clientId: randomUUID(), priority: 'NORMAL', title: 'Photocopies', description: '30 copies', ...body },
    });
    if (res.status !== 201) throw new Error(`demande ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }

  async function upload(cookie: string, kind: string, file: string): Promise<string> {
    const res = await api().post('/api/files').set('Cookie', cookie).set('Origin', TEST_ORIGIN).field('kind', kind).attach('file', file);
    if (res.status !== 201) throw new Error(`fichier ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id;
  }

  /** Demande soumise de l'enseignante (Photocopies, destinataire Reprographie). */
  let submitted: string;
  /** Proposition de transfert du cas « proposition de transfert ». */
  let transferId: string;

  beforeAll(async () => {
    f = await setupCommunications();
    // Admins gestionnaires des mêmes catégories que « admin » (transferts, 018).
    await createSecondAdmin(f.prisma, 'idor.admin2', 'Admin deux');
    await createSecondAdmin(f.prisma, 'idor.admin3', 'Admin trois');
    extra.admin2 = await loginAs(f.app, 'idor.admin2');
    extra.admin3 = await loginAs(f.app, 'idor.admin3');
    photocopies = await categoryId(f.prisma, CATEGORIES.photocopies);
    circuitB = await categoryId(f.prisma, CATEGORIES.circuitB);
    reprographieId = await userId(f.prisma, 'reprographie');
    submitted = (await createRequest(f.cookies.enseignante, { categoryId: photocopies, recipientId: reprographieId })).id;
  });

  afterAll(async () => {
    await f.close();
  });

  const CASES: Case[] = [
    {
      resource: 'demande soumise',
      owner: () => f.cookies.enseignante,
      outsiders: () => [['collegue (enseignante, sans lien)', f.cookies.collegue]],
      otherRole: () => ['parent', f.cookies.karim],
      create: async () => submitted,
      reads: (id) => [
        { verb: 'get', path: `/api/requests/${id}` },
        { verb: 'get', path: `/api/requests/${id}/history` },
        { verb: 'get', path: `/api/requests/${id}/messages` },
      ],
      writes: (id) => [
        { verb: 'patch', path: `/api/requests/${id}/priority`, body: { priority: 'URGENT', version: 0 } },
        { verb: 'post', path: `/api/requests/${id}/actions`, body: { action: 'CANCEL', version: 0, reason: 'Intrus' } },
        { verb: 'post', path: `/api/requests/${id}/messages`, body: { clientId: randomUUID(), text: 'Intrus' } },
      ],
      snapshot: async (id) => {
        const row = await f.prisma.request.findUniqueOrThrow({ where: { id }, include: { _count: { select: { messages: true } } } });
        return { status: row.status, priority: row.priority, version: row.version, messages: row._count.messages };
      },
    },
    {
      resource: 'brouillon',
      owner: () => f.cookies.enseignante,
      outsiders: () => [
        ['collegue (enseignante, sans lien)', f.cookies.collegue],
        ['reprographie (destinataire du brouillon)', f.cookies.reprographie],
      ],
      otherRole: () => ['parent', f.cookies.karim],
      create: async () => (await createRequest(f.cookies.enseignante, { categoryId: photocopies, recipientId: reprographieId, asDraft: true })).id,
      reads: (id) => [{ verb: 'get', path: `/api/requests/${id}` }],
      writes: (id) => [
        { verb: 'patch', path: `/api/requests/${id}`, body: { title: 'Intrus' } },
        { verb: 'post', path: `/api/requests/${id}/actions`, body: { action: 'SUBMIT', version: 0 } },
        { verb: 'delete', path: `/api/requests/${id}` },
      ],
      snapshot: async (id) => {
        const row = await f.prisma.request.findUnique({ where: { id } });
        return row && { status: row.status, title: row.title, version: row.version };
      },
    },
    {
      resource: 'conversation enseignant',
      owner: () => f.cookies.enseignante,
      // Mme Mathlouthi enseigne aussi en Violet, la classe de Lina : elle ne lit pas la conversation de sa collègue.
      outsiders: () => [['collegue (enseignante de la même classe)', f.cookies.collegue]],
      otherRole: () => ['parent de l’élève', f.cookies.sonia],
      create: async () => {
        const res = await call(f.cookies.enseignante, {
          verb: 'post',
          path: '/api/communications/teacher/conversations',
          body: { studentId: f.ids.lina, text: 'Lina a oublié son cahier.' },
        });
        if (res.status !== 201) throw new Error(`conversation ${res.status}`);
        return res.body.id;
      },
      reads: (id) => [{ verb: 'get', path: `/api/communications/teacher/conversations/${id}` }],
      writes: (id) => [{ verb: 'post', path: `/api/communications/teacher/conversations/${id}/messages`, body: { text: 'Intrus' } }],
      snapshot: (id) => f.prisma.parentCommunication.count({ where: { conversationId: id } }),
    },
    {
      resource: 'conversation parent',
      owner: () => f.cookies.sonia,
      outsiders: () => [['karim (autre parent de la même classe)', f.cookies.karim]],
      otherRole: () => ['enseignante de l’élève', f.cookies.enseignante],
      create: async () => {
        const res = await call(f.cookies.sonia, {
          verb: 'post',
          path: '/api/parent/messages/conversations',
          body: { studentId: f.ids.lina, text: 'Lina sera absente demain.' },
        });
        if (res.status !== 201) throw new Error(`conversation parent ${res.status} ${JSON.stringify(res.body)}`);
        return res.body.id;
      },
      reads: (id) => [{ verb: 'get', path: `/api/parent/messages/conversations/${id}` }],
      writes: (id) => [{ verb: 'post', path: `/api/parent/messages/conversations/${id}/messages`, body: { text: 'Intrus' } }],
      snapshot: (id) => f.prisma.parentCommunication.count({ where: { conversationId: id } }),
    },
    {
      resource: 'proposition de transfert',
      // Déléguée par « admin » à « idor.admin2 ». « admin.deux » ne gère pas la catégorie : tiers sans lien. Un admin
      // de la catégorie lit la proposition sans pouvoir y répondre (test dédié plus bas).
      owner: () => f.cookies.admin,
      outsiders: () => [['admin.deux (admin hors de la catégorie)', f.cookies.admin2]],
      otherRole: () => ['enseignante (demandeuse)', f.cookies.enseignante],
      create: async () => {
        const { id, version: v } = await createRequest(f.cookies.enseignante, { categoryId: circuitB, title: 'Vidéoprojecteur' });
        const claimed = await call(f.cookies.admin, { verb: 'post', path: `/api/admin/requests/${id}/claim`, body: { version: v } });
        if (claimed.status !== 200) throw new Error(`prise en charge ${claimed.status}`);
        const res = await call(f.cookies.admin, {
          verb: 'post',
          path: `/api/admin/requests/${id}/transfers`,
          body: { type: 'DELEGATION_REQUEST', recipientId: await actorOf('idor.admin2'), reason: 'Urgence en cours.' },
        });
        if (res.status !== 201) throw new Error(`transfert ${res.status} ${JSON.stringify(res.body)}`);
        transferId = res.body.id;
        return res.body.id;
      },
      reads: (id) => [{ verb: 'get', path: `/api/admin/transfers/${id}` }],
      writes: (id) => [
        { verb: 'post', path: `/api/admin/transfers/${id}/accept`, body: {} },
        { verb: 'post', path: `/api/admin/transfers/${id}/reject`, body: { responseReason: 'Intrus' } },
        { verb: 'post', path: `/api/admin/transfers/${id}/cancel`, body: {} },
      ],
      snapshot: async (id) => {
        const row = await f.prisma.requestTransfer.findUniqueOrThrow({ where: { id }, include: { request: true } });
        return { status: row.status, owner: row.request.adminOwnerId };
      },
    },
  ];

  describe.each(CASES.map((c) => [c.resource, c] as const))('%s', (_name, c) => {
    let id: string;

    beforeAll(async () => {
      id = await c.create();
    });

    it('le propriétaire lit la ressource (200)', async () => {
      const failures: string[] = [];
      for (const read of c.reads(id)) {
        const res = await call(c.owner(), read);
        if (res.status !== 200) failures.push(`${read.verb.toUpperCase()} ${read.path} → ${res.status}`);
      }
      expect(failures).toEqual([]);
    });

    it('un tiers du même rôle : 404 partout, refus journalisé, ressource inchangée', async () => {
      const before = await c.snapshot(id);
      const failures: string[] = [];
      for (const [who, cookie] of c.outsiders()) {
        const me = (await call(cookie, { verb: 'get', path: '/api/auth/me' })).body.id as string;
        for (const attempt of [...c.reads(id), ...c.writes(id)]) {
          const logged = await denials(me);
          const res = await call(cookie, await withVersion(attempt, id));
          const label = `${who} ${attempt.verb.toUpperCase()} ${attempt.path}`;
          if (res.status !== 404) failures.push(`${label} → ${res.status}`);
          else if ((await denials(me)) === logged) failures.push(`${label} → 404 sans ACCESS_DENIED`);
        }
      }
      expect(failures).toEqual([]);
      expect(await c.snapshot(id)).toEqual(before);
    });

    it('un compte d’un autre rôle : 403 ou 404, ressource inchangée', async () => {
      const before = await c.snapshot(id);
      const [who, cookie] = c.otherRole();
      const failures: string[] = [];
      for (const attempt of [...c.reads(id), ...c.writes(id)]) {
        const res = await call(cookie, await withVersion(attempt, id));
        if (res.status !== 403 && res.status !== 404) failures.push(`${who} ${attempt.verb.toUpperCase()} ${attempt.path} → ${res.status}`);
      }
      expect(failures).toEqual([]);
      expect(await c.snapshot(id)).toEqual(before);
    });

    it('identifiant inconnu : 404 ; identifiant mal formé : 400 ou 404, jamais 500', async () => {
      const failures: string[] = [];
      for (const [bad, expected] of [
        [UNKNOWN, [404]],
        [MALFORMED, [400, 404]],
      ] as const) {
        for (const attempt of [...c.reads(bad), ...c.writes(bad)]) {
          const res = await call(c.owner(), attempt);
          if (!(expected as readonly number[]).includes(res.status)) failures.push(`${attempt.verb.toUpperCase()} ${attempt.path} → ${res.status}`);
        }
      }
      expect(failures).toEqual([]);
    });
  });

  /** Version courante de la demande dans le corps (verrouillage optimiste) : le refus ne doit pas venir d'un 409. */
  async function withVersion(attempt: Call, id: string): Promise<Call> {
    if (!attempt.body || !('version' in attempt.body) || !attempt.path.startsWith('/api/requests/')) return attempt;
    return { ...attempt, body: { ...attempt.body, version: await version(id) } };
  }

  it('transfert : un admin de la catégorie lit la proposition (018) mais n’y répond pas (403 journalisé)', async () => {
    const before = await f.prisma.requestTransfer.findUniqueOrThrow({ where: { id: transferId } });
    expect((await call(extra.admin3, { verb: 'get', path: `/api/admin/transfers/${transferId}` })).status).toBe(200);
    const admin3 = await actorOf('idor.admin3');
    for (const action of ['accept', 'reject', 'cancel']) {
      const logged = await denials(admin3);
      const res = await call(extra.admin3, { verb: 'post', path: `/api/admin/transfers/${transferId}/${action}`, body: {} });
      expect([403, 404]).toContain(res.status);
      expect(await denials(admin3)).toBe(logged + 1);
    }
    expect((await f.prisma.requestTransfer.findUniqueOrThrow({ where: { id: transferId } })).status).toBe(before.status);
  });

  describe('fichiers', () => {
    let attachment: string;
    let voice: string;

    beforeAll(async () => {
      attachment = await upload(f.cookies.enseignante, 'DOCUMENT', join(FIXTURES, 'docs', 'sample.pdf'));
      const posted = await call(f.cookies.enseignante, {
        verb: 'post',
        path: `/api/requests/${submitted}/messages`,
        body: { clientId: randomUUID(), text: 'Les consignes', attachmentFileIds: [attachment] },
      });
      if (posted.status !== 201) throw new Error(`pièce jointe ${posted.status}`);
      voice = await upload(f.cookies.enseignante, 'VOICE', join(FIXTURES, 'audio', 'sample.webm'));
    });

    const download = (cookie: string, id: string) => call(cookie, { verb: 'get', path: `/api/files/${id}` });

    it('pièce jointe d’une demande : lue par ses participants, 404 journalisé pour un tiers ou un parent', async () => {
      expect((await download(f.cookies.enseignante, attachment)).status).toBe(200);
      expect((await download(f.cookies.reprographie, attachment)).status).toBe(200);
      const collegue = await actorOf('enseignante.math');
      const logged = await denials(collegue);
      expect((await download(f.cookies.collegue, attachment)).status).toBe(404);
      expect(await denials(collegue)).toBe(logged + 1);
      expect((await download(f.cookies.karim, attachment)).status).toBe(404);
    });

    it('vocal pas encore envoyé : lu par son auteur seul', async () => {
      expect((await download(f.cookies.enseignante, voice)).status).toBe(200);
      for (const cookie of [f.cookies.collegue, f.cookies.reprographie, f.cookies.admin, f.cookies.sonia]) {
        expect((await download(cookie, voice)).status).toBe(404);
      }
    });

    it('identifiant inconnu ou mal formé : 404, jamais 500', async () => {
      expect((await download(f.cookies.enseignante, UNKNOWN)).status).toBe(404);
      expect([400, 404]).toContain((await download(f.cookies.enseignante, MALFORMED)).status);
    });
  });

  describe('notifications', () => {
    it('marquer lue la notification d’un autre est sans effet ; elle n’apparaît jamais dans sa liste', async () => {
      const notification = await f.prisma.notification.findFirstOrThrow({ where: { userId: reprographieId, requestId: submitted } });
      expect(notification.readAt).toBeNull();
      const res = await call(f.cookies.collegue, { verb: 'post', path: '/api/notifications/read', body: { ids: [notification.id] } });
      expect([204, 404]).toContain(res.status);
      expect((await f.prisma.notification.findUniqueOrThrow({ where: { id: notification.id } })).readAt).toBeNull();
      const list = await call(f.cookies.collegue, { verb: 'get', path: '/api/notifications' });
      expect(list.status).toBe(200);
      expect(JSON.stringify(list.body)).not.toContain(notification.id);
    });
  });

  describe('appareils push', () => {
    it('supprimer l’appareil d’un autre : 404 journalisé, l’appareil reste ; il n’apparaît pas dans sa liste', async () => {
      const ecdh = createECDH('prime256v1');
      ecdh.generateKeys();
      const device = await f.prisma.pushSubscription.create({
        data: {
          userId: await actorOf('enseignante'),
          endpoint: `https://fcm.googleapis.com/fcm/send/idor-${randomUUID()}`,
          p256dh: ecdh.getPublicKey().toString('base64url'),
          auth: randomBytes(16).toString('base64url'),
          deviceLabel: 'Android',
        },
      });
      const collegue = await actorOf('enseignante.math');
      const logged = await denials(collegue);
      expect((await call(f.cookies.collegue, { verb: 'delete', path: `/api/push/subscriptions/${device.id}` })).status).toBe(404);
      expect(await denials(collegue)).toBe(logged + 1);
      expect(await f.prisma.pushSubscription.count({ where: { id: device.id } })).toBe(1);
      const theirs = await call(f.cookies.collegue, { verb: 'get', path: '/api/push/subscriptions' });
      expect(JSON.stringify(theirs.body)).not.toContain(device.id);
      const mine = await call(f.cookies.enseignante, { verb: 'get', path: '/api/push/subscriptions' });
      expect(JSON.stringify(mine.body)).toContain(device.id);
      expect([400, 404]).toContain((await call(f.cookies.enseignante, { verb: 'delete', path: `/api/push/subscriptions/${MALFORMED}` })).status);
    });
  });

  describe('séances d’emploi du temps', () => {
    it('« Mon emploi du temps » : l’enseignante voit sa séance, sa collègue de la même classe ne la voit pas', async () => {
      const day = '2026-11-23';
      const created = await call(f.cookies.admin, {
        verb: 'post',
        path: '/api/timetable/sessions',
        body: { teacherId: f.ids.enseignante, classId: f.ids.violet, date: day, startTime: '08:00', endTime: '09:00' },
      });
      expect(created.status).toBe(201);
      const mine = (cookie: string) => api().get('/api/timetable/mine').query({ from: day, to: day }).set('Cookie', cookie);
      expect(JSON.stringify((await mine(f.cookies.enseignante)).body)).toContain(created.body.id);
      const theirs = await mine(f.cookies.collegue);
      expect(theirs.status).toBe(200);
      expect(JSON.stringify(theirs.body)).not.toContain(created.body.id);
    });
  });
});
