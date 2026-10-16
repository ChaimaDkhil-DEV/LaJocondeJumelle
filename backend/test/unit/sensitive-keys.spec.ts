import { sanitizeAuditDetails } from '../../src/audit/audit.service';
import { redact } from '../../src/common/app-logger';
import { SENSITIVE_KEY } from '../../src/common/sensitive-keys';

/** T015 — FR-005 : une seule liste de clés sensibles pour les journaux applicatifs et l'audit (A06). */
describe('Clés sensibles communes', () => {
  it.each(['password', 'passwordHash', 'token', 'secret', 'cookie', 'authorization', 'Authorization', 'sid', 'text', 'message', 'content'])(
    'reconnaît « %s »',
    (key) => {
      expect(SENSITIVE_KEY.test(key)).toBe(true);
    },
  );

  it.each(['reason', 'route', 'username', 'messages', 'contentType'])('ne reconnaît pas « %s »', (key) => {
    expect(SENSITIVE_KEY.test(key)).toBe(false);
  });

  it('les journaux applicatifs masquent l’en-tête d’autorisation et le contenu d’un message', () => {
    expect(redact({ authorization: 'Bearer x', message: 'contenu', route: '/api' })).toEqual({
      authorization: '[masqué]',
      message: '[masqué]',
      route: '/api',
    });
  });

  it('le journal d’audit retire l’en-tête d’autorisation et le contenu d’un message', () => {
    expect(sanitizeAuditDetails({ reason: 'x', before: { authorization: 'Bearer x', message: 'contenu', role: 'ADMIN' } })).toEqual({
      reason: 'x',
      before: { role: 'ADMIN' },
    });
  });

  it('garde lisible le message d’une erreur journalisée', () => {
    const error = redact(new Error('Erreur lisible')) as Error;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Erreur lisible');
  });
});
