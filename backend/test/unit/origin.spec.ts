import { isAllowedOrigin } from '../../src/common/origin';

/** T016 — FR-006 : une seule règle d'origine pour les requêtes HTTP et les connexions temps réel (A08). */
describe('isAllowedOrigin', () => {
  const app = 'https://a.fr';

  it('accepte l’origine de l’application', () => {
    expect(isAllowedOrigin({ origin: 'https://a.fr' }, app)).toBe(true);
  });

  it('refuse une origine étrangère', () => {
    expect(isAllowedOrigin({ origin: 'https://b.fr' }, app)).toBe(false);
  });

  it('n’utilise le Referer, faute d’Origin, que si l’option est donnée', () => {
    expect(isAllowedOrigin({ referer: 'https://a.fr/page' }, app)).toBe(false);
    expect(isAllowedOrigin({ referer: 'https://a.fr/page' }, app, { allowReferer: true })).toBe(true);
    expect(isAllowedOrigin({ referer: 'https://b.fr/page' }, app, { allowReferer: true })).toBe(false);
  });

  it('refuse une valeur qui n’est pas une URL', () => {
    expect(isAllowedOrigin({ origin: 'pas une url' }, app)).toBe(false);
  });

  it('refuse l’origine « null »', () => {
    expect(isAllowedOrigin({ origin: 'null' }, app)).toBe(false);
  });
});
