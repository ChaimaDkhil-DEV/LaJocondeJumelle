import { findConflicts, type ExistingSession, type ProposedSession } from '../../src/timetable/domain/conflicts';

/** T013 — Conflits d'horaires (020, research R3) : même enseignant ou même classe, intervalles [début, fin). */

const at = (time: string) => new Date(`2026-11-23T${time}:00.000Z`);
const T1 = 'teacher-1';
const T2 = 'teacher-2';
const C1 = 'class-1';
const C2 = 'class-2';

const existing = (over: Partial<ExistingSession> = {}): ExistingSession => ({
  id: 's-1',
  teacherId: T1,
  classId: C1,
  startAt: at('08:00'),
  endAt: at('09:00'),
  status: 'SCHEDULED',
  ...over,
});
const proposed = (over: Partial<ProposedSession> = {}): ProposedSession => ({
  teacherId: T1,
  classId: C1,
  startAt: at('08:00'),
  endAt: at('09:00'),
  ...over,
});

describe('findConflicts', () => {
  it('aucun conflit pour des séances bout à bout', () => {
    expect(findConflicts([proposed({ startAt: at('09:00'), endAt: at('10:00') })], [existing()])).toEqual([]);
    expect(findConflicts([proposed({ startAt: at('07:00'), endAt: at('08:00') })], [existing()])).toEqual([]);
  });

  it('conflit d’enseignant quand le même enseignant chevauche, dans une autre classe', () => {
    const p = proposed({ classId: C2, startAt: at('08:30'), endAt: at('09:30') });
    expect(findConflicts([p], [existing()])).toEqual([{ kind: 'TEACHER', existing: existing(), proposed: p }]);
  });

  it('conflit de classe quand la même classe chevauche, avec un autre enseignant', () => {
    const p = proposed({ teacherId: T2, startAt: at('08:59'), endAt: at('09:30') });
    expect(findConflicts([p], [existing()])).toEqual([{ kind: 'CLASS', existing: existing(), proposed: p }]);
  });

  it('les deux conflits quand enseignant et classe chevauchent', () => {
    const p = proposed({ startAt: at('08:15'), endAt: at('08:45') });
    expect(findConflicts([p], [existing()]).map((c) => c.kind)).toEqual(['TEACHER', 'CLASS']);
  });

  it('une séance englobante est un conflit', () => {
    expect(findConflicts([proposed({ classId: C2, startAt: at('07:00'), endAt: at('12:00') })], [existing()])).toHaveLength(1);
  });

  it('ignore les séances annulées', () => {
    expect(findConflicts([proposed()], [existing({ status: 'CANCELLED' })])).toEqual([]);
  });

  it('ignore la séance elle-même quand on la modifie', () => {
    expect(findConflicts([proposed({ id: 's-1', startAt: at('08:30'), endAt: at('09:30') })], [existing()])).toEqual([]);
  });

  it('classe les conflits par début de la séance proposée', () => {
    const later = existing({ id: 's-2', startAt: at('14:00'), endAt: at('15:00') });
    const pLate = proposed({ classId: C2, startAt: at('14:30'), endAt: at('15:30') });
    const pEarly = proposed({ classId: C2, startAt: at('08:30'), endAt: at('09:30') });
    expect(findConflicts([pLate, pEarly], [later, existing()]).map((c) => c.existing.id)).toEqual(['s-1', 's-2']);
  });
});
