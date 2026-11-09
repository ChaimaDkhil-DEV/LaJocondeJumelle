import type { AppConfig } from '../../src/config/config';
import { WebPushSender } from '../../src/push/web-push.sender';

/**
 * 014, T010 (research R1, R6, R7) : envoyeur Web Push sur une bibliothèque simulée (aucun appel réseau,
 * FR-014). Validité 30 min, urgence haute, sujet de remplacement, 10 s au plus ; aucune exception ne sort.
 */
const sendNotification = jest.fn();

class FakeWebPushError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly headers: Record<string, string>,
    readonly body: string,
    readonly endpoint: string,
  ) {
    super(message);
    this.name = 'WebPushError';
  }
}

// Fabrique remontée en tête de fichier par Jest : la classe n'est lue qu'à l'usage (accesseur).
jest.mock('web-push', () => ({
  sendNotification: (...args: unknown[]) => sendNotification(...args),
  get WebPushError() {
    return FakeWebPushError;
  },
}));

const PUSH = { publicKey: 'BPub', privateKey: 'priv', subject: 'mailto:direction@ecole.example' };
const config = (push: AppConfig['push']) => ({ push }) as AppConfig;
const target = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BKey', auth: 'secret' } };
const payload = '{"v":1}';

describe('WebPushSender', () => {
  beforeEach(() => sendNotification.mockReset());

  it('envoie avec la validité, l’urgence, le sujet, le délai et les clés de l’établissement', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    const sender = new WebPushSender(config(PUSH));

    await expect(sender.send(target, payload, { topic: 'abc123' })).resolves.toEqual({ statusCode: 201 });

    expect(sendNotification).toHaveBeenCalledWith(target, payload, {
      TTL: 1800,
      urgency: 'high',
      topic: 'abc123',
      timeout: 10_000,
      vapidDetails: { subject: PUSH.subject, publicKey: PUSH.publicKey, privateKey: PUSH.privateKey },
    });
  });

  it('rend le code d’une réponse en erreur du service de push', async () => {
    sendNotification.mockRejectedValue(new FakeWebPushError('Gone', 410, {}, '', target.endpoint));
    await expect(new WebPushSender(config(PUSH)).send(target, payload, { topic: 't' })).resolves.toEqual({ statusCode: 410 });
  });

  it('lit l’en-tête retry-after quand il est présent', async () => {
    sendNotification.mockRejectedValue(new FakeWebPushError('Too many', 429, { 'retry-after': '120' }, '', target.endpoint));
    await expect(new WebPushSender(config(PUSH)).send(target, payload, { topic: 't' })).resolves.toEqual({
      statusCode: 429,
      retryAfterSeconds: 120,
    });
  });

  it('ignore un en-tête retry-after illisible', async () => {
    sendNotification.mockRejectedValue(new FakeWebPushError('Busy', 503, { 'retry-after': 'bientôt' }, '', target.endpoint));
    await expect(new WebPushSender(config(PUSH)).send(target, payload, { topic: 't' })).resolves.toEqual({ statusCode: 503 });
  });

  it.each([
    ['réseau', Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })],
    ['délai dépassé', Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })],
    ['inattendue', 'chaîne levée'],
  ])('une erreur %s devient un code nul, sans exception', async (_label, error) => {
    sendNotification.mockRejectedValue(error);
    await expect(new WebPushSender(config(PUSH)).send(target, payload, { topic: 't' })).resolves.toEqual({ statusCode: null });
  });

  it('n’appelle rien si le push n’est pas configuré', async () => {
    await expect(new WebPushSender(config(null)).send(target, payload, { topic: 't' })).resolves.toEqual({ statusCode: null });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
