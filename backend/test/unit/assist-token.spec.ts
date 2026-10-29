import { readAssistToken, signAssistToken, type AssistTokenPayload } from '../../src/common/assist-token';

/** 009, research R6 : jeton signé des propositions, lu à l'envoi de la demande. */
const SECRET = 's'.repeat(32);
const NOW = new Date('2026-10-27T10:00:00Z');
const PAYLOAD: AssistTokenPayload = {
  title: 'Photocopieuse en panne',
  categoryId: '6f1c0b0e-1111-4c2a-9b1a-000000000001',
  priority: 'HIGH',
  sources: [{ id: '6f1c0b0e-2222-4c2a-9b1a-000000000002', title: 'Pannes de reprographie' }],
};

describe('jeton des propositions automatiques', () => {
  it('rend les valeurs proposées au même utilisateur', () => {
    const token = signAssistToken(SECRET, 'u1', PAYLOAD, NOW);
    expect(readAssistToken(SECRET, token, 'u1', new Date(NOW.getTime() + 60_000))).toEqual(PAYLOAD);
  });

  it('transporte le destinataire proposé ; un destinataire mal formé invalide le jeton', () => {
    const withRecipient = { ...PAYLOAD, recipientId: '6f1c0b0e-3333-4c2a-9b1a-000000000003' };
    expect(readAssistToken(SECRET, signAssistToken(SECRET, 'u1', withRecipient, NOW), 'u1', NOW)).toEqual(withRecipient);
    const malformed = { ...PAYLOAD, recipientId: 42 } as unknown as AssistTokenPayload;
    expect(readAssistToken(SECRET, signAssistToken(SECRET, 'u1', malformed, NOW), 'u1', NOW)).toBeNull();
  });

  it('refuse un autre utilisateur', () => {
    expect(readAssistToken(SECRET, signAssistToken(SECRET, 'u1', PAYLOAD, NOW), 'u2', NOW)).toBeNull();
  });

  it('refuse un jeton de plus de 24 h, ou émis dans le futur', () => {
    const token = signAssistToken(SECRET, 'u1', PAYLOAD, NOW);
    expect(readAssistToken(SECRET, token, 'u1', new Date(NOW.getTime() + 24 * 3600_000 + 1))).toBeNull();
    expect(readAssistToken(SECRET, token, 'u1', new Date(NOW.getTime() - 120_000))).toBeNull();
  });

  it('refuse une signature ou une charge utile altérée, ou une autre clé', () => {
    const token = signAssistToken(SECRET, 'u1', PAYLOAD, NOW);
    const [body, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), s: { ...PAYLOAD, priority: 'URGENT' } }),
    ).toString('base64url');
    expect(readAssistToken(SECRET, `${forged}.${signature}`, 'u1', NOW)).toBeNull();
    expect(readAssistToken(SECRET, `${body}.${signature.slice(0, -2)}AA`, 'u1', NOW)).toBeNull();
    expect(readAssistToken('t'.repeat(32), token, 'u1', NOW)).toBeNull();
  });

  it.each(['', 'abc', 'a.b.c', '.', '%%%.%%%', undefined])('refuse un format invalide (%s)', (token) => {
    expect(readAssistToken(SECRET, token, 'u1', NOW)).toBeNull();
  });

  it('refuse une charge utile signée mais mal formée', () => {
    const token = signAssistToken(SECRET, 'u1', { sources: 'x' } as unknown as AssistTokenPayload, NOW);
    expect(readAssistToken(SECRET, token, 'u1', NOW)).toBeNull();
  });
});
