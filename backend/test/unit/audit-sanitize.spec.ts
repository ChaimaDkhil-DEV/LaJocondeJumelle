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
      after: { role: 'ADMIN', password: 'p', token: 't', sid: 's', cookie: 'c' },
      changes: [{ field: 'text', text: 'contenu privé', message: 'm', content: 'c', secret: 'z' }],
    });
    expect(details).toEqual({
      before: { role: 'EMPLOYEE', displayName: 'A' },
      after: { role: 'ADMIN' },
      changes: [{ field: 'text' }],
    });
  });

  it('garde la période et le regroupement d’un export des statistiques (008)', () => {
    expect(
      sanitizeAuditDetails({ from: '2026-10-01', to: '2026-10-23', groupBy: 'period', period: 'month', rows: [] }),
    ).toEqual({ from: '2026-10-01', to: '2026-10-23', groupBy: 'period', period: 'month' });
  });

  it('garde l’identifiant et le titre d’une consigne, jamais son texte (009)', () => {
    expect(
      sanitizeAuditDetails({ action: 'UPDATED', guidelineId: 'g1', title: 'Pannes', body: 'texte intégral', fields: ['body'] }),
    ).toEqual({ action: 'UPDATED', guidelineId: 'g1', title: 'Pannes', fields: ['body'] });
  });

  it('communication aux parents (015) : événement, version, identifiants et canaux, jamais le texte', () => {
    expect(sanitizeAuditDetails({ event: 'SUBMITTED', revision: 2, text: 'remarque', voiceFileId: 'v1' })).toEqual({ event: 'SUBMITTED', revision: 2 });
    expect(sanitizeAuditDetails({ event: 'CREATED', studentId: 's1', studentIds: ['s1', 's2'], guardianId: 'g1' })).toEqual({
      event: 'CREATED',
      studentId: 's1',
      studentIds: ['s1', 's2'],
      guardianId: 'g1',
    });
    expect(sanitizeAuditDetails({ classIds: ['c1'] })).toEqual({ classIds: ['c1'] });
    expect(sanitizeAuditDetails({ event: 'DATA_READ', channels: ['EMAIL'], email: 'a@b.c', phone: '+216' })).toEqual({ event: 'DATA_READ', channels: ['EMAIL'] });
    expect(sanitizeAuditDetails({ event: 'REPORT', channel: 'EMAIL', from: 'PENDING', to: 'SENT' })).toEqual({ event: 'REPORT', channel: 'EMAIL', from: 'PENDING', to: 'SENT' });
  });

  it('renvoie undefined quand il ne reste rien', () => {
    expect(sanitizeAuditDetails({ password: 'x' })).toBeUndefined();
    expect(sanitizeAuditDetails(undefined)).toBeUndefined();
  });
});

describe('sanitizeAuditDetails : historique d’un élève (021)', () => {
  it('garde l’instant consulté et l’identifiant de l’élève d’une consultation de situation', () => {
    expect(sanitizeAuditDetails({ studentId: 's1', at: '2026-11-12T10:42:00+01:00', inconnu: 'x' })).toEqual({
      studentId: 's1',
      at: '2026-11-12T10:42:00+01:00',
    });
  });

  it('garde l’avant et l’après d’un changement de classe', () => {
    expect(
      sanitizeAuditDetails({ action: 'update', fields: ['classId'], before: { classId: 'a' }, after: { classId: 'b' } }),
    ).toEqual({ action: 'update', fields: ['classId'], before: { classId: 'a' }, after: { classId: 'b' } });
  });
});
