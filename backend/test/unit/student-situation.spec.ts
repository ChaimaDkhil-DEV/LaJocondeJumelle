import {
  buildSituation,
  classAt,
  endOfMinute,
  type AnnouncementFact,
  type AttendanceFact,
  type CoverageFact,
  type SessionFact,
  type SituationFacts,
} from '../../src/students/domain/situation';

/**
 * Situation d'un élève à un instant donné (021) : fonction pure, sans base ni horloge. Les heures sont en UTC ;
 * l'école est à Paris (UTC+1 en novembre) : la séance de 10h00 à 11h00 locale est 09:00 à 10:00 UTC.
 */

const d = (iso: string) => new Date(iso);
const TITULAR = { id: 'u-titulaire', displayName: 'Mme Titulaire' };
const SUBSTITUTE = { id: 'u-remplacant', displayName: 'M. Remplaçant' };
const SUPERVISOR = { id: 'u-surveillant', displayName: 'Mme Surveillante' };
const ADMIN = { id: 'u-admin', displayName: 'Direction' };

const AT = d('2026-11-12T09:42:59.999Z'); // 10:42 locale, fin de la minute

const session = (extra: Partial<SessionFact> = {}): SessionFact => ({
  id: 's1',
  teacher: TITULAR,
  subject: 'Mathématiques',
  room: 'Salle 12',
  startAt: d('2026-11-12T09:00:00Z'),
  endAt: d('2026-11-12T10:00:00Z'),
  status: 'SCHEDULED',
  cancelReason: null,
  cancelledAt: null,
  cancelledBy: null,
  ...extra,
});

const arrival = (extra: Partial<AttendanceFact> = {}): AttendanceFact => ({
  teacher: TITULAR,
  status: 'ON_TIME',
  method: 'QR',
  arrivedAt: d('2026-11-12T09:02:00Z'),
  recordedAt: d('2026-11-12T09:02:00Z'),
  comment: null,
  corrected: false,
  substituteForId: null,
  ...extra,
});

const announcement = (extra: Partial<AnnouncementFact> = {}): AnnouncementFact => ({
  requestId: 'r1',
  type: 'ABSENCE',
  teacherId: TITULAR.id,
  startAt: d('2026-11-12T08:00:00Z'),
  plannedEndAt: d('2026-11-12T16:00:00Z'),
  announcedAt: d('2026-11-11T18:00:00Z'),
  reason: 'Maladie',
  announcedLateMinutes: null,
  anonymized: false,
  currentSubstituteId: null,
  substituteEvents: [],
  ...extra,
});

const coverage = (extra: Partial<CoverageFact> = {}): CoverageFact => ({
  requestId: 'c1',
  source: 'SUPERVISOR_REPORT',
  type: 'EMPTY_CLASS',
  startAt: d('2026-11-12T09:08:00Z'),
  plannedEndAt: null,
  relievedAt: d('2026-11-12T09:35:00Z'),
  assigneeEvents: [{ at: d('2026-11-12T09:08:00Z'), seq: 1, kind: 'ASSIGNED', assigneeId: SUPERVISOR.id }],
  presences: [{ userId: SUPERVISOR.id, at: d('2026-11-12T09:08:00Z') }],
  supports: [],
  ...extra,
});

const facts = (extra: Partial<SituationFacts> = {}): SituationFacts => ({
  timeZone: 'Europe/Paris',
  student: { id: 'e1', firstName: 'Aya', lastName: 'Ben Ali', createdAt: d('2026-09-01T07:00:00Z') },
  periods: [{ classId: 'k1', startedAt: d('2026-09-01T07:00:00Z'), createdAt: d('2026-11-01T00:00:00Z'), reconstructed: false }],
  classes: { k1: { id: 'k1', name: 'CE1 A', level: '2e année', floor: 'Étage 1', room: 'Salle 12' }, k2: { id: 'k2', name: 'CE1 B', level: '2e année', floor: 'Étage 1', room: 'Salle 8' } },
  sessions: [session()],
  attendances: [],
  departures: [],
  announcements: [],
  coverages: [],
  users: { [TITULAR.id]: TITULAR, [SUBSTITUTE.id]: SUBSTITUTE, [SUPERVISOR.id]: SUPERVISOR, [ADMIN.id]: ADMIN },
  changes: [],
  ...extra,
});

describe('endOfMinute', () => {
  it('ignore les secondes et évalue à la fin de la minute demandée', () => {
    expect(endOfMinute(d('2026-11-12T09:42:10.500Z')).toISOString()).toBe('2026-11-12T09:42:59.999Z');
    expect(endOfMinute(d('2026-11-12T09:42:00.000Z')).toISOString()).toBe('2026-11-12T09:42:59.999Z');
  });
});

describe('classAt', () => {
  const p = (classId: string, startedAt: string) => ({ classId, startedAt: d(startedAt), createdAt: d('2026-11-01T00:00:00Z'), reconstructed: false });

  it('prend la dernière période commencée avant l’instant ; à la minute du changement, la nouvelle classe s’applique', () => {
    const periods = [p('a', '2026-09-01T07:00:00Z'), p('b', '2026-11-12T09:42:10Z')];
    expect(classAt(periods, d('2026-11-12T09:41:59.999Z'))?.classId).toBe('a');
    expect(classAt(periods, d('2026-11-12T09:42:59.999Z'))?.classId).toBe('b');
  });

  it('avant la première période : aucune classe', () => {
    expect(classAt([p('a', '2026-09-01T07:00:00Z')], d('2026-08-31T00:00:00Z'))).toBeNull();
  });

  it('deux périodes au même instant : l’ordre d’écriture départage, la dernière gagne', () => {
    const periods = [p('a', '2026-09-01T07:00:00Z'), p('b', '2026-11-12T09:00:00Z'), p('c', '2026-11-12T09:00:00Z')];
    expect(classAt(periods, AT)?.classId).toBe('c');
  });
});

describe('buildSituation : cas nominal', () => {
  it('séance prévue et titulaire arrivé à l’heure : classe, séance, enseignant, rien d’autre', () => {
    const s = buildSituation(facts({ attendances: [arrival()] }), AT);
    expect(s.class).toMatchObject({ availability: 'KNOWN', value: { id: 'k1', name: 'CE1 A', level: '2e année', floor: 'Étage 1', room: 'Salle 12', reconstructed: false } });
    expect(s.session).toMatchObject({ availability: 'KNOWN', value: { id: 's1', subject: 'Mathématiques', room: 'Salle 12', status: 'SCHEDULED', teacher: TITULAR } });
    expect(s.teacher.availability).toBe('KNOWN');
    expect(s.teacher.value?.arrivals).toEqual([expect.objectContaining({ teacher: TITULAR, arrivedAt: d('2026-11-12T09:02:00Z'), method: 'QR' })]);
    expect(s.teacher.value?.laterArrivals).toEqual([]);
    expect(s.announcement.availability).toBe('NONE');
    expect(s.substitute.availability).toBe('NONE');
    expect(s.supervisors.availability).toBe('NONE');
    expect(s.changes.availability).toBe('NONE');
    expect(s.moment.evaluatedAt).toEqual(AT);
  });
});

describe('buildSituation : remplaçant', () => {
  const absent = announcement({
    substituteEvents: [{ at: d('2026-11-12T07:30:00Z'), seq: 1, fromTeacherId: null, toTeacherId: SUBSTITUTE.id, byId: ADMIN.id }],
    currentSubstituteId: SUBSTITUTE.id,
  });

  it('titulaire absent annoncé, remplaçant arrivé : annonce, remplaçant en vigueur et son arrivée', () => {
    const s = buildSituation(
      facts({ announcements: [absent], attendances: [arrival({ teacher: SUBSTITUTE, arrivedAt: d('2026-11-12T09:05:00Z'), recordedAt: d('2026-11-12T09:05:00Z'), substituteForId: TITULAR.id })] }),
      AT,
    );
    expect(s.announcement).toMatchObject({ availability: 'KNOWN', value: { type: 'ABSENCE', reason: 'Maladie' } });
    expect(s.substitute).toMatchObject({ availability: 'KNOWN', value: { inForce: SUBSTITUTE, arrived: { teacher: SUBSTITUTE, arrivedAt: d('2026-11-12T09:05:00Z') } } });
    expect(s.teacher.value?.arrivals.map((a) => a.teacher.id)).toEqual([SUBSTITUTE.id]);
  });

  it('remplaçant désigné après l’instant : il n’est pas « en vigueur », il figure dans l’historique', () => {
    const later = announcement({
      substituteEvents: [{ at: d('2026-11-12T09:50:00Z'), seq: 1, fromTeacherId: null, toTeacherId: SUBSTITUTE.id, byId: ADMIN.id }],
      currentSubstituteId: SUBSTITUTE.id,
    });
    const s = buildSituation(facts({ announcements: [later] }), AT);
    expect(s.substitute.value?.inForce).toBeNull();
    expect(s.substitute.value?.previous).toEqual([expect.objectContaining({ teacher: SUBSTITUTE, madeAfterMoment: true })]);
  });

  it('remplaçant changé deux fois : celui en vigueur à l’instant, tous listés dans l’ordre', () => {
    const twice = announcement({
      substituteEvents: [
        { at: d('2026-11-12T07:30:00Z'), seq: 1, fromTeacherId: null, toTeacherId: 'u-premier', byId: ADMIN.id },
        { at: d('2026-11-12T09:30:00Z'), seq: 2, fromTeacherId: 'u-premier', toTeacherId: SUBSTITUTE.id, byId: ADMIN.id },
      ],
      currentSubstituteId: SUBSTITUTE.id,
    });
    const users = { ...facts().users, 'u-premier': { id: 'u-premier', displayName: 'M. Premier' } };
    const s = buildSituation(facts({ announcements: [twice], users }), AT);
    expect(s.substitute.value?.inForce).toEqual(SUBSTITUTE);
    expect(s.substitute.value?.previous.map((p) => p.teacher.id)).toEqual(['u-premier', SUBSTITUTE.id]);
    const before = buildSituation(facts({ announcements: [twice], users }), d('2026-11-12T09:15:59.999Z'));
    expect(before.substitute.value?.inForce?.id).toBe('u-premier');
  });

  it('remplaçant connu sans événement daté : valeur actuelle, donnée comme probable', () => {
    const s = buildSituation(facts({ announcements: [announcement({ currentSubstituteId: SUBSTITUTE.id, substituteEvents: [] })] }), AT);
    expect(s.substitute).toMatchObject({ availability: 'PROBABLE', value: { inForce: SUBSTITUTE } });
    expect(s.substitute.warning).toBeTruthy();
  });

  it('une annonce qui ne chevauche pas la séance n’est pas retenue', () => {
    const elsewhere = announcement({ startAt: d('2026-11-12T11:00:00Z'), plannedEndAt: d('2026-11-12T12:00:00Z') });
    expect(buildSituation(facts({ announcements: [elsewhere] }), AT).announcement.availability).toBe('NONE');
  });

  it('annonce anonymisée : signalée comme telle, sans motif', () => {
    const s = buildSituation(facts({ announcements: [announcement({ anonymized: true, reason: null })] }), AT);
    expect(s.announcement.value).toMatchObject({ anonymized: true, reason: null });
  });
});

describe('buildSituation : enseignant réellement présent', () => {
  it('arrivée après l’instant : aucun enseignant arrivé, l’arrivée est « plus tard »', () => {
    const s = buildSituation(facts({ attendances: [arrival({ arrivedAt: d('2026-11-12T09:50:00Z'), recordedAt: d('2026-11-12T09:50:00Z'), status: 'LATE' })] }), d('2026-11-12T09:15:59.999Z'));
    expect(s.teacher.availability).toBe('NONE');
    expect(s.teacher.value?.arrivals).toEqual([]);
    expect(s.teacher.value?.laterArrivals).toEqual([expect.objectContaining({ arrivedAt: d('2026-11-12T09:50:00Z') })]);
  });

  it('un événement de la minute demandée compte (fin de minute)', () => {
    const s = buildSituation(facts({ attendances: [arrival({ arrivedAt: d('2026-11-12T09:42:30Z'), recordedAt: d('2026-11-12T09:42:30Z') })] }), AT);
    expect(s.teacher.value?.arrivals).toHaveLength(1);
  });

  it('aucune arrivée enregistrée : « aucune arrivée enregistrée », jamais « absent »', () => {
    const s = buildSituation(facts(), AT);
    expect(s.teacher.availability).toBe('NONE');
    expect(s.teacher.value?.absences ?? []).toEqual([]);
  });

  it('une absence saisie est une absence', () => {
    const s = buildSituation(facts({ attendances: [arrival({ status: 'ABSENT', arrivedAt: null, comment: 'Maladie' })] }), AT);
    expect(s.teacher.value?.absences).toEqual([expect.objectContaining({ teacher: TITULAR })]);
    expect(s.teacher.value?.arrivals).toEqual([]);
  });

  it('arrivée sans heure : l’heure d’enregistrement est utilisée', () => {
    const s = buildSituation(facts({ attendances: [arrival({ arrivedAt: null, recordedAt: d('2026-11-12T09:20:00Z'), method: 'MANUAL' })] }), AT);
    expect(s.teacher.value?.arrivals).toEqual([expect.objectContaining({ arrivedAt: null, recordedAt: d('2026-11-12T09:20:00Z') })]);
  });

  it('arrivée corrigée : valeur corrigée affichée et marquée corrigée', () => {
    const s = buildSituation(facts({ attendances: [arrival({ corrected: true })] }), AT);
    expect(s.teacher.value?.arrivals[0].corrected).toBe(true);
  });

  it('parti de l’établissement sans retour à l’instant : signalé', () => {
    const s = buildSituation(
      facts({ attendances: [arrival()], departures: [{ teacher: TITULAR, departedAt: d('2026-11-12T09:30:00Z'), returnedAt: d('2026-11-12T09:55:00Z') }] }),
      AT,
    );
    expect(s.teacher.value?.departures).toEqual([expect.objectContaining({ teacher: TITULAR, departedAt: d('2026-11-12T09:30:00Z') })]);
    const returned = buildSituation(facts({ attendances: [arrival()], departures: [{ teacher: TITULAR, departedAt: d('2026-11-12T09:10:00Z'), returnedAt: d('2026-11-12T09:30:00Z') }] }), AT);
    expect(returned.teacher.value?.departures).toEqual([]);
  });

  it('deux séances du même enseignant le même jour dans la classe : l’arrivée est un fait de la journée', () => {
    const second = session({ id: 's2', startAt: d('2026-11-12T13:00:00Z'), endAt: d('2026-11-12T14:00:00Z') });
    const s = buildSituation(facts({ sessions: [session(), second], attendances: [arrival()] }), AT);
    expect(s.teacher.value?.dayLevelOnly).toBe(true);
    expect(buildSituation(facts({ attendances: [arrival()] }), AT).teacher.value?.dayLevelOnly).toBe(false);
  });
});

describe('buildSituation : séance', () => {
  it('aucune séance prévue : « aucune séance », la classe reste connue et les surveillants sont cherchés', () => {
    const s = buildSituation(facts({ sessions: [], coverages: [coverage({ relievedAt: null })] }), AT);
    expect(s.session.availability).toBe('NONE');
    expect(s.class.availability).toBe('KNOWN');
    expect(s.supervisors.availability).toBe('KNOWN');
    expect(s.teacher.availability).toBe('NONE');
  });

  it('séance annulée : motif, heure et auteur de l’annulation', () => {
    const cancelled = session({ status: 'CANCELLED', cancelReason: 'Sortie scolaire', cancelledAt: d('2026-11-11T16:00:00Z'), cancelledBy: ADMIN });
    const s = buildSituation(facts({ sessions: [cancelled] }), AT);
    expect(s.session.value).toMatchObject({ status: 'CANCELLED', cancellation: { reason: 'Sortie scolaire', at: d('2026-11-11T16:00:00Z'), by: ADMIN } });
  });

  it('une séance prévue l’emporte sur une séance annulée au même moment', () => {
    const cancelled = session({ id: 'old', status: 'CANCELLED', cancelReason: 'Remplacée', cancelledAt: d('2026-11-11T16:00:00Z'), cancelledBy: ADMIN });
    const replacement = session({ id: 'new', teacher: SUBSTITUTE });
    expect(buildSituation(facts({ sessions: [cancelled, replacement] }), AT).session.value?.id).toBe('new');
  });

  it('en dehors des heures de la séance : aucune séance', () => {
    expect(buildSituation(facts(), d('2026-11-12T10:30:59.999Z')).session.availability).toBe('NONE');
  });
});

describe('buildSituation : surveillants', () => {
  it('surveillant présent avant l’instant, garde non terminée : nommé avec sa présence', () => {
    const s = buildSituation(facts({ coverages: [coverage({ relievedAt: null })] }), d('2026-11-12T09:20:59.999Z'));
    expect(s.supervisors).toMatchObject({ availability: 'KNOWN', value: { source: 'SUPERVISOR_REPORT', assignee: { user: SUPERVISOR, state: 'PRESENT', presentSince: d('2026-11-12T09:08:00Z') } } });
  });

  it('garde terminée avant l’instant : aucune garde à cet instant', () => {
    expect(buildSituation(facts({ coverages: [coverage()] }), d('2026-11-12T09:40:59.999Z')).supervisors.availability).toBe('NONE');
    expect(buildSituation(facts({ coverages: [coverage()] }), d('2026-11-12T09:20:59.999Z')).supervisors.availability).toBe('KNOWN');
  });

  it('affecté sans présence enregistrée à l’instant : « affecté, présence non enregistrée »', () => {
    const noPresence = coverage({ relievedAt: null, presences: [{ userId: SUPERVISOR.id, at: d('2026-11-12T09:30:00Z') }] });
    const s = buildSituation(facts({ coverages: [noPresence] }), d('2026-11-12T09:20:59.999Z'));
    expect(s.supervisors.value?.assignee).toMatchObject({ user: SUPERVISOR, state: 'ASSIGNED_NOT_RECORDED' });
  });

  it('surveillant remplacé : celui en vigueur à l’instant', () => {
    const other = { id: 'u-autre', displayName: 'M. Autre' };
    const reassigned = coverage({
      relievedAt: null,
      assigneeEvents: [
        { at: d('2026-11-12T09:08:00Z'), seq: 1, kind: 'ASSIGNED', assigneeId: SUPERVISOR.id },
        { at: d('2026-11-12T09:30:00Z'), seq: 2, kind: 'REASSIGNED', assigneeId: other.id },
      ],
      presences: [{ userId: SUPERVISOR.id, at: d('2026-11-12T09:08:00Z') }, { userId: other.id, at: d('2026-11-12T09:31:00Z') }],
    });
    const users = { ...facts().users, [other.id]: other };
    expect(buildSituation(facts({ coverages: [reassigned], users }), d('2026-11-12T09:20:59.999Z')).supervisors.value?.assignee?.user).toEqual(SUPERVISOR);
    expect(buildSituation(facts({ coverages: [reassigned], users }), AT).supervisors.value?.assignee?.user).toEqual(other);
  });

  it('renfort libéré avant l’instant : non listé ; renfort actif : listé', () => {
    const supported = coverage({
      relievedAt: null,
      supports: [
        { userId: 'u-renfort', joinedAt: d('2026-11-12T09:10:00Z'), releasedAt: d('2026-11-12T09:30:00Z') },
        { userId: 'u-actif', joinedAt: d('2026-11-12T09:12:00Z'), releasedAt: null },
      ],
    });
    const users = { ...facts().users, 'u-renfort': { id: 'u-renfort', displayName: 'Renfort' }, 'u-actif': { id: 'u-actif', displayName: 'Actif' } };
    const s = buildSituation(facts({ coverages: [supported], users }), AT);
    expect(s.supervisors.value?.reinforcements.map((r) => r.user.id)).toEqual(['u-actif']);
  });

  it('aucune garde : « aucune enregistrée », jamais « sans surveillance »', () => {
    const s = buildSituation(facts(), AT);
    expect(s.supervisors.availability).toBe('NONE');
    expect(JSON.stringify(s.supervisors)).not.toMatch(/sans surveillance|unsupervised/i);
  });
});

describe('buildSituation : classe probable ou indisponible', () => {
  const reconstructed = (createdAt: string) => ({ classId: 'k1', startedAt: d('2026-09-01T07:00:00Z'), createdAt: d(createdAt), reconstructed: true });

  it('avant la mise en service, la classe reconstituée est probable et ses dépendances ne sont plus « connues »', () => {
    const s = buildSituation(facts({ periods: [reconstructed('2026-11-20T10:00:00Z')], attendances: [arrival()] }), AT);
    expect(s.class.availability).toBe('PROBABLE');
    expect(s.class.warning).toMatch(/non garantie/i);
    expect(s.session.availability).toBe('PROBABLE');
    expect(s.teacher.availability).toBe('PROBABLE');
    expect(s.announcement.availability).toBe('NONE');
  });

  it('après la mise en service, la même ligne est connue', () => {
    const s = buildSituation(facts({ periods: [reconstructed('2026-11-01T00:00:00Z')], attendances: [arrival()] }), AT);
    expect(s.class.availability).toBe('KNOWN');
    expect(s.session.availability).toBe('KNOWN');
  });

  it('avant la création de l’élève : classe et dépendances indisponibles, sans deviner', () => {
    const s = buildSituation(facts({ periods: [], sessions: [session()], attendances: [arrival()] }), d('2026-08-01T09:00:00Z'));
    expect(s.class).toMatchObject({ availability: 'UNAVAILABLE', reasonUnavailable: expect.stringMatching(/création de l’élève/) });
    for (const section of [s.session, s.teacher, s.announcement, s.substitute, s.supervisors, s.changes]) {
      expect(section.availability).toBe('UNAVAILABLE');
      expect(section.value).toBeUndefined();
    }
  });
});

describe('buildSituation : modifications', () => {
  it('trie par heure et marque celles faites après l’instant', () => {
    const s = buildSituation(
      facts({
        changes: [
          { kind: 'ATTENDANCE_CORRECTED', at: d('2026-11-13T08:00:00Z'), by: ADMIN, before: { arrivedAt: '2026-11-12T09:02:00Z' }, after: { arrivedAt: '2026-11-12T09:12:00Z' }, reason: 'Erreur de saisie' },
          { kind: 'TIMETABLE_CHANGED', at: d('2026-11-12T08:00:00Z'), by: ADMIN, before: { room: 'Salle 8' }, after: { room: 'Salle 12' }, reason: null },
        ],
      }),
      AT,
    );
    expect(s.changes.availability).toBe('KNOWN');
    expect(s.changes.value?.map((c) => [c.kind, c.madeAfterMoment])).toEqual([
      ['TIMETABLE_CHANGED', false],
      ['ATTENDANCE_CORRECTED', true],
    ]);
  });
});
