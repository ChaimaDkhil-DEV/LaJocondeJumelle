import {
  ACTIVE_WORK_STATUSES,
  isLate,
  superAdminMayReceive,
  type SupervisedRequest,
} from '../../src/notifications/super-admin-policy';

const NOW = new Date('2026-10-16T10:00:00.000Z');

function request(patch: Partial<SupervisedRequest> = {}): SupervisedRequest {
  return { kind: 'WORK', status: 'SENT', priority: 'NORMAL', requesterId: 'ens', assigneeId: 'rep', currentDueAt: null, overdueStage: null, ...patch };
}

const may = (type: Parameters<typeof superAdminMayReceive>[1], r: SupervisedRequest, alert = false) =>
  superAdminMayReceive('sa', type, r, { alert, now: NOW });

describe('Notifications du super administrateur : règle', () => {
  it('ne considère actives que les demandes à traiter', () => {
    expect([...ACTIVE_WORK_STATUSES].sort()).toEqual(['ACCEPTED', 'IN_PROGRESS', 'PENDING_ADMIN_VALIDATION', 'SENT', 'TO_CORRECT']);
  });

  it('refuse les notifications ordinaires, accepte les alertes sur une demande active', () => {
    for (const type of ['REQUEST_NEW', 'STATUS_CHANGED', 'ASSIGNED', 'CANCELLED', 'OVERDUE', 'URGENT'] as const) {
      expect(may(type, request())).toBe(false);
    }
    for (const type of ['URGENT', 'UNASSIGNED', 'OVERDUE'] as const) {
      expect(may(type, request(), true)).toBe(true);
    }
  });

  it('accepte les messages seulement sur une demande urgente ou en retard', () => {
    expect(may('MESSAGE_NEW', request())).toBe(false);
    expect(may('MESSAGE_NEW', request({ priority: 'URGENT' }))).toBe(true);
    expect(may('MESSAGE_NEW', request({ overdueStage: 'TAKEOVER' }))).toBe(true);
    expect(may('MESSAGE_NEW', request({ currentDueAt: new Date(NOW.getTime() - 1000) }))).toBe(true);
    expect(may('MESSAGE_NEW', request({ currentDueAt: new Date(NOW.getTime() + 60_000) }))).toBe(false);
  });

  it('ne notifie rien sur une demande terminée, refusée, annulée ou en brouillon, même en retard ou urgente', () => {
    for (const status of ['DONE', 'PENDING_FINAL_VALIDATION', 'CLOSED', 'REJECTED', 'CANCELLED', 'DRAFT'] as const) {
      const r = request({ status, priority: 'URGENT', overdueStage: 'TAKEOVER' });
      expect(may('MESSAGE_NEW', r)).toBe(false);
      expect(may('OVERDUE', r, true)).toBe(false);
    }
  });

  it('garde les notifications habituelles sur ses propres demandes, et ne touche pas aux gardes', () => {
    expect(superAdminMayReceive('ens', 'REJECTED', request({ status: 'REJECTED' }), { alert: false, now: NOW })).toBe(true);
    expect(superAdminMayReceive('rep', 'STATUS_CHANGED', request(), { alert: false, now: NOW })).toBe(true);
    expect(may('COVERAGE_LATE', request({ kind: 'COVERAGE', status: 'LATE' }))).toBe(true);
  });

  it('considère en retard une étape marquée ou une échéance passée', () => {
    expect(isLate({ overdueStage: null, currentDueAt: null }, NOW)).toBe(false);
    expect(isLate({ overdueStage: 'COMPLETION', currentDueAt: null }, NOW)).toBe(true);
    expect(isLate({ overdueStage: null, currentDueAt: NOW }, NOW)).toBe(true);
  });
});
