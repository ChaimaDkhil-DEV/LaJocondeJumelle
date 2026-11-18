/**
 * Conflits d'horaires (020, research R3) : fonction pure qui explique un refus. La garantie, elle, vient de la
 * base (contraintes d'exclusion de la migration 0031) ; cette vérification préalable sert à lister chaque
 * conflit de façon lisible. Intervalles [début, fin) : deux séances bout à bout ne se chevauchent pas.
 */

export interface ProposedSession {
  /** Présent quand on modifie une séance existante : elle ne se compare pas à elle-même. */
  id?: string;
  teacherId: string;
  classId: string;
  startAt: Date;
  endAt: Date;
}

export interface ExistingSession {
  id: string;
  teacherId: string;
  classId: string;
  startAt: Date;
  endAt: Date;
  status: 'SCHEDULED' | 'CANCELLED';
}

export type ConflictKind = 'TEACHER' | 'CLASS';

export interface ConflictFound<E extends ExistingSession = ExistingSession, P extends ProposedSession = ProposedSession> {
  kind: ConflictKind;
  existing: E;
  proposed: P;
}

const overlaps = (a: { startAt: Date; endAt: Date }, b: { startAt: Date; endAt: Date }) => a.startAt < b.endAt && b.startAt < a.endAt;

/**
 * Conflits entre les séances proposées et les séances existantes, classés par début de la séance proposée.
 * Les séances proposées d'un même envoi tombent à des dates différentes (une par semaine) : elles ne se
 * comparent pas entre elles.
 */
export function findConflicts<E extends ExistingSession, P extends ProposedSession>(proposed: readonly P[], existing: readonly E[]): ConflictFound<E, P>[] {
  const found: ConflictFound<E, P>[] = [];
  for (const p of [...proposed].sort((a, b) => a.startAt.getTime() - b.startAt.getTime())) {
    for (const e of existing) {
      if (e.status !== 'SCHEDULED' || e.id === p.id || !overlaps(p, e)) continue;
      if (e.teacherId === p.teacherId) found.push({ kind: 'TEACHER', existing: e, proposed: p });
      if (e.classId === p.classId) found.push({ kind: 'CLASS', existing: e, proposed: p });
    }
  }
  return found;
}
