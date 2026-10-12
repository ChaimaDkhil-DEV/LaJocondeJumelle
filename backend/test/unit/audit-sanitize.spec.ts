import { sanitizeAuditDetails } from '../../src/audit/audit.service';

describe('sanitizeAuditDetails', () => {
  it('ne garde que les champs de premier niveau autorisés', () => {
    expect(
      sanitizeAuditDetails({ reason: 'UNAUTHENTICATED', route: '/api/requests', inconnu: 'x' }),
    ).toEqual({ reason: 'UNAUTHENTICATED', route: '/api/requests' });
  });

  it('retire mots de passe, jetons, cookies et contenus de message, même imbriqués', () => {
    const details = sanitizeAuditDetails({
      before: { role: 'EMPLOYEE', passwordHash: 'h', displayName: 'A' },
      after: { role: 'MANAGER', password: 'p', token: 't', sid: 's', cookie: 'c' },
      changes: [{ field: 'text', text: 'contenu privé', message: 'm', content: 'c', secret: 'z' }],
    });
    expect(details).toEqual({
      before: { role: 'EMPLOYEE', displayName: 'A' },
      after: { role: 'MANAGER' },
      changes: [{ field: 'text' }],
    });
  });

  it('renvoie undefined quand il ne reste rien', () => {
    expect(sanitizeAuditDetails({ password: 'x' })).toBeUndefined();
    expect(sanitizeAuditDetails(undefined)).toBeUndefined();
  });
});
