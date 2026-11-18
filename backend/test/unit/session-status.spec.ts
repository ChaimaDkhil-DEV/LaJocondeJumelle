import {
  sessionStatus,
  type StatusAnnounced,
  type StatusArrival,
  type StatusDeparture,
  type StatusFacts,
  type StatusSession,
} from '../../src/attendance/domain/session-status';

/**
 * T029 — Statut d'une séance (020, research R5, spec US3). Fonction pure : « maintenant » et les réglages sont
 * des paramètres ; les heures sont en UTC dans ces tests (le fuseau ne joue aucun rôle dans les règles).
 */

const at = (time: string) => new Date(`2026-11-23T${time}.000Z`);
const t = (hhmm: string) => at(`${hhmm}:00`);
const CLASS = 'class-3a';
const OTHER = 'class-4b';
const RULES = { lateThresholdMinutes: 5, toleranceMinutes: 10 };

const session = (over: Partial<StatusSession> = {}): StatusSession => ({ startAt: t('08:00'), endAt: t('09:00'), classId: CLASS, cancelled: false, ...over });
const scan = (time: string, classId = CLASS): StatusArrival => ({ status: 'ARRIVED', arrivedAt: t(time), recordedAt: t(time), classId });
const facts = (over: Partial<StatusFacts> = {}): StatusFacts => ({ arrivals: [], departures: [], announced: [], emptyClassAt: [], ...over });
const status = (f: StatusFacts, now: string, s = session(), rules = RULES) => sessionStatus(s, f, t(now), rules);

describe('sessionStatus — annulation et absences justifiées', () => {
  it('une séance annulée est « Séance annulée », quels que soient les faits', () => {
    expect(status(facts(), '10:00', session({ cancelled: true }))).toMatchObject({ status: 'CANCELLED' });
    expect(status(facts({ arrivals: [scan('07:50')] }), '08:30', session({ cancelled: true }))).toMatchObject({ status: 'CANCELLED' });
  });

  it('une absence annoncée qui couvre la séance : « Absence justifiée », jamais « Non arrivé »', () => {
    const absence: StatusAnnounced = { requestId: 'r-1', type: 'ABSENCE', startAt: t('07:30'), plannedEndAt: null };
    expect(status(facts({ announced: [absence] }), '10:00')).toEqual({ status: 'EXCUSED', arrivedAt: null, lateMinutes: null, lateReason: null, requestId: 'r-1' });
  });

  it('une absence annoncée terminée avant la séance ne la justifie pas', () => {
    const absence: StatusAnnounced = { requestId: 'r-1', type: 'ABSENCE', startAt: t('07:00'), plannedEndAt: t('08:00') };
    expect(status(facts({ announced: [absence] }), '08:30')).toMatchObject({ status: 'NOT_ARRIVED' });
  });

  it('une absence saisie par l’administration ce jour-là (n’importe quelle classe) justifie la séance', () => {
    const absent: StatusArrival = { status: 'ABSENT', arrivedAt: null, recordedAt: t('08:20'), classId: OTHER };
    expect(status(facts({ arrivals: [absent] }), '08:30')).toMatchObject({ status: 'EXCUSED' });
  });
});

describe('sessionStatus — qualification par une personne (D4)', () => {
  it('« à l’heure » saisi ou corrigé dans la classe de la séance : « Présent »', () => {
    const manual: StatusArrival = { status: 'ON_TIME', arrivedAt: null, recordedAt: t('10:00'), classId: CLASS };
    expect(status(facts({ arrivals: [manual] }), '10:05')).toMatchObject({ status: 'PRESENT', lateReason: null });
  });

  it('« en retard » avec une heure : « En retard », minutes comptées depuis le début', () => {
    const manual: StatusArrival = { status: 'LATE', arrivedAt: t('08:25'), recordedAt: t('10:00'), classId: CLASS };
    expect(status(facts({ arrivals: [manual] }), '10:05')).toEqual({
      status: 'LATE',
      arrivedAt: t('08:25'),
      lateMinutes: 25,
      lateReason: 'QUALIFIED',
      requestId: null,
    });
  });

  it('« en retard » sans heure : « En retard » sans minutes', () => {
    const manual: StatusArrival = { status: 'LATE', arrivedAt: null, recordedAt: t('10:00'), classId: CLASS };
    expect(status(facts({ arrivals: [manual] }), '10:05')).toMatchObject({ status: 'LATE', arrivedAt: null, lateMinutes: null, lateReason: 'QUALIFIED' });
  });

  it('la qualification l’emporte sur le calcul : un scan tardif qualifié « à l’heure » reste « Présent »', () => {
    const qualified: StatusArrival = { status: 'ON_TIME', arrivedAt: t('08:20'), recordedAt: t('08:20'), classId: CLASS };
    expect(status(facts({ arrivals: [qualified] }), '08:30')).toMatchObject({ status: 'PRESENT' });
  });

  it('une qualification datée d’après la fin de la séance ne la concerne pas', () => {
    const later: StatusArrival = { status: 'ON_TIME', arrivedAt: t('14:00'), recordedAt: t('14:00'), classId: CLASS };
    expect(status(facts({ arrivals: [later] }), '14:30')).toMatchObject({ status: 'NOT_ARRIVED' });
  });
});

describe('sessionStatus — arrivée scannée', () => {
  it('présent dans l’établissement avant le début : « Présent »', () => {
    expect(status(facts({ arrivals: [scan('07:50', OTHER)] }), '08:01')).toMatchObject({ status: 'PRESENT', arrivedAt: t('07:50'), lateMinutes: null });
  });

  it('arrivée au seuil de retard (5 min) : « Présent » ; une minute après : « En retard » (6 min)', () => {
    expect(status(facts({ arrivals: [scan('08:05')] }), '08:30')).toMatchObject({ status: 'PRESENT', arrivedAt: t('08:05') });
    expect(status(facts({ arrivals: [scan('08:06')] }), '08:30')).toMatchObject({
      status: 'LATE',
      arrivedAt: t('08:06'),
      lateMinutes: 6,
      lateReason: 'ARRIVAL',
    });
  });

  it('arrivée après la tolérance : « En retard » (12 min), plus « Non arrivé »', () => {
    expect(status(facts({ arrivals: [scan('08:12')] }), '08:15')).toMatchObject({ status: 'LATE', lateMinutes: 12 });
  });

  it('arrivée après la fin de la séance : la séance reste « Non arrivé »', () => {
    expect(status(facts({ arrivals: [scan('09:10')] }), '09:15')).toMatchObject({ status: 'NOT_ARRIVED', arrivedAt: null });
  });

  it('saisie manuelle « arrivée » sans heure : la présence compte à partir de l’heure de saisie', () => {
    const manual: StatusArrival = { status: 'ARRIVED', arrivedAt: null, recordedAt: t('08:20'), classId: OTHER };
    expect(status(facts({ arrivals: [manual] }), '08:30')).toMatchObject({ status: 'LATE', arrivedAt: t('08:20'), lateMinutes: 20 });
  });

  it('seuil de retard à 0 : une minute après le début est un retard', () => {
    const rules = { lateThresholdMinutes: 0, toleranceMinutes: 0 };
    expect(status(facts({ arrivals: [scan('08:00')] }), '08:30', session(), rules)).toMatchObject({ status: 'PRESENT' });
    expect(status(facts({ arrivals: [scan('08:01')] }), '08:30', session(), rules)).toMatchObject({ status: 'LATE', lateMinutes: 1 });
  });
});

describe('sessionStatus — sans arrivée : à venir, attendu, non arrivé', () => {
  it('avant le début : « À venir »', () => {
    expect(status(facts(), '07:59')).toMatchObject({ status: 'UPCOMING' });
  });

  it('avant le début, même déjà arrivé dans l’établissement : « À venir » (il peut repartir d’ici là)', () => {
    expect(status(facts({ arrivals: [scan('07:30', OTHER)] }), '07:45')).toMatchObject({ status: 'UPCOMING', arrivedAt: null });
    const qualified: StatusArrival = { status: 'ON_TIME', arrivedAt: null, recordedAt: t('07:40'), classId: CLASS };
    expect(status(facts({ arrivals: [qualified] }), '07:45')).toMatchObject({ status: 'UPCOMING' });
  });

  it('jamais « Non arrivé » avant la fin de la tolérance : « Attendu » jusqu’à 08:09:59.999', () => {
    expect(status(facts(), '08:00')).toMatchObject({ status: 'EXPECTED' });
    expect(sessionStatus(session(), facts(), new Date(t('08:10').getTime() - 1), RULES)).toMatchObject({ status: 'EXPECTED' });
  });

  it('à la fin de la tolérance : « Non arrivé »', () => {
    expect(status(facts(), '08:10')).toMatchObject({ status: 'NOT_ARRIVED' });
  });

  it('tolérance à 0 : « Non arrivé » dès le début', () => {
    expect(status(facts(), '08:00', session(), { lateThresholdMinutes: 0, toleranceMinutes: 0 })).toMatchObject({ status: 'NOT_ARRIVED' });
  });

  it('un jour passé ne laisse jamais « À venir » ni « Attendu »', () => {
    expect(sessionStatus(session(), facts(), new Date('2026-11-25T10:00:00.000Z'), RULES)).toMatchObject({ status: 'NOT_ARRIVED' });
  });
});

describe('sessionStatus — classe déclarée vide par un surveillant (D2)', () => {
  it('avant l’arrivée de l’enseignant : « En retard » (classe vide), même avant la tolérance', () => {
    expect(status(facts({ emptyClassAt: [t('08:03')] }), '08:05')).toMatchObject({ status: 'LATE', arrivedAt: null, lateReason: 'EMPTY_CLASS' });
  });

  it('puis l’enseignant scanne : il reste « En retard » avec son heure d’arrivée', () => {
    expect(status(facts({ emptyClassAt: [t('08:03')], arrivals: [scan('08:04')] }), '08:30')).toMatchObject({
      status: 'LATE',
      arrivedAt: t('08:04'),
      lateMinutes: 4,
      lateReason: 'EMPTY_CLASS',
    });
  });

  it('et s’il n’arrive jamais : « Non arrivé » à la fin de la tolérance', () => {
    expect(status(facts({ emptyClassAt: [t('08:03')] }), '08:10')).toMatchObject({ status: 'NOT_ARRIVED' });
  });

  it('une déclaration avant le début ou après la fin de la séance ne compte pas', () => {
    expect(status(facts({ emptyClassAt: [t('07:55')] }), '08:05')).toMatchObject({ status: 'EXPECTED' });
    expect(status(facts({ emptyClassAt: [t('09:05')], arrivals: [scan('07:50')] }), '09:10')).toMatchObject({ status: 'PRESENT' });
  });

  it('enseignant déjà dans l’établissement, classe déclarée vide : « En retard », jamais « Non arrivé »', () => {
    const f = facts({ arrivals: [scan('07:50', OTHER)], emptyClassAt: [t('08:03')] });
    expect(status(f, '08:30')).toMatchObject({ status: 'LATE', arrivedAt: null, lateReason: 'EMPTY_CLASS' });
  });

  it('puis il scanne le QR de cette classe : « En retard » avec cette heure d’arrivée', () => {
    const f = facts({ arrivals: [scan('07:50', OTHER), scan('08:07')], emptyClassAt: [t('08:03')] });
    expect(status(f, '08:30')).toMatchObject({ status: 'LATE', arrivedAt: t('08:07'), lateMinutes: 7, lateReason: 'EMPTY_CLASS' });
  });

  it('déjà arrivé dans cette classe avant la déclaration : reste « Présent »', () => {
    const f = facts({ arrivals: [scan('07:50')], emptyClassAt: [t('08:03')] });
    expect(status(f, '08:30')).toMatchObject({ status: 'PRESENT' });
  });
});

describe('sessionStatus — retard annoncé', () => {
  const lateness: StatusAnnounced = { requestId: 'r-2', type: 'LATENESS', startAt: t('08:00'), plannedEndAt: t('08:30') };

  it('sans arrivée : « En retard » (annoncé) jusqu’à la fin de la séance, pas « Non arrivé »', () => {
    expect(status(facts({ announced: [lateness] }), '08:20')).toMatchObject({ status: 'LATE', lateReason: 'ANNOUNCED', requestId: 'r-2' });
    expect(status(facts({ announced: [lateness] }), '08:59')).toMatchObject({ status: 'LATE', lateReason: 'ANNOUNCED' });
  });

  it('jamais arrivé à la fin de la séance : « Non arrivé »', () => {
    expect(status(facts({ announced: [lateness] }), '09:00')).toMatchObject({ status: 'NOT_ARRIVED' });
  });

  it('arrivé ensuite : « En retard » avec les minutes', () => {
    expect(status(facts({ announced: [lateness], arrivals: [scan('08:25')] }), '08:30')).toMatchObject({
      status: 'LATE',
      lateMinutes: 25,
      lateReason: 'ARRIVAL',
      requestId: 'r-2',
    });
  });
});

describe('sessionStatus — plusieurs séances, départs et retours (019)', () => {
  const afternoon = session({ startAt: t('14:00'), endAt: t('15:00') });
  const leftAt11: StatusDeparture = { departedAt: t('11:00'), returnedAt: null };

  it('parti à 11:00 sans retour : séance de 08:00 « Présent », séance de 14:00 « Non arrivé »', () => {
    const f = facts({ arrivals: [scan('07:55')], departures: [leftAt11] });
    expect(status(f, '14:10')).toMatchObject({ status: 'PRESENT' });
    expect(status(f, '14:10', afternoon)).toMatchObject({ status: 'NOT_ARRIVED' });
  });

  it('revenu à 14:20 : séance de 14:00 « En retard » (20 min)', () => {
    const f = facts({ arrivals: [scan('07:55')], departures: [{ departedAt: t('11:00'), returnedAt: t('14:20') }] });
    expect(status(f, '14:30', afternoon)).toMatchObject({ status: 'LATE', arrivedAt: t('14:20'), lateMinutes: 20 });
  });

  it('revenu avant le début : « Présent »', () => {
    const f = facts({ arrivals: [scan('07:55')], departures: [{ departedAt: t('11:00'), returnedAt: t('13:50') }] });
    expect(status(f, '14:30', afternoon)).toMatchObject({ status: 'PRESENT' });
  });

  it('arrivé puis reparti avant le début, sans retour : « Attendu » puis « Non arrivé »', () => {
    const f = facts({ arrivals: [scan('07:30')], departures: [{ departedAt: t('07:45'), returnedAt: null }] });
    expect(status(f, '08:05')).toMatchObject({ status: 'EXPECTED' });
    expect(status(f, '08:10')).toMatchObject({ status: 'NOT_ARRIVED' });
  });

  it('une qualification du matin ne vaut pas pour l’après-midi après un départ', () => {
    const qualified: StatusArrival = { status: 'ON_TIME', arrivedAt: t('07:55'), recordedAt: t('07:55'), classId: CLASS };
    const f = facts({ arrivals: [qualified], departures: [leftAt11] });
    expect(status(f, '14:10', afternoon)).toMatchObject({ status: 'NOT_ARRIVED' });
  });
});
