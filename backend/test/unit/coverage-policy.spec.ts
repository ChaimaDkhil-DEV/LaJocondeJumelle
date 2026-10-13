import { nextCoverageDeadline } from '../../src/coverage/domain/coverage-deadlines';
import {
  canReadPresenceProof,
  coverageAccess,
  coverageActionsFor,
  slotsOverlap,
  type CoverageFacts,
  type CoverageViewer,
} from '../../src/coverage/domain/coverage-policy';
import type { CoverageStatus } from '../../src/coverage/domain/coverage-state-machine';
import { qrKeyFrom, signQrToken, verifyQrToken } from '../../src/coverage/domain/qr-token';
import { NO_DEADLINE } from '../../src/requests/domain/deadlines';

const user = (id: string, role: CoverageViewer['role'] = 'EMPLOYEE', active = true): CoverageViewer => ({ id, role, active });

function facts(status: CoverageStatus, extra: Partial<CoverageFacts> = {}): CoverageFacts {
  return {
    status,
    assigneeId: ['BROADCAST', 'UNFILLED'].includes(status) ? null : 'preneur',
    rules: { proofMode: 'BOTH', finalValidation: false },
    requesterId: 'responsable',
    managerIds: new Set(['responsable']),
    inTargetGroup: false,
    ...extra,
  };
}

describe('Politique d’accès des couvertures', () => {
  it('membre du groupe : accès complet tant que la demande est diffusée ou non pourvue, puis vue réduite', () => {
    const member = user('membre');
    expect(coverageAccess(member, facts('BROADCAST', { inTargetGroup: true }))).toBe('full');
    expect(coverageAccess(member, facts('UNFILLED', { inTargetGroup: true }))).toBe('full');
    for (const status of ['ACCEPTED', 'EN_ROUTE', 'ON_DUTY', 'CLOSED', 'CANCELLED'] as const) {
      expect(coverageAccess(member, facts(status, { inTargetGroup: true }))).toBe('limited');
      expect(coverageActionsFor(member, facts(status, { inTargetGroup: true }))).toEqual([]);
    }
  });

  it('hors groupe : aucun accès ; compte désactivé : aucun accès', () => {
    expect(coverageAccess(user('autre'), facts('BROADCAST'))).toBe('none');
    expect(coverageAccess(user('membre', 'EMPLOYEE', false), facts('BROADCAST', { inTargetGroup: true }))).toBe('none');
    expect(coverageAccess(user('responsable', 'MANAGER', false), facts('BROADCAST'))).toBe('none');
  });

  it('preneur, responsables de la catégorie, auteur et super administrateur : accès complet', () => {
    expect(coverageAccess(user('preneur'), facts('ON_DUTY'))).toBe('full');
    expect(coverageAccess(user('responsable', 'MANAGER'), facts('ON_DUTY'))).toBe('full');
    expect(coverageAccess(user('chef', 'SUPER_ADMIN'), facts('ON_DUTY'))).toBe('full');
    // Un responsable d'une autre catégorie ne voit rien.
    expect(coverageAccess(user('autre-resp', 'MANAGER'), facts('ON_DUTY'))).toBe('none');
  });

  it('photo de preuve : auteur, responsables, super administrateur — jamais les autres membres', () => {
    const f = facts('ON_DUTY', { inTargetGroup: true });
    expect(canReadPresenceProof(user('preneur'), f, 'preneur')).toBe(true);
    expect(canReadPresenceProof(user('responsable', 'MANAGER'), f, 'preneur')).toBe(true);
    expect(canReadPresenceProof(user('chef', 'SUPER_ADMIN'), f, 'preneur')).toBe(true);
    expect(canReadPresenceProof(user('membre'), { ...f, status: 'BROADCAST' }, 'preneur')).toBe(false);
  });

  it('chevauchement des créneaux : fin ouverte = jusqu’à la relève', () => {
    const at = (h: number) => new Date(Date.UTC(2026, 9, 13, h));
    expect(slotsOverlap({ startAt: at(8), plannedEndAt: at(9) }, { startAt: at(9), plannedEndAt: at(10) })).toBe(false);
    expect(slotsOverlap({ startAt: at(8), plannedEndAt: at(10) }, { startAt: at(9), plannedEndAt: at(11) })).toBe(true);
    expect(slotsOverlap({ startAt: at(8), plannedEndAt: null }, { startAt: at(15), plannedEndAt: at(16) })).toBe(true);
    expect(slotsOverlap({ startAt: at(15), plannedEndAt: null }, { startAt: at(8), plannedEndAt: at(9) })).toBe(false);
  });
});

describe('Délais des couvertures', () => {
  const now = new Date(Date.UTC(2026, 9, 13, 8, 0));
  const durations = { takeoverMinutes: 2, arrivalMinutes: 5 };

  it('rediffusion : délai de prise en charge ; acceptation : délai d’arrivée', () => {
    const takeover = nextCoverageDeadline(NO_DEADLINE, [{ from: 'ACCEPTED', to: 'BROADCAST', action: 'RELEASE', actor: 'ASSIGNEE' }], durations, now, now, 20);
    expect(takeover).toMatchObject({ currentStage: 'TAKEOVER', currentDueAt: new Date(now.getTime() + 2 * 60_000), overdueStage: null });
    const arrival = nextCoverageDeadline(takeover, [{ from: 'BROADCAST', to: 'ACCEPTED', action: 'ACCEPT', actor: 'CANDIDATE' }], durations, now, now, 20);
    expect(arrival).toMatchObject({ currentStage: 'ARRIVAL', currentDueAt: new Date(now.getTime() + 5 * 60_000) });
  });

  it('garde planifiée plus tard : le délai d’arrivée part de l’heure de début', () => {
    const start = new Date(now.getTime() + 60 * 60_000);
    const arrival = nextCoverageDeadline(NO_DEADLINE, [{ from: 'BROADCAST', to: 'ACCEPTED', action: 'ACCEPT', actor: 'CANDIDATE' }], durations, start, now, 20);
    expect(arrival.currentDueAt).toEqual(new Date(start.getTime() + 5 * 60_000));
  });

  it('en route ou prolongation : le délai continue ; présence : plus de délai', () => {
    const running = { currentStage: 'ARRIVAL' as const, currentDueAt: now, warnAt: now, overdueStage: null };
    expect(nextCoverageDeadline(running, [{ from: 'ACCEPTED', to: 'EN_ROUTE', action: 'DEPART', actor: 'ASSIGNEE' }], durations, now, now, 20)).toBe(running);
    expect(nextCoverageDeadline(running, [{ from: 'ACCEPTED', to: 'ACCEPTED', action: 'EXTEND', actor: 'ASSIGNEE' }], durations, now, now, 20)).toBe(running);
    expect(nextCoverageDeadline(running, [{ from: 'EN_ROUTE', to: 'ON_DUTY', action: 'CONFIRM_PRESENCE', actor: 'ASSIGNEE' }], durations, now, now, 20)).toEqual(NO_DEADLINE);
  });
});

describe('Jeton du QR code de classe', () => {
  const key = qrKeyFrom('secret-de-test-0123456789abcdef0123456789');
  const classId = '6f1c2a34-1111-4222-8333-944455556666';

  it('signe et vérifie la classe et la version', () => {
    const token = signQrToken(key, classId, 3);
    expect(verifyQrToken(key, token)).toEqual({ classId, version: 3 });
  });

  it('refuse un jeton modifié, une autre clé ou un format invalide', () => {
    const token = signQrToken(key, classId, 3);
    expect(verifyQrToken(key, token.replace('.3.', '.4.'))).toBeNull();
    expect(verifyQrToken(key, token.replace(classId, '6f1c2a34-1111-4222-8333-944455556667'))).toBeNull();
    expect(verifyQrToken(qrKeyFrom('autre-secret-0123456789abcdef0123456789'), token)).toBeNull();
    expect(verifyQrToken(key, 'n’importe quoi')).toBeNull();
    expect(verifyQrToken(key, `${token}x`)).toBeNull();
    expect(verifyQrToken(key, undefined)).toBeNull();
  });
});
