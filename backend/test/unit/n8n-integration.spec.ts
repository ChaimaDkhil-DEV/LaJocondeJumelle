import {
  nextDeliveryStatus,
  retryDelayMs,
  signBody,
  verifyBearer,
  MAX_OUTBOX_ATTEMPTS,
} from '../../src/integrations/domain/n8n-protocol';

/** 015 — protocole avec n8n : signature, reprises limitées, statuts de livraison idempotents. */

describe('signature des événements', () => {
  it('HMAC-SHA256 de « horodatage.corps », stable et dépendante du secret', () => {
    const a = signBody('secret-a'.padEnd(32, 'x'), '1700000000000', '{"eventId":"e1"}');
    expect(a).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(signBody('secret-a'.padEnd(32, 'x'), '1700000000000', '{"eventId":"e1"}')).toBe(a);
    expect(signBody('secret-b'.padEnd(32, 'x'), '1700000000000', '{"eventId":"e1"}')).not.toBe(a);
    expect(signBody('secret-a'.padEnd(32, 'x'), '1700000000001', '{"eventId":"e1"}')).not.toBe(a);
  });

  it('jeton porteur comparé en temps constant ; tout autre en-tête est refusé', () => {
    const secret = 'z'.repeat(32);
    expect(verifyBearer(`Bearer ${secret}`, secret)).toBe(true);
    expect(verifyBearer(`Bearer ${secret}x`, secret)).toBe(false);
    expect(verifyBearer(`Basic ${secret}`, secret)).toBe(false);
    expect(verifyBearer(undefined, secret)).toBe(false);
  });
});

describe('reprises', () => {
  it('délai croissant, plafonné à une heure ; nombre de tentatives limité', () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(3)).toBe(120_000);
    expect(retryDelayMs(20)).toBe(3_600_000);
    expect(MAX_OUTBOX_ATTEMPTS).toBe(8);
  });
});

describe('statut de livraison', () => {
  it('un compte rendu répété ne change rien (idempotence)', () => {
    expect(nextDeliveryStatus('SENT', 'SENT')).toEqual({
      status: 'SENT',
      changed: false,
      attempt: false,
    });
  });

  it('une tentative (en cours, nouvel essai) compte ; une livraison confirmée est définitive', () => {
    expect(nextDeliveryStatus('PENDING', 'PROCESSING')).toEqual({
      status: 'PROCESSING',
      changed: true,
      attempt: true,
    });
    expect(nextDeliveryStatus('FAILED', 'RETRYING')).toEqual({
      status: 'RETRYING',
      changed: true,
      attempt: true,
    });
    expect(nextDeliveryStatus('PROCESSING', 'SENT')).toEqual({
      status: 'SENT',
      changed: true,
      attempt: false,
    });
    expect(nextDeliveryStatus('DELIVERED', 'FAILED')).toEqual({
      status: 'DELIVERED',
      changed: false,
      attempt: false,
    });
    expect(nextDeliveryStatus('DELIVERED', 'SENT')).toEqual({
      status: 'DELIVERED',
      changed: false,
      attempt: false,
    });
  });
});
