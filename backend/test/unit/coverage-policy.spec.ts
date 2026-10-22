import { nextCoverageDeadline } from '../../src/coverage/domain/coverage-deadlines';
import {
  canReadPresenceProof,
  canSeeReason,
  coverageActionsFor,
  coverageView,
  isCoverageAdmin,
  isEligibleAssignee,
  moduleCapabilities,
  slotsOverlap,
  type CoverageFacts,
  type CoverageViewer,
} from '../../src/coverage/domain/coverage-policy';
import type { CoverageStatus } from '../../src/coverage/domain/coverage-state-machine';
import { qrKeyFrom, signQrToken, verifyQrToken } from '../../src/coverage/domain/qr-token';
import { NO_DEADLINE } from '../../src/requests/domain/deadlines';

/** Matrice « Permissions par rôle » de plan.md (004). */

type Profile = Pick<CoverageViewer, 'role' | 'isTeacher' | 'isSupervisor'>;

const PROFILES = {
  superAdmin: { role: 'SUPER_ADMIN', isTeacher: false, isSupervisor: false },
  admin: { role: 'ADMIN', isTeacher: false, isSupervisor: false },
  adminTeacher: { role: 'ADMIN', isTeacher: true, isSupervisor: false },
  adminSupervisor: { role: 'ADMIN', isTeacher: false, isSupervisor: true },
  supervisor: { role: 'EMPLOYEE', isTeacher: false, isSupervisor: true },
  supervisorTeacher: { role: 'EMPLOYEE', isTeacher: true, isSupervisor: true },
  teacher: { role: 'EMPLOYEE', isTeacher: true, isSupervisor: false },
  other: { role: 'EMPLOYEE', isTeacher: false, isSupervisor: false },
} satisfies Record<string, Profile>;

const user = (id: string, profile: Profile, active = true): CoverageViewer => ({
  id,
  active,
  ...profile,
});

function facts(status: CoverageStatus, extra: Partial<CoverageFacts> = {}): CoverageFacts {
  return {
    status,
    assigneeId: ['PENDING', 'UNFILLED', 'CANCELLED'].includes(status) ? null : 'sv-1',
    rules: { proofMode: 'BOTH', finalValidation: false },
    requesterId: 'ens-1',
    source: 'TEACHER_REQUEST',
    supportUserIds: new Set<string>(),
    ...extra,
  };
}

describe('Permissions du module des affectations', () => {
  describe('capacités par rôle', () => {
    it.each([
      // profil, voir, signaler, déclarer, gérer, statistiques, configurer, assignable
      ['superAdmin', true, true, true, true, true, true, false],
      ['admin', true, false, false, true, true, false, false],
      ['adminTeacher', true, true, false, true, true, false, false],
      ['adminSupervisor', true, false, true, true, true, false, true],
      ['supervisor', true, false, true, false, false, false, true],
      ['supervisorTeacher', true, true, true, false, false, false, true],
      ['teacher', true, true, false, false, false, false, false],
      ['other', false, false, false, false, false, false, false],
    ] as const)(
      '%s',
      (profile, view, report, declareEmptyClass, manage, stats, configure, assignable) => {
        expect(moduleCapabilities(user('u', PROFILES[profile]))).toEqual({
          view,
          report,
          declareEmptyClass,
          manage,
          stats,
          configure,
          assignable,
        });
      },
    );

    it('super administrateur membre des Surveillants : assignable (FR-004b)', () => {
      expect(
        moduleCapabilities(user('sa', { ...PROFILES.superAdmin, isSupervisor: true })).assignable,
      ).toBe(true);
    });

    it('compte désactivé : aucune capacité', () => {
      for (const profile of Object.values(PROFILES)) {
        expect(Object.values(moduleCapabilities(user('u', profile, false))).some(Boolean)).toBe(
          false,
        );
      }
    });

    it('admin = rôle ADMIN ou SUPER_ADMIN actif (R9)', () => {
      expect(isCoverageAdmin(user('a', PROFILES.admin))).toBe(true);
      expect(isCoverageAdmin(user('sa', PROFILES.superAdmin))).toBe(true);
      expect(isCoverageAdmin(user('a', PROFILES.admin, false))).toBe(false);
      expect(isCoverageAdmin(user('s', PROFILES.supervisor))).toBe(false);
    });

    it('éligibilité à une affectation = membre actif du groupe Surveillants (R7)', () => {
      expect(isEligibleAssignee({ active: true, isSupervisor: true })).toBe(true);
      expect(isEligibleAssignee({ active: false, isSupervisor: true })).toBe(false);
      expect(isEligibleAssignee({ active: true, isSupervisor: false })).toBe(false);
    });
  });

  describe('vue d’une affectation', () => {
    it('admin et super administrateur : vue complète, quelle que soit l’affectation', () => {
      for (const status of ['PENDING', 'ON_DUTY', 'CLOSED', 'CANCELLED'] as const) {
        expect(coverageView(user('a', PROFILES.admin), facts(status))).toBe('ADMIN');
        expect(coverageView(user('sa', PROFILES.superAdmin), facts(status))).toBe('ADMIN');
      }
    });

    it('surveillant : ses affectations et ses renforts seulement', () => {
      expect(coverageView(user('sv-1', PROFILES.supervisor), facts('ON_DUTY'))).toBe('SUPERVISOR');
      expect(
        coverageView(
          user('sv-2', PROFILES.supervisor),
          facts('ON_DUTY', { supportUserIds: new Set(['sv-2']) }),
        ),
      ).toBe('SUPERVISOR');
      expect(coverageView(user('sv-3', PROFILES.supervisor), facts('ON_DUTY'))).toBeNull();
      expect(coverageView(user('sv-3', PROFILES.supervisor), facts('PENDING'))).toBeNull();
    });

    it('enseignant : ses demandes seulement', () => {
      expect(coverageView(user('ens-1', PROFILES.teacher), facts('PENDING'))).toBe('TEACHER');
      expect(coverageView(user('ens-1', PROFILES.teacher), facts('CLOSED'))).toBe('TEACHER');
      expect(coverageView(user('ens-2', PROFILES.teacher), facts('PENDING'))).toBeNull();
      // Demandeur d'une affectation qui n'est pas une demande d'enseignant : pas de vue enseignant.
      expect(
        coverageView(
          user('ens-1', PROFILES.teacher),
          facts('ACCEPTED', { source: 'ADMIN_DIRECT' }),
        ),
      ).toBeNull();
    });

    it('autres employés et comptes désactivés : rien (FR-023b)', () => {
      expect(coverageView(user('x', PROFILES.other), facts('ON_DUTY'))).toBeNull();
      expect(coverageView(user('sv-1', PROFILES.supervisor, false), facts('ON_DUTY'))).toBeNull();
      expect(coverageView(user('a', PROFILES.admin, false), facts('ON_DUTY'))).toBeNull();
    });
  });

  describe('motif détaillé (FR-023c)', () => {
    it('visible de l’admin, du super administrateur et de l’enseignant auteur ; jamais du surveillant', () => {
      const f = facts('ON_DUTY', { supportUserIds: new Set(['sv-2']) });
      expect(canSeeReason(user('a', PROFILES.admin), f)).toBe(true);
      expect(canSeeReason(user('sa', PROFILES.superAdmin), f)).toBe(true);
      expect(canSeeReason(user('ens-1', PROFILES.teacher), f)).toBe(true);
      expect(canSeeReason(user('sv-1', PROFILES.supervisor), f)).toBe(false);
      expect(canSeeReason(user('sv-2', PROFILES.supervisor), f)).toBe(false);
      expect(canSeeReason(user('ens-2', PROFILES.teacher), f)).toBe(false);
    });
  });

  describe('actions', () => {
    it('admin : assigner, annuler ; surveillant affecté : avancement ; enseignant : modifier ou retirer en attente', () => {
      // Spec 006 : « UPDATE » proposé à l'admin (attendu modifié, consigné).
      expect(coverageActionsFor(user('a', PROFILES.admin), facts('PENDING'))).toEqual([
        'ASSIGN',
        'UPDATE',
        'EXTEND',
        'CANCEL',
        'SET_TEACHER',
      ]);
      expect(coverageActionsFor(user('sv-1', PROFILES.supervisor), facts('ACCEPTED'))).toEqual([
        'DEPART',
        'CONFIRM_PRESENCE',
        'EXTEND',
      ]);
      expect(coverageActionsFor(user('ens-1', PROFILES.teacher), facts('PENDING'))).toEqual([
        'UPDATE',
        'WITHDRAW',
      ]);
      expect(coverageActionsFor(user('ens-1', PROFILES.teacher), facts('ACCEPTED'))).toEqual([]);
    });

    it('renfort, autres surveillants et autres employés : aucune action', () => {
      expect(
        coverageActionsFor(
          user('sv-2', PROFILES.supervisor),
          facts('ON_DUTY', { supportUserIds: new Set(['sv-2']) }),
        ),
      ).toEqual([]);
      expect(coverageActionsFor(user('sv-3', PROFILES.supervisor), facts('PENDING'))).toEqual([]);
      expect(coverageActionsFor(user('x', PROFILES.other), facts('PENDING'))).toEqual([]);
    });

    it('un admin affecté cumule les actions du surveillant et de l’admin', () => {
      const actions = coverageActionsFor(user('sv-1', PROFILES.adminSupervisor), facts('ON_DUTY'));
      expect(actions).toEqual(
        expect.arrayContaining(['RELIEVE', 'REQUEST_RELIEF', 'REASSIGN', 'CANCEL']),
      );
    });
  });

  it('photo de preuve : l’auteur de la photo, l’admin et le super administrateur — jamais le renfort ni l’enseignant', () => {
    const f = facts('ON_DUTY', { supportUserIds: new Set(['sv-2']) });
    expect(canReadPresenceProof(user('sv-1', PROFILES.supervisor), f, 'sv-1')).toBe(true);
    expect(canReadPresenceProof(user('a', PROFILES.admin), f, 'sv-1')).toBe(true);
    expect(canReadPresenceProof(user('sa', PROFILES.superAdmin), f, 'sv-1')).toBe(true);
    expect(canReadPresenceProof(user('sv-2', PROFILES.supervisor), f, 'sv-1')).toBe(false);
    expect(canReadPresenceProof(user('ens-1', PROFILES.teacher), f, 'sv-1')).toBe(false);
    expect(canReadPresenceProof(user('sv-1', PROFILES.supervisor, false), f, 'sv-1')).toBe(false);
  });

  it('fin inconnue = fin de la journée locale de l’école (FR-016a), pas « sans fin »', () => {
    // Classe vide déclarée aujourd'hui (fin inconnue) et demande de demain 08:00 : pas de chevauchement.
    const declared = { startAt: new Date('2026-10-20T19:10:00Z'), plannedEndAt: null };
    const tomorrow = {
      startAt: new Date('2026-10-21T06:00:00Z'),
      plannedEndAt: new Date('2026-10-21T07:00:00Z'),
    };
    expect(slotsOverlap(declared, tomorrow, 'Europe/Paris')).toBe(false);
    expect(slotsOverlap(tomorrow, declared, 'Europe/Paris')).toBe(false);
    // Minuit de l'école, pas minuit UTC : 23:30 à Paris chevauche encore, 00:30 le lendemain non.
    const lateToday = {
      startAt: new Date('2026-10-20T21:30:00Z'),
      plannedEndAt: new Date('2026-10-20T21:45:00Z'),
    };
    const afterMidnight = {
      startAt: new Date('2026-10-20T22:30:00Z'),
      plannedEndAt: new Date('2026-10-20T23:00:00Z'),
    };
    expect(slotsOverlap(declared, lateToday, 'Europe/Paris')).toBe(true);
    expect(slotsOverlap(declared, afterMidnight, 'Europe/Paris')).toBe(false);
    // Deux fins inconnues le même jour : chevauchement.
    expect(
      slotsOverlap(
        declared,
        { startAt: new Date('2026-10-20T20:00:00Z'), plannedEndAt: null },
        'Europe/Paris',
      ),
    ).toBe(true);
  });

  it('chevauchement des créneaux', () => {
    const at = (h: number) => new Date(Date.UTC(2026, 9, 13, h));
    expect(
      slotsOverlap(
        { startAt: at(8), plannedEndAt: at(9) },
        { startAt: at(9), plannedEndAt: at(10) },
      ),
    ).toBe(false);
    expect(
      slotsOverlap(
        { startAt: at(8), plannedEndAt: at(10) },
        { startAt: at(9), plannedEndAt: at(11) },
      ),
    ).toBe(true);
    expect(
      slotsOverlap(
        { startAt: at(8), plannedEndAt: null },
        { startAt: at(15), plannedEndAt: at(16) },
      ),
    ).toBe(true);
    expect(
      slotsOverlap(
        { startAt: at(15), plannedEndAt: null },
        { startAt: at(8), plannedEndAt: at(9) },
      ),
    ).toBe(false);
  });
});

describe('Délai d’arrivée des affectations', () => {
  const now = new Date(Date.UTC(2026, 9, 13, 8, 0));
  const durations = { takeoverMinutes: 2, arrivalMinutes: 5 };

  it('assignation par l’admin : délai d’arrivée', () => {
    const arrival = nextCoverageDeadline(
      NO_DEADLINE,
      [{ from: 'PENDING', to: 'ACCEPTED', action: 'ASSIGN', actor: 'ADMIN' }],
      durations,
      now,
      now,
      20,
    );
    expect(arrival).toMatchObject({
      currentStage: 'ARRIVAL',
      currentDueAt: new Date(now.getTime() + 5 * 60_000),
      overdueStage: null,
    });
  });

  it('affectation planifiée plus tard : le délai d’arrivée part de l’heure de début', () => {
    const start = new Date(now.getTime() + 60 * 60_000);
    const arrival = nextCoverageDeadline(
      NO_DEADLINE,
      [{ from: 'PENDING', to: 'ACCEPTED', action: 'ASSIGN', actor: 'ADMIN' }],
      durations,
      start,
      now,
      20,
    );
    expect(arrival.currentDueAt).toEqual(new Date(start.getTime() + 5 * 60_000));
  });

  it('en route ou prolongation : le délai continue ; présence : plus de délai', () => {
    const running = {
      currentStage: 'ARRIVAL' as const,
      currentDueAt: now,
      warnAt: now,
      overdueStage: null,
    };
    expect(
      nextCoverageDeadline(
        running,
        [{ from: 'ACCEPTED', to: 'EN_ROUTE', action: 'DEPART', actor: 'ASSIGNEE' }],
        durations,
        now,
        now,
        20,
      ),
    ).toBe(running);
    expect(
      nextCoverageDeadline(
        running,
        [{ from: 'ACCEPTED', to: 'ACCEPTED', action: 'EXTEND', actor: 'ASSIGNEE' }],
        durations,
        now,
        now,
        20,
      ),
    ).toBe(running);
    expect(
      nextCoverageDeadline(
        running,
        [{ from: 'EN_ROUTE', to: 'ON_DUTY', action: 'CONFIRM_PRESENCE', actor: 'ASSIGNEE' }],
        durations,
        now,
        now,
        20,
      ),
    ).toEqual(NO_DEADLINE);
  });

  it('« en attente » ne porte pas de délai sur la demande : il est dans CoverageReminder (R2)', () => {
    const pending = nextCoverageDeadline(
      NO_DEADLINE,
      [{ from: 'PENDING', to: 'PENDING', action: 'UPDATE', actor: 'REQUESTER_TEACHER' }],
      durations,
      now,
      now,
      20,
    );
    expect(pending).toEqual(NO_DEADLINE);
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
    expect(
      verifyQrToken(key, token.replace(classId, '6f1c2a34-1111-4222-8333-944455556667')),
    ).toBeNull();
    expect(verifyQrToken(qrKeyFrom('autre-secret-0123456789abcdef0123456789'), token)).toBeNull();
    expect(verifyQrToken(key, 'n’importe quoi')).toBeNull();
    expect(verifyQrToken(key, `${token}x`)).toBeNull();
    expect(verifyQrToken(key, undefined)).toBeNull();
  });
});
