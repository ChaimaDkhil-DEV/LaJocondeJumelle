/**
 * Présence d'un enseignant dans l'établissement (019), déduite de ses pointages du jour et de ses départs.
 * Fonctions pures : aucune lecture en base, aucune horloge.
 *
 * Il n'y a pas d'emploi du temps : « présent » veut dire « arrivé aujourd'hui et pas reparti ». Un
 * enseignant qui part sans scanner reste présent jusqu'à ce que l'administration saisisse son départ.
 */

export interface PresenceClass {
  id: string;
  name: string;
  room: string | null;
}

/** Un pointage du jour (une ligne par classe). */
export interface ArrivalFact {
  status: 'ARRIVED' | 'ON_TIME' | 'LATE' | 'ABSENT';
  /** Heure réelle d'arrivée ; null pour une saisie de l'administration sans heure. */
  arrivedAt: Date | null;
  recordedAt: Date;
  class: PresenceClass;
}

export interface DepartureFact {
  id: string;
  departedAt: Date;
  /** null : départ en cours. */
  returnedAt: Date | null;
}

export type PresenceState = 'NOT_ARRIVED' | 'PRESENT' | 'DEPARTED';

export interface Presence<D extends DepartureFact = DepartureFact> {
  state: PresenceState;
  /** Plus ancienne heure d'arrivée connue du jour ; null si aucune n'a été précisée. */
  firstArrivalAt: Date | null;
  /** Classe du pointage le plus récent. */
  lastClass: PresenceClass | null;
  /** Instant de ce pointage le plus récent (heure d'arrivée, à défaut heure de saisie). */
  lastSeenAt: Date | null;
  /** Départ sans retour, s'il y en a un. */
  openDeparture: D | null;
}

const seenAt = (a: ArrivalFact): Date => a.arrivedAt ?? a.recordedAt;

export function presenceOf<D extends DepartureFact>(arrivals: readonly ArrivalFact[], departures: readonly D[]): Presence<D> {
  // Un pointage « absent » constate une absence : il ne vaut pas arrivée.
  const valid = arrivals.filter((a) => a.status !== 'ABSENT');
  if (valid.length === 0) return { state: 'NOT_ARRIVED', firstArrivalAt: null, lastClass: null, lastSeenAt: null, openDeparture: null };

  const known = valid.flatMap((a) => (a.arrivedAt ? [a.arrivedAt] : []));
  const firstArrivalAt = known.length > 0 ? new Date(Math.min(...known.map((d) => d.getTime()))) : null;
  const last = valid.reduce((latest, a) => (seenAt(a).getTime() >= seenAt(latest).getTime() ? a : latest));
  const openDeparture = departures.find((d) => d.returnedAt === null) ?? null;
  return {
    state: openDeparture ? 'DEPARTED' : 'PRESENT',
    firstArrivalAt,
    lastClass: last.class,
    lastSeenAt: seenAt(last),
    openDeparture,
  };
}
