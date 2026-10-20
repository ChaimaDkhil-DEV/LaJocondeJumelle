import {
  resolveDeclaration,
  type ExistingCoverage,
} from '../../src/coverage/domain/coverage-duplicates';

/** T060 — Rattachement d'une déclaration de classe vide (data-model §6, FR-015d à FR-015g). */

const now = new Date('2026-10-20T08:00:00Z'); // 10:00 à Paris
const endOfDay = new Date('2026-10-20T22:00:00Z');
const window = { startAt: now, plannedEndAt: endOfDay };
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 20, h - 2, m)); // heure de Paris (UTC+2)

function existing(id: string, extra: Partial<ExistingCoverage> = {}): ExistingCoverage {
  return {
    id,
    status: 'PENDING',
    teacherId: 'ens-1',
    startAt: at(10),
    plannedEndAt: at(11),
    ...extra,
  };
}

describe('Déclaration d’une classe vide : rattachement et doublons', () => {
  it('aucune affectation sur la classe : création', () => {
    expect(resolveDeclaration({ teacherId: null, window }, [])).toEqual({ outcome: 'CREATED' });
    expect(resolveDeclaration({ teacherId: 'ens-1', window }, [])).toEqual({ outcome: 'CREATED' });
  });

  it('enseignant précisé, sa demande « en attente » : rattachement (FR-015d)', () => {
    expect(resolveDeclaration({ teacherId: 'ens-1', window }, [existing('a')])).toEqual({
      outcome: 'ATTACHED',
      targetId: 'a',
    });
  });

  it.each(['ACCEPTED', 'EN_ROUTE', 'LATE'] as const)(
    'enseignant précisé, sa demande %s : rien de modifié (FR-015e)',
    (status) => {
      expect(
        resolveDeclaration({ teacherId: 'ens-1', window }, [existing('a', { status })]),
      ).toEqual({
        outcome: 'ALREADY_ASSIGNED',
        targetId: 'a',
      });
    },
  );

  it.each(['ON_DUTY', 'RELIEF_PENDING'] as const)(
    'affectation %s sur la classe : renfort, quel que soit l’enseignant (FR-015f)',
    (status) => {
      for (const teacherId of [null, 'ens-1', 'ens-2']) {
        expect(
          resolveDeclaration({ teacherId, window }, [
            existing('a', { status, teacherId: 'ens-9' }),
          ]),
        ).toEqual({
          outcome: 'SUPPORT',
          targetId: 'a',
        });
      }
    },
  );

  it('le renfort l’emporte sur un rattachement possible', () => {
    const candidates = [
      existing('pending'),
      existing('onsite', { status: 'ON_DUTY', teacherId: null, plannedEndAt: null }),
    ];
    expect(resolveDeclaration({ teacherId: 'ens-1', window }, candidates)).toEqual({
      outcome: 'SUPPORT',
      targetId: 'onsite',
    });
  });

  it.each(['PENDING', 'ACCEPTED', 'EN_ROUTE', 'LATE'] as const)(
    'enseignant non précisé, demande %s existante : proposition de rattachement à l’admin (FR-015g)',
    (status) => {
      expect(resolveDeclaration({ teacherId: null, window }, [existing('a', { status })])).toEqual({
        outcome: 'MERGE_PROPOSED',
        targetId: 'a',
      });
    },
  );

  it('enseignant précisé mais demande d’un autre enseignant : création distincte', () => {
    expect(resolveDeclaration({ teacherId: 'ens-2', window }, [existing('a')])).toEqual({
      outcome: 'CREATED',
    });
  });

  it('chevauchement sur [maintenant, fin de journée) ; fin inconnue = jusqu’à la clôture', () => {
    // Plage déjà finie : ignorée.
    expect(
      resolveDeclaration({ teacherId: 'ens-1', window }, [
        existing('past', { startAt: at(8), plannedEndAt: at(9) }),
      ]),
    ).toEqual({
      outcome: 'CREATED',
    });
    // Plage qui commence plus tard dans la journée : chevauche.
    expect(
      resolveDeclaration({ teacherId: 'ens-1', window }, [
        existing('later', { startAt: at(15), plannedEndAt: at(16) }),
      ]),
    ).toEqual({
      outcome: 'ATTACHED',
      targetId: 'later',
    });
    // Demain : hors de la journée.
    const tomorrow = new Date('2026-10-21T06:00:00Z');
    expect(
      resolveDeclaration({ teacherId: 'ens-1', window }, [
        existing('tomorrow', { startAt: tomorrow, plannedEndAt: null }),
      ]),
    ).toEqual({
      outcome: 'CREATED',
    });
    // Commencée hier, sans fin : chevauche.
    expect(
      resolveDeclaration({ teacherId: null, window }, [
        existing('open', {
          status: 'ON_DUTY',
          startAt: new Date('2026-10-19T08:00:00Z'),
          plannedEndAt: null,
        }),
      ]),
    ).toEqual({ outcome: 'SUPPORT', targetId: 'open' });
  });

  it('statuts finaux ignorés ; à égalité, la plage qui commence le plus tôt', () => {
    const candidates = [
      existing('done', { status: 'CLOSED' }),
      existing('cancelled', { status: 'CANCELLED' }),
      existing('second', { startAt: at(11), plannedEndAt: at(12) }),
      existing('first', { startAt: at(10, 30), plannedEndAt: at(12) }),
    ];
    expect(resolveDeclaration({ teacherId: 'ens-1', window }, candidates)).toEqual({
      outcome: 'ATTACHED',
      targetId: 'first',
    });
  });
});
