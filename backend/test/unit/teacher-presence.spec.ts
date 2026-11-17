import { presenceOf, type ArrivalFact, type DepartureFact } from '../../src/attendance/domain/presence';

/**
 * Présence d'un enseignant dans l'établissement (019) : déduite de ses pointages du jour et de ses départs.
 * Un pointage « absent » ne compte pas ; un départ non suivi d'un retour le fait sortir de la liste.
 */
describe('Présence d’un enseignant dans l’établissement', () => {
  const at = (hhmm: string) => new Date(`2026-11-17T${hhmm}:00.000Z`);
  const VIOLET = { id: 'k1', name: '1ère année Violet', room: 'Salle 12' };
  const BLEU = { id: 'k2', name: '2e année Bleu', room: null };

  const arrival = (hhmm: string | null, overrides: Partial<ArrivalFact> = {}): ArrivalFact => ({
    status: 'ARRIVED',
    arrivedAt: hhmm ? at(hhmm) : null,
    recordedAt: at(hhmm ?? '09:30'),
    class: VIOLET,
    ...overrides,
  });
  const departure = (hhmm: string, returned: string | null = null): DepartureFact => ({
    id: `d-${hhmm}`,
    departedAt: at(hhmm),
    returnedAt: returned ? at(returned) : null,
  });

  it('sans pointage : pas arrivé', () => {
    expect(presenceOf([], [])).toEqual({ state: 'NOT_ARRIVED', firstArrivalAt: null, lastClass: null, lastSeenAt: null, openDeparture: null });
  });

  it('un pointage « absent » ne vaut pas présence', () => {
    expect(presenceOf([arrival(null, { status: 'ABSENT' })], []).state).toBe('NOT_ARRIVED');
  });

  it('une arrivée : présent, avec son heure et sa classe', () => {
    const p = presenceOf([arrival('08:02')], []);
    expect(p.state).toBe('PRESENT');
    expect(p.firstArrivalAt).toEqual(at('08:02'));
    expect(p.lastClass).toEqual(VIOLET);
    expect(p.lastSeenAt).toEqual(at('08:02'));
  });

  it('plusieurs classes : une seule présence, première heure d’arrivée et dernière classe', () => {
    const p = presenceOf([arrival('10:15', { class: BLEU }), arrival('08:02')], []);
    expect(p.state).toBe('PRESENT');
    expect(p.firstArrivalAt).toEqual(at('08:02'));
    expect(p.lastClass).toEqual(BLEU);
    expect(p.lastSeenAt).toEqual(at('10:15'));
  });

  it('saisie manuelle sans heure : présent, heure d’arrivée inconnue, classée par son heure de saisie', () => {
    const p = presenceOf([arrival(null, { status: 'ON_TIME' })], []);
    expect(p.state).toBe('PRESENT');
    expect(p.firstArrivalAt).toBeNull();
    expect(p.lastSeenAt).toEqual(at('09:30'));
  });

  it('un départ sans retour : parti', () => {
    const p = presenceOf([arrival('08:02')], [departure('12:10')]);
    expect(p.state).toBe('DEPARTED');
    expect(p.openDeparture?.departedAt).toEqual(at('12:10'));
    expect(p.firstArrivalAt).toEqual(at('08:02'));
  });

  it('un départ suivi d’un retour : de nouveau présent', () => {
    const p = presenceOf([arrival('08:02')], [departure('12:10', '13:30')]);
    expect(p.state).toBe('PRESENT');
    expect(p.openDeparture).toBeNull();
  });

  it('deux départs dans la journée : seul le départ sans retour compte', () => {
    const p = presenceOf([arrival('08:02')], [departure('12:10', '13:30'), departure('16:00')]);
    expect(p.state).toBe('DEPARTED');
    expect(p.openDeparture?.departedAt).toEqual(at('16:00'));
  });

  it('un départ sans aucune arrivée valable ne rend pas « parti »', () => {
    expect(presenceOf([arrival(null, { status: 'ABSENT' })], [departure('12:10')]).state).toBe('NOT_ARRIVED');
  });
});
