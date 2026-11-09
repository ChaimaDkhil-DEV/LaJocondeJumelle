import { Logger, type INestApplication } from '@nestjs/common';
import { PrismaClient, type Notification } from '@prisma/client';
import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import webpush from 'web-push';
import { loadConfig } from '../../src/config/config';
import { APP_CONFIG } from '../../src/config/config.module';
import { PUSH_SCHEDULER, PushDispatcher, type PushScheduler } from '../../src/push/push-dispatcher.service';
import { PUSH_SENDER, type PushSendResult, type PushTarget } from '../../src/push/web-push.sender';
import { CATEGORIES, categoryId, loginAs, seedDemo, userId } from '../utils/auth-helpers';
import { clearCoverages, createCoverage, minutesFrom } from '../utils/coverage-fixtures';
import { createTestApp, TEST_ORIGIN } from '../utils/test-app';
import { resetDatabase } from '../utils/test-db';

/**
 * 014, T017 (US1, FR-004, FR-005, FR-015, FR-016, FR-020, D4, D8) : de l'action métier à l'envoyeur
 * simulé (aucun vrai service de push, FR-014). L'attente entre deux tentatives passe par un
 * ordonnanceur simulé : le test décide quand la tentative suivante part.
 */

interface Sent {
  target: PushTarget;
  payload: { v: number; id: string; type: string; place: string; url: string };
  topic: string;
}

describe('Envoi des notifications en push (US1)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let dispatcher: PushDispatcher;
  const cookie: Record<string, string> = {};
  const id: Record<string, string> = {};
  let violet: string;

  // Envoyeur simulé : réponses programmées, 201 par défaut.
  const sent: Sent[] = [];
  const responses: PushSendResult[] = [];
  const sender = {
    send: jest.fn(async (target: PushTarget, payload: string, options: { topic: string }): Promise<PushSendResult> => {
      sent.push({ target, payload: JSON.parse(payload), topic: options.topic });
      return responses.shift() ?? { statusCode: 201 };
    }),
  };

  // Ordonnanceur simulé : chaque attente est retenue jusqu'à ce que le test la libère.
  const waits: Array<{ ms: number; release: () => void }> = [];
  const scheduler: PushScheduler = { wait: (ms) => new Promise<void>((release) => waits.push({ ms, release })) };

  const vapid = webpush.generateVAPIDKeys();
  const api = () => request(app.getHttpServer());
  const post = (who: string, path: string, body: Record<string, unknown>) =>
    api().post(path).set('Cookie', cookie[who]).set('Origin', TEST_ORIGIN).send(body);

  /** Attend qu'une condition soit vraie (envoi en arrière-plan), 5 s au plus. */
  async function until(condition: () => boolean | Promise<boolean>): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (!(await condition())) {
      if (Date.now() > deadline) throw new Error('Condition non atteinte en 5 s');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  let counter = 0;
  /** Abonnement d'appareil inséré en base (les routes d'abonnement arrivent en US2). */
  async function subscribe(who: string, sessionId: string | null = null): Promise<{ id: string; endpoint: string }> {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const endpoint = `https://fcm.googleapis.com/fcm/send/test-${++counter}`;
    const row = await prisma.pushSubscription.create({
      data: {
        userId: id[who],
        sessionId,
        endpoint,
        p256dh: ecdh.getPublicKey().toString('base64url'),
        auth: randomBytes(16).toString('base64url'),
        deviceLabel: 'Android · Chrome',
      },
    });
    return { id: row.id, endpoint };
  }

  const directCoverage = (assignee: string) =>
    post('admin', '/api/coverage', {
      clientId: randomUUID(),
      classId: violet,
      type: 'ABSENCE',
      assigneeId: id[assignee],
      startAt: minutesFrom(new Date(), 10).toISOString(),
      endAt: minutesFrom(new Date(), 70).toISOString(),
    });

  const workRequest = async (priority: 'NORMAL' | 'URGENT') =>
    post('enseignante', '/api/requests', {
      clientId: randomUUID(),
      title: 'Photocopies du contrôle',
      description: 'Trente exemplaires recto verso.',
      categoryId: await categoryId(prisma, CATEGORIES.photocopies),
      recipientId: id.reprographie,
      priority,
    });

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    await prisma.category.updateMany({ where: { kind: 'COVERAGE' }, data: { proofMode: 'QR' } });
    app = await createTestApp(
      [],
      [
        {
          provide: APP_CONFIG,
          useValue: {
            ...loadConfig(),
            push: { publicKey: vapid.publicKey, privateKey: vapid.privateKey, subject: 'mailto:test@ecole.example' },
          },
        },
        { provide: PUSH_SENDER, useValue: sender },
        { provide: PUSH_SCHEDULER, useValue: scheduler },
      ],
    );
    dispatcher = app.get(PushDispatcher);
    for (const who of ['enseignante', 'admin', 'superadmin', 'surveillant', 'reprographie']) {
      cookie[who] = await loginAs(app, who);
      id[who] = await userId(prisma, who);
    }
    violet = (await prisma.schoolClass.findUniqueOrThrow({ where: { name: '1ère année Violet' } })).id;
    // Plage d'envoi ouverte toute la journée, tous les jours : ces tests ne dépendent pas de l'heure (US4).
    // Seule la minute 23:59, exclue, la ferme.
    await openWindow();
  });

  const ALL_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const setWindow = async (body: Record<string, unknown>) => {
    const res = await api().put('/api/admin/settings').set('Cookie', cookie.superadmin).set('Origin', TEST_ORIGIN).send(body);
    if (res.status !== 200) throw new Error(`Plage : ${res.status} ${JSON.stringify(res.body)}`);
  };
  const openWindow = () => setWindow({ pushWindowDays: ALL_DAYS, pushWindowStart: '00:00', pushWindowEnd: '23:59' });

  beforeEach(async () => {
    await dispatcher.settled();
    await clearCoverages(prisma);
    await prisma.pushSubscription.deleteMany();
    await prisma.notificationPreference.deleteMany();
    sent.length = 0;
    responses.length = 0;
    waits.length = 0;
    sender.send.mockClear();
  });

  afterAll(async () => {
    for (const w of waits.splice(0)) w.release();
    await dispatcher.settled();
    await app.close();
    await prisma.$disconnect();
  });

  it('(a) garde affectée : un push par appareil du surveillant, contenu minimal (FR-015, contrat)', async () => {
    const devices = [await subscribe('surveillant'), await subscribe('surveillant')];
    const res = await directCoverage('surveillant');
    expect(res.status).toBe(201);
    await dispatcher.settled();

    const assigned = sent.filter((s) => s.payload.type === 'ASSIGNED');
    expect(assigned.map((s) => s.target.endpoint).sort()).toEqual(devices.map((d) => d.endpoint).sort());
    const notification = await prisma.notification.findFirstOrThrow({ where: { userId: id.surveillant, type: 'ASSIGNED' } });
    for (const s of assigned) {
      expect(s.payload).toEqual({
        v: 1,
        id: notification.id,
        type: 'ASSIGNED',
        place: '1ère année Violet',
        url: `/gardes/${res.body.id}`,
      });
      expect(s.topic).toBe(notification.id.replace(/-/g, ''));
    }
  });

  it('(b) demande de travail non urgente : aucun push', async () => {
    await subscribe('reprographie');
    const res = await workRequest('NORMAL');
    expect(res.status).toBe(201);
    await dispatcher.settled();
    expect(await prisma.notification.count({ where: { userId: id.reprographie, requestId: res.body.id } })).toBeGreaterThan(0);
    expect(sent).toHaveLength(0);
  });

  it('(c) demande de travail urgente : un push URGENT avec la référence', async () => {
    await subscribe('reprographie');
    const res = await workRequest('URGENT');
    expect(res.status).toBe(201);
    await dispatcher.settled();
    expect(sent.map((s) => s.payload)).toEqual([
      expect.objectContaining({ type: 'URGENT', place: res.body.reference, url: `/demandes/${res.body.id}` }),
    ]);
  });

  it('(d) enseignant arrivé : push au seul surveillant affecté, les admins gardent la notification (D4)', async () => {
    await subscribe('surveillant');
    await subscribe('admin');
    const requestId = await createCoverage(prisma, {
      status: 'PENDING',
      type: 'LATENESS',
      assignee: 'surveillant',
      startAt: minutesFrom(new Date(), -20),
      plannedEndAt: minutesFrom(new Date(), 40),
    });
    const qr = await api().get(`/api/admin/coverage/classes/${violet}/qr`).set('Cookie', cookie.superadmin);
    const token = new URL((qr.body as { url: string }).url).searchParams.get('c')!;
    const res = await post('enseignante', '/api/attendance/arrive', { token });
    expect(res.status).toBe(201);
    await dispatcher.settled();

    expect(await prisma.notification.count({ where: { userId: id.admin, requestId, type: 'COVERAGE_TEACHER_ARRIVED' } })).toBe(1);
    const arrived = sent.filter((s) => s.payload.type === 'COVERAGE_TEACHER_ARRIVED');
    expect(arrived).toHaveLength(1);
    const owner = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: arrived[0].target.endpoint } });
    expect(owner.userId).toBe(id.surveillant);
  });

  it('(e) destinataire désactivé : aucun push', async () => {
    await subscribe('surveillant');
    const requestId = await createCoverage(prisma, {
      status: 'ACCEPTED',
      assignee: 'surveillant',
      startAt: minutesFrom(new Date(), 5),
      plannedEndAt: minutesFrom(new Date(), 65),
    });
    const notification = await prisma.notification.create({
      data: { userId: id.surveillant, type: 'ASSIGNED', requestId, priority: 'URGENT' },
    });
    await prisma.user.update({ where: { id: id.surveillant }, data: { active: false } });
    dispatcher.enqueue([notification]);
    await dispatcher.settled();
    expect(sent).toHaveLength(0);
  });

  it('(g) 410 : abonnement supprimé ; 201 : dernier envoi réussi enregistré', async () => {
    const gone = await subscribe('surveillant');
    const ok = await subscribe('surveillant');
    responses.push({ statusCode: 410 }, { statusCode: 201 });
    await directCoverage('surveillant');
    await dispatcher.settled();

    const remaining = await prisma.pushSubscription.findMany({ where: { userId: id.surveillant } });
    expect(remaining).toHaveLength(1);
    const [kept] = remaining;
    expect([gone.id, ok.id]).toContain(kept.id);
    expect(kept.lastSuccessAt).toBeInstanceOf(Date);
  });

  it('(h) journal d’erreur : type, code et empreinte ; ni adresse, ni contenu, ni clés', async () => {
    const lines: string[] = [];
    const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((level) =>
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        lines.push(String(args[0]));
      }),
    );
    try {
      const device = await subscribe('surveillant');
      const row = await prisma.pushSubscription.findUniqueOrThrow({ where: { id: device.id } });
      responses.push({ statusCode: 400 });
      await directCoverage('surveillant');
      await dispatcher.settled();

      const pushLines = lines.filter((l) => l.includes('ASSIGNED'));
      expect(pushLines.length).toBeGreaterThan(0);
      const text = pushLines.join('\n');
      expect(text).toContain('400');
      expect(text).toMatch(/[0-9a-f]{12}/);
      for (const secret of [device.endpoint, 'fcm.googleapis.com', row.p256dh, row.auth, '1ère année Violet', vapid.privateKey]) {
        expect(lines.join('\n')).not.toContain(secret);
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it('(i) session de l’abonné supprimée, sans déconnexion : le push part quand même (D8, US5-4)', async () => {
    const [session] = await prisma.session.findMany({ where: { userId: id.surveillant }, take: 1 });
    await subscribe('surveillant', session.id);
    await prisma.session.deleteMany({ where: { userId: id.surveillant } });
    await directCoverage('surveillant');
    await dispatcher.settled();
    expect(sent.filter((s) => s.payload.type === 'ASSIGNED')).toHaveLength(1);
    cookie.surveillant = await loginAs(app, 'surveillant');
  });

  it('(US3) catégorie Couverture désactivée : aucun push pour une affectation, la notification reste en base', async () => {
    await subscribe('surveillant');
    await prisma.notificationPreference.create({ data: { userId: id.surveillant, coverage: false } });
    const res = await directCoverage('surveillant');
    expect(res.status).toBe(201);
    await dispatcher.settled();
    expect(await prisma.notification.count({ where: { userId: id.surveillant, type: 'ASSIGNED' } })).toBe(1);
    expect(sent).toHaveLength(0);
    // L'appareil reste abonné : la reprise ne demandera pas de nouvelle autorisation (US3-4).
    expect(await prisma.pushSubscription.count({ where: { userId: id.surveillant } })).toBe(1);
  });

  it('(US3) catégorie Couverture désactivée : la catégorie Urgent reste envoyée', async () => {
    await subscribe('reprographie');
    await prisma.notificationPreference.create({ data: { userId: id.reprographie, coverage: false } });
    const res = await workRequest('URGENT');
    expect(res.status).toBe(201);
    await dispatcher.settled();
    expect(sent.map((s) => s.payload.type)).toEqual(['URGENT']);
  });

  it('(US3) toutes les catégories désactivées : aucun push, appareils toujours abonnés', async () => {
    await subscribe('reprographie');
    await prisma.notificationPreference.create({
      data: { userId: id.reprographie, urgent: false, coverage: false, unfilled: false, attendance: false },
    });
    await workRequest('URGENT');
    await dispatcher.settled();
    expect(sent).toHaveLength(0);
    expect(await prisma.pushSubscription.count({ where: { userId: id.reprographie } })).toBe(1);
  });

  it('(US4) plage fermée au moment de l’envoi : aucun push, ni maintenant ni à sa réouverture (NC-7)', async () => {
    const today = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: loadConfig().schoolTimezone })
      .format(new Date())
      .toUpperCase()
      .slice(0, 3);
    await subscribe('surveillant');
    try {
      await setWindow({ pushWindowDays: ALL_DAYS.filter((d) => d !== today) });
      const res = await directCoverage('surveillant');
      expect(res.status).toBe(201);
      await dispatcher.settled();
      expect(await prisma.notification.count({ where: { userId: id.surveillant, type: 'ASSIGNED' } })).toBe(1);
      expect(sent).toHaveLength(0);

      await openWindow();
      await dispatcher.settled();
      expect(sent).toHaveLength(0);
    } finally {
      await openWindow();
    }
  });

  describe('tentative en attente (FR-020, NC-8a)', () => {
    async function firstAttemptFails(): Promise<{ id: string; endpoint: string }> {
      const device = await subscribe('surveillant');
      responses.push({ statusCode: 500 });
      await directCoverage('surveillant');
      await until(() => waits.length === 1);
      expect(waits[0].ms).toBe(5_000);
      expect(sender.send).toHaveBeenCalledTimes(1);
      return device;
    }

    async function releaseAndSettle() {
      for (const w of waits.splice(0)) w.release();
      await dispatcher.settled();
    }

    it('nouvelle tentative envoyée si rien n’a changé', async () => {
      await firstAttemptFails();
      await releaseAndSettle();
      expect(sender.send).toHaveBeenCalledTimes(2);
    });

    it('(j) abonnement supprimé avant la 2e tentative : aucune 2e tentative', async () => {
      const device = await firstAttemptFails();
      await prisma.pushSubscription.delete({ where: { id: device.id } });
      await releaseAndSettle();
      expect(sender.send).toHaveBeenCalledTimes(1);
    });

    it('(k) abonnement transféré à un autre utilisateur avant la 2e tentative : rien n’est envoyé à son nom', async () => {
      const device = await firstAttemptFails();
      await prisma.pushSubscription.update({ where: { id: device.id }, data: { userId: id.reprographie } });
      await releaseAndSettle();
      expect(sender.send).toHaveBeenCalledTimes(1);
    });

    it('(l) compte désactivé avant la 2e tentative : aucune 2e tentative', async () => {
      await firstAttemptFails();
      await prisma.user.update({ where: { id: id.surveillant }, data: { active: false } });
      await releaseAndSettle();
      expect(sender.send).toHaveBeenCalledTimes(1);
    });
  });
});

describe('Push désactivé par l’établissement (f)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const sender = { send: jest.fn(async () => ({ statusCode: 201 })) };

  beforeAll(async () => {
    await resetDatabase(prisma);
    await seedDemo(prisma);
    app = await createTestApp([], [
      { provide: APP_CONFIG, useValue: { ...loadConfig(), push: null } },
      { provide: PUSH_SENDER, useValue: sender },
    ]);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('aucun envoi, même avec un abonnement en base', async () => {
    const surveillant = await userId(prisma, 'surveillant');
    await prisma.pushSubscription.create({
      data: {
        userId: surveillant,
        endpoint: 'https://fcm.googleapis.com/fcm/send/desactive',
        p256dh: 'BKey',
        auth: 'auth',
        deviceLabel: 'Android · Chrome',
      },
    });
    const requestId = await createCoverage(prisma, {
      status: 'ACCEPTED',
      assignee: 'surveillant',
      startAt: minutesFrom(new Date(), 5),
      plannedEndAt: minutesFrom(new Date(), 65),
    });
    const notification: Notification = await prisma.notification.create({
      data: { userId: surveillant, type: 'ASSIGNED', requestId, priority: 'URGENT' },
    });
    const dispatcher = app.get(PushDispatcher);
    dispatcher.enqueue([notification]);
    await dispatcher.settled();
    expect(sender.send).not.toHaveBeenCalled();
  });
});
