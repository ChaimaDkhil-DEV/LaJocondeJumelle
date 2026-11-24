import { forwardedAddress } from '../../src/common/request-info';

/** Adresse cliente d'une connexion temps réel : même règle que req.ip d'Express (TRUST_PROXY). */
describe('forwardedAddress', () => {
  const trusted = new Set(['172.20.0.5', '172.30.255.2']);
  const trust = (address: string) => trusted.has(address);

  it.each([
    ['sans en-tête : le pair', '172.20.0.5', undefined, '172.20.0.5'],
    ['derrière Caddy : l’adresse transmise', '172.20.0.5', '203.0.113.7', '203.0.113.7'],
    ['en-tête falsifié à gauche : ignoré', '172.20.0.5', '1.2.3.4, 203.0.113.7', '203.0.113.7'],
    ['tunnel puis Caddy : l’adresse réelle', '172.20.0.5', '203.0.113.7, 172.30.255.2', '203.0.113.7'],
    ['pair non digne de confiance : en-tête ignoré', '198.51.100.9', '203.0.113.7', '198.51.100.9'],
    ['tous dignes de confiance : le plus éloigné', '172.20.0.5', '172.30.255.2', '172.30.255.2'],
    ['en-tête vide', '172.20.0.5', ' , ', '172.20.0.5'],
  ])('%s', (_label, peer, header, expected) => {
    expect(forwardedAddress(peer, header, trust)).toBe(expected);
  });

  it('transmet le rang à la règle de confiance (TRUST_PROXY=1 : un seul proxy)', () => {
    expect(forwardedAddress('10.0.0.1', '203.0.113.7, 10.0.0.2', (_address, hop) => hop < 1)).toBe('10.0.0.2');
  });

  it('sans adresse de pair : null', () => {
    expect(forwardedAddress('', '203.0.113.7', trust)).toBeNull();
  });
});
