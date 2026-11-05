import {
  correctionRefusal,
  currentClassState,
  matchArrival,
  type AnnouncedRequest,
} from '../../src/attendance/domain/attendance-matching';

/** Pointage des enseignants : rattachement à une demande annoncée, corrections, état de la classe. */

const at = (hhmm: string) => new Date(`2026-11-05T${hhmm}:00.000Z`);

function request(extra: Partial<AnnouncedRequest> = {}): AnnouncedRequest {
  return {
    requestId: 'r1',
    type: 'LATENESS',
    teacherId: 'ens-1',
    substituteTeacherId: null,
    startAt: at('08:00'),
    plannedEndAt: at('10:00'),
    ...extra,
  };
}

describe('Rattachement d’une arrivée à une demande annoncée', () => {
  it('aucune demande : arrivée sans jugement (pas de référence horaire)', () => {
    expect(matchArrival('ens-1', at('09:30'), [])).toEqual({ kind: 'NONE' });
  });

  it('retard annoncé : minutes écoulées depuis l’heure de début annoncée', () => {
    expect(matchArrival('ens-1', at('08:25'), [request()])).toEqual({ kind: 'ANNOUNCED_LATENESS', requestId: 'r1', lateMinutes: 25 });
  });

  it('arrivée avant l’heure annoncée : 0 minute, jamais négatif', () => {
    expect(matchArrival('ens-1', at('07:50'), [request()])).toEqual({ kind: 'ANNOUNCED_LATENESS', requestId: 'r1', lateMinutes: 0 });
  });

  it('arrivée après la fin annoncée du retard : les minutes restent comptées', () => {
    expect(matchArrival('ens-1', at('11:00'), [request()])).toMatchObject({ kind: 'ANNOUNCED_LATENESS', lateMinutes: 180 });
  });

  it('plusieurs demandes : la dernière commencée avant l’arrivée', () => {
    const early = request({ requestId: 'r-matin', startAt: at('08:00') });
    const late = request({ requestId: 'r-midi', startAt: at('13:00'), plannedEndAt: at('15:00') });
    expect(matchArrival('ens-1', at('13:10'), [early, late])).toMatchObject({ requestId: 'r-midi', lateMinutes: 10 });
    expect(matchArrival('ens-1', at('08:10'), [early, late])).toMatchObject({ requestId: 'r-matin', lateMinutes: 10 });
  });

  it('les demandes d’un autre enseignant sont ignorées', () => {
    expect(matchArrival('ens-2', at('08:25'), [request()])).toEqual({ kind: 'NONE' });
  });

  it('demande sans type connu : ignorée', () => {
    expect(matchArrival('ens-1', at('08:25'), [request({ type: null })])).toEqual({ kind: 'NONE' });
  });

  describe('absence annoncée', () => {
    const absence = request({ type: 'ABSENCE' });

    it('présent pendant la plage annoncée : anomalie pour l’admin', () => {
      expect(matchArrival('ens-1', at('09:00'), [absence])).toEqual({ kind: 'ANNOUNCED_ABSENCE', requestId: 'r1' });
    });

    it('présent avant le début de la plage annoncée : anomalie aussi', () => {
      expect(matchArrival('ens-1', at('07:30'), [absence])).toEqual({ kind: 'ANNOUNCED_ABSENCE', requestId: 'r1' });
    });

    it('de retour après la fin de la plage annoncée : pas d’anomalie', () => {
      expect(matchArrival('ens-1', at('10:30'), [absence])).toEqual({ kind: 'NONE' });
    });

    it('plage sans fin : couvre toute la journée', () => {
      expect(matchArrival('ens-1', at('16:00'), [request({ type: 'ABSENCE', plannedEndAt: null })])).toEqual({ kind: 'ANNOUNCED_ABSENCE', requestId: 'r1' });
    });
  });

  describe('remplaçant autorisé', () => {
    const absence = request({ type: 'ABSENCE', teacherId: 'titulaire', substituteTeacherId: 'remplacant' });

    it('présence sous l’identité du remplaçant, titulaire conservé', () => {
      expect(matchArrival('remplacant', at('09:00'), [absence])).toEqual({ kind: 'SUBSTITUTE', requestId: 'r1', titularId: 'titulaire' });
    });

    it('un autre enseignant ne peut pas se déclarer remplaçant sans autorisation', () => {
      expect(matchArrival('intrus', at('09:00'), [absence])).toEqual({ kind: 'NONE' });
    });

    it('le titulaire qui scanne reste une anomalie d’absence, pas un remplaçant', () => {
      expect(matchArrival('titulaire', at('09:00'), [absence])).toEqual({ kind: 'ANNOUNCED_ABSENCE', requestId: 'r1' });
    });

    it('une désignation sur une demande de retard n’a pas de sens : ignorée', () => {
      const lateness = request({ type: 'LATENESS', teacherId: 'titulaire', substituteTeacherId: 'remplacant' });
      expect(matchArrival('remplacant', at('09:00'), [lateness])).toEqual({ kind: 'NONE' });
    });

    it('remplaçant d’une demande et titulaire d’une autre : le remplacement l’emporte', () => {
      const own = request({ requestId: 'r-propre', type: 'LATENESS', teacherId: 'remplacant' });
      expect(matchArrival('remplacant', at('09:00'), [own, absence])).toMatchObject({ kind: 'SUBSTITUTE', requestId: 'r1' });
    });
  });
});

describe('Corrections de la surveillante', () => {
  it('un scan ne peut pas être contredit par une absence', () => {
    expect(correctionRefusal({ method: 'QR' }, { status: 'ABSENT', arrivedAtChanged: false })).toMatch(/scan valide/);
  });

  it('l’heure d’un scan est celle du serveur : non modifiable', () => {
    expect(correctionRefusal({ method: 'QR' }, { arrivedAtChanged: true })).toMatch(/heure du serveur|celle du serveur/);
  });

  it('un scan peut être qualifié « à l’heure » ou « en retard »', () => {
    expect(correctionRefusal({ method: 'QR' }, { status: 'LATE', arrivedAtChanged: false })).toBeNull();
    expect(correctionRefusal({ method: 'QR' }, { status: 'ON_TIME', arrivedAtChanged: false })).toBeNull();
  });

  it('le statut « arrivée enregistrée » appartient au scan : jamais posé à la main', () => {
    expect(correctionRefusal({ method: 'MANUAL' }, { status: 'ARRIVED', arrivedAtChanged: false })).not.toBeNull();
  });

  it('une saisie manuelle peut passer en absence et changer d’heure d’arrivée', () => {
    expect(correctionRefusal({ method: 'MANUAL' }, { status: 'ABSENT', arrivedAtChanged: false })).toBeNull();
    expect(correctionRefusal({ method: 'MANUAL' }, { arrivedAtChanged: true })).toBeNull();
  });
});

describe('État courant de la classe', () => {
  it('aucun événement : état inconnu', () => {
    expect(currentClassState([])).toBeNull();
  });

  it('classe vide puis arrivée de l’enseignant : occupée', () => {
    expect(
      currentClassState([
        { at: at('08:10'), kind: 'EMPTY' },
        { at: at('08:15'), kind: 'ARRIVAL' },
      ]),
    ).toBe('OCCUPIED');
  });

  it('arrivée puis classe déclarée vide : vide', () => {
    expect(
      currentClassState([
        { at: at('08:00'), kind: 'ARRIVAL' },
        { at: at('09:00'), kind: 'EMPTY' },
      ]),
    ).toBe('EMPTY');
  });

  it('l’ordre de la liste n’a pas d’importance : le dernier événement dans le temps l’emporte', () => {
    expect(
      currentClassState([
        { at: at('08:15'), kind: 'ARRIVAL' },
        { at: at('08:10'), kind: 'EMPTY' },
      ]),
    ).toBe('OCCUPIED');
  });
});
