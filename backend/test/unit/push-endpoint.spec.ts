import { createECDH, randomBytes } from 'node:crypto';
import { validatePushSubscription } from '../../src/push/domain/push-endpoint';

/**
 * 014, T026 (NFR-001, research R9) : le serveur n'enverra qu'à des services de push reconnus, en HTTPS,
 * avec des clés au bon format ; toute autre adresse est refusée dès l'abonnement (protection SSRF).
 */

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const KEYS = { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') };

const errorsOf = (endpoint: unknown, keys: unknown = KEYS) => validatePushSubscription({ endpoint, keys });

describe('validatePushSubscription', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc-123',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAAA',
    'https://web.push.apple.com/QGuQyavXutnMH1bA',
    'https://wns2-par02p.notify.windows.com/w/?token=BQYAAA',
  ])('accepte %s', (endpoint) => {
    expect(errorsOf(endpoint)).toEqual([]);
  });

  it.each([
    ['http au lieu de https', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['hôte ressemblant', 'https://fcm.googleapis.com.evil.example/fcm/send/abc'],
    ['hôte inconnu', 'https://evil.example/fcm/send/abc'],
    ['adresse interne', 'https://127.0.0.1/fcm/send/abc'],
    ['nom local', 'https://localhost/fcm/send/abc'],
    ['identifiants dans l’adresse', 'https://user:pw@fcm.googleapis.com/fcm/send/abc'],
    ['port non standard', 'https://fcm.googleapis.com:8443/fcm/send/abc'],
    ['sous-domaine de Windows sans point', 'https://evilnotify.windows.com/w/'],
    ['adresse trop longue', `https://fcm.googleapis.com/fcm/send/${'a'.repeat(2049)}`],
    ['pas une adresse', 'pas une adresse'],
    ['pas une chaîne', 42],
    ['vide', ''],
  ])('refuse l’adresse : %s', (_label, endpoint) => {
    expect(errorsOf(endpoint)).toEqual(['endpoint']);
  });

  it('refuse une clé p256dh qui n’est pas un point P-256 non compressé', () => {
    const compressed = Buffer.concat([Buffer.from([0x02]), ecdh.getPublicKey().subarray(1, 33)]).toString('base64url');
    const wrongPrefix = Buffer.concat([Buffer.from([0x05]), ecdh.getPublicKey().subarray(1)]).toString('base64url');
    for (const p256dh of [compressed, wrongPrefix, 'pas+du/base64', '', 42]) {
      expect(errorsOf('https://fcm.googleapis.com/fcm/send/abc', { ...KEYS, p256dh })).toEqual(['keys']);
    }
  });

  it('refuse un secret auth qui ne fait pas 16 octets', () => {
    for (const auth of [randomBytes(8).toString('base64url'), randomBytes(32).toString('base64url'), '', null]) {
      expect(errorsOf('https://fcm.googleapis.com/fcm/send/abc', { ...KEYS, auth })).toEqual(['keys']);
    }
  });

  it('refuse des clés absentes', () => {
    expect(validatePushSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc' })).toEqual(['keys']);
    expect(validatePushSubscription({})).toEqual(['endpoint', 'keys']);
  });
});
