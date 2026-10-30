import type { RequestStatus } from '@prisma/client';
import { addWorkingMinutes, nextOpening } from '../../prisma/demo/calendar';
import { stableId } from '../../prisma/demo/random';
import { SCENARIOS } from '../../prisma/demo/request-scenarios';
import { assertLocalDevelopmentDatabase, backupName, PURGE_STATEMENTS } from '../../prisma/demo/reset';
import { ALL_ACCOUNTS, CATEGORIES, CLASSES, FLOORS, GUIDELINES, LEVELS, STAFF, fictionalPhone } from '../../prisma/demo/school-data';
import { markReadings, simulateDemo, type DemoData, type Directory } from '../../prisma/demo/simulate';
import { atLocalTime, localDate, localTime } from '../../src/common/school-time';
import { applyAction, ALL_STATUSES } from '../../src/requests/domain/request-state-machine';

/** Jeu de démonstration : référentiels de l'école et simulation des demandes (sans base). */

const TZ = 'Europe/Paris';
const END = atLocalTime('2026-10-30', '17:30', TZ);
const uid = (username: string) => stableId(`user:${username}`);
const head = STAFF.find((s) => s.kind === 'headSupervisor')!;

function directory(): Directory {
  return {
    timeZone: TZ,
    users: ALL_ACCOUNTS.map((a) => ({
      id: uid(a.username),
      username: a.username,
      displayName: a.displayName,
      firstName: a.firstName,
      role: a.role,
      kind: a.kind,
      floor: a.floor,
      classKey: a.classKey,
    })),
    classes: new Map(CLASSES.map((c) => [c.key, { name: c.name, room: c.room, floor: c.floor, level: c.level }])),
    floors: new Map(FLOORS.map((f) => [f.key, f.name])),
    categories: new Map(
      CATEGORIES.map((c) => [
        c.key,
        {
          id: stableId(`category:${c.key}`),
          name: c.name,
          seed: c,
          recipientIds: STAFF.filter((s) => c.recipients.includes(s.kind)).map((s) => uid(s.username)),
          managerIds: [uid(head.username)],
        },
      ]),
    ),
    guidelines: new Map(GUIDELINES.map((g) => [g.key, { id: stableId(`guideline:${g.key}`), title: g.title }])),
  };
}

function simulate(cutoff: Date): DemoData {
  const dir = directory();
  const data = simulateDemo(SCENARIOS, dir, { firstDay: '2026-10-12', lastDay: '2026-10-30', cutoff, seed: 20261030, deadlineWarnPercent: 20 });
  markReadings(data, new Map(dir.users.map((u) => [u.id, u.role])), cutoff, 20261030);
  return data;
}

describe('Jeu de démonstration — établissement', () => {
  it('5 étages, 8 niveaux, 4 classes fleuries par niveau (32), noms tous distincts', () => {
    expect(FLOORS).toHaveLength(5);
    expect(LEVELS.map((l) => l.name)).toEqual([
      'Préparatoire 1',
      'Préparatoire 2',
      '1re primaire',
      '2e primaire',
      '3e primaire',
      '4e primaire',
      '5e primaire',
      '6e primaire',
    ]);
    expect(CLASSES).toHaveLength(32);
    for (const level of LEVELS) expect(CLASSES.filter((c) => c.level === level.name)).toHaveLength(4);
    expect(new Set(CLASSES.map((c) => c.flower)).size).toBe(32);
    expect(new Set(CLASSES.map((c) => c.name)).size).toBe(32);
    expect(CLASSES[0].name).toBe('Préparatoire 1 - Rose');
    expect(CLASSES.find((c) => c.flower === 'Marguerite')?.name).toBe('1re primaire - Marguerite');
    expect(CLASSES.filter((c) => c.level === '6e primaire').map((c) => c.flower)).toEqual(['Bégonia', 'Narcisse', 'Zinnia', 'Aster']);
  });

  it('49 membres du personnel : 35 enseignants, 10 surveillants (2 par étage), économe, technicien, informatique, surveillante générale', () => {
    expect(STAFF).toHaveLength(49);
    expect(STAFF.filter((s) => s.kind === 'teacher' || s.kind === 'specialist')).toHaveLength(35);
    const supervisors = STAFF.filter((s) => s.kind === 'supervisor');
    expect(supervisors).toHaveLength(10);
    for (const floor of FLOORS) expect(supervisors.filter((s) => s.floor === floor.key)).toHaveLength(2);
    for (const kind of ['bursar', 'technician', 'it', 'headSupervisor'] as const) expect(STAFF.filter((s) => s.kind === kind)).toHaveLength(1);
    // Rôles existants uniquement : la fonction est dans jobTitle.
    expect(new Set(STAFF.map((s) => s.role))).toEqual(new Set(['EMPLOYEE', 'ADMIN']));
    expect(STAFF.find((s) => s.kind === 'headSupervisor')?.role).toBe('ADMIN');
    expect(ALL_ACCOUNTS.filter((a) => a.role === 'SUPER_ADMIN').map((a) => a.username)).toEqual(['direction']);
    expect(new Set(ALL_ACCOUNTS.map((a) => a.username)).size).toBe(ALL_ACCOUNTS.length);
    for (const a of ALL_ACCOUNTS) expect(a.username).toMatch(/^[a-z0-9._-]{3,64}$/);
    // Chaque classe a son titulaire.
    expect(new Set(STAFF.filter((s) => s.kind === 'teacher').map((s) => s.classKey)).size).toBe(32);
  });

  it('téléphones de parents dans la plage réservée à la fiction', () => {
    expect(fictionalPhone(1)).toBe('06 39 98 00 01');
    expect(fictionalPhone(812)).toMatch(/^06 39 98 \d{2} \d{2}$/);
  });
});

describe('Jeu de démonstration — calendrier', () => {
  it('minutes ouvrées : la nuit et le dimanche ne comptent pas', () => {
    const friday = atLocalTime('2026-10-16', '17:00', TZ);
    expect(localTime(addWorkingMinutes(friday, 60, TZ), TZ)).toBe('08:30'); // samedi 8 h + 30 min
    const saturday = atLocalTime('2026-10-17', '12:00', TZ);
    const next = addWorkingMinutes(saturday, 60, TZ);
    expect(localDate(next, TZ)).toBe('2026-10-19'); // dimanche fermé
    expect(localTime(next, TZ)).toBe('08:00');
    expect(localDate(nextOpening(saturday, TZ), TZ)).toBe('2026-10-19');
  });
});

describe('Jeu de démonstration — demandes', () => {
  const data = simulate(END);

  it('environ 140 demandes, toutes datées du 12 au 30 octobre 2026, chaque jour représenté', () => {
    expect(data.requests.length).toBeGreaterThanOrEqual(120);
    expect(data.requests.length).toBeLessThanOrEqual(150);
    const days = new Set(data.requests.map((r) => localDate(r.createdAt, TZ)));
    expect(days.size).toBe(19);
    for (const r of data.requests) {
      expect(localDate(r.createdAt, TZ) >= '2026-10-12' && localDate(r.createdAt, TZ) <= '2026-10-30').toBe(true);
    }
    // Matin, après-midi et fin de journée.
    const hours = data.requests.map((r) => Number(localTime(r.createdAt, TZ).slice(0, 2)));
    expect(hours.some((h) => h < 12)).toBe(true);
    expect(hours.some((h) => h >= 13 && h < 16)).toBe(true);
    expect(hours.some((h) => h >= 16)).toBe(true);
  });

  it('priorités réalistes : surtout normales et moyennes, peu d’urgences', () => {
    const count = (p: string) => data.requests.filter((r) => r.priority === p).length;
    expect(count('NORMAL') + count('MEDIUM')).toBeGreaterThan(data.requests.length * 0.6);
    expect(count('URGENT')).toBeLessThanOrEqual(data.requests.length * 0.1);
    expect(count('HIGH')).toBeGreaterThan(0);
  });

  it('tous les statuts du workflow sont représentés', () => {
    const statuses = new Set(data.requests.map((r) => r.status));
    for (const status of ALL_STATUSES) expect(statuses).toContain(status);
  });

  it('historique rejouable par la machine à états, chronologique, sans date future', () => {
    const byRequest = new Map<string, typeof data.events>();
    for (const e of data.events) byRequest.set(e.requestId, [...(byRequest.get(e.requestId) ?? []), e]);
    for (const request of data.requests) {
      const events = byRequest.get(request.id) ?? [];
      if (request.status === 'DRAFT') {
        expect(events).toHaveLength(0);
        continue;
      }
      expect(events[0].type).toBe('CREATED');
      const times = events.map((e) => (e.createdAt as Date).getTime());
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(times[0]).toBe(request.createdAt.getTime());
      expect(Math.max(...times)).toBeLessThanOrEqual(END.getTime());
      // Chaîne des statuts : chaque transition part du statut précédent et finit au statut actuel.
      let status: RequestStatus = 'DRAFT';
      for (const e of events.filter((x) => x.type === 'STATUS_CHANGED')) {
        expect((e.fromValue as { status: RequestStatus }).status).toBe(status);
        status = (e.toValue as { status: RequestStatus }).status;
      }
      expect(status).toBe(request.status);
    }
  });

  it('chaque transition de la chaîne existe dans la machine à états', () => {
    const allowed = new Set<string>();
    for (const e of data.events.filter((x) => x.type === 'STATUS_CHANGED')) {
      allowed.add(`${(e.fromValue as { status: string }).status}>${(e.toValue as { status: string }).status}`);
    }
    const legal = [
      'DRAFT>SENT', 'DRAFT>PENDING_ADMIN_VALIDATION', 'PENDING_ADMIN_VALIDATION>SENT', 'PENDING_ADMIN_VALIDATION>REJECTED',
      'PENDING_ADMIN_VALIDATION>CANCELLED', 'SENT>ACCEPTED', 'SENT>REJECTED', 'SENT>CANCELLED', 'ACCEPTED>IN_PROGRESS',
      'IN_PROGRESS>DONE', 'DONE>CLOSED', 'DONE>PENDING_FINAL_VALIDATION', 'PENDING_FINAL_VALIDATION>CLOSED',
      'DONE>TO_CORRECT', 'PENDING_FINAL_VALIDATION>TO_CORRECT', 'TO_CORRECT>IN_PROGRESS', 'ACCEPTED>SENT', 'SENT>SENT',
      'IN_PROGRESS>SENT', 'TO_CORRECT>SENT',
    ];
    for (const transition of allowed) expect(legal).toContain(transition);
    // Contrôle direct d'une transition interdite par la machine.
    expect(applyAction({ status: 'SENT', rules: { circuit: 'A_DIRECT', closureMode: 'AUTO', autoCloseAfterMinutes: 0, finalValidation: false, assignmentMode: 'MANUAL', photoRequired: false }, hasVoice: false, hasDescription: true, assigneeId: null, autoCloseAt: null }, 'COMPLETE', { actors: ['ASSIGNEE'], now: END }).ok).toBe(false);
  });

  it('notifications et messages : comptes existants, jamais après la date de démonstration, lecture après réception', () => {
    const ids = new Set(ALL_ACCOUNTS.map((a) => uid(a.username)));
    const requestIds = new Set(data.requests.map((r) => r.id));
    for (const n of data.notifications) {
      expect(ids.has(n.userId)).toBe(true);
      expect(requestIds.has(n.requestId)).toBe(true);
      expect((n.createdAt as Date).getTime()).toBeLessThanOrEqual(END.getTime());
      if (n.readAt) expect((n.readAt as Date).getTime()).toBeGreaterThanOrEqual((n.createdAt as Date).getTime());
    }
    for (const m of data.messages) expect(requestIds.has(m.requestId)).toBe(true);
    expect(data.notifications.some((n) => !n.readAt)).toBe(true);
    // Une demande urgente alerte la direction (super administratrice) une seule fois.
    const urgentAlerts = data.notifications.filter((n) => n.type === 'URGENT' && n.userId === uid('direction'));
    expect(new Set(urgentAlerts.map((n) => n.requestId)).size).toBe(urgentAlerts.length);
  });

  it('destinataires cohérents : informatique → responsable informatique, entraide → un autre enseignant', () => {
    const it = stableId('category:it');
    const peer = stableId('category:peer');
    for (const r of data.requests.filter((x) => x.categoryId === it && x.assigneeId)) expect(r.assigneeId).toBe(uid('aymen.kchaou'));
    for (const r of data.requests.filter((x) => x.categoryId === peer && x.assigneeId)) expect(r.assigneeId).not.toBe(r.requesterId);
    expect(new Set(data.requests.map((r) => r.requesterId)).size).toBeGreaterThan(30);
    // Personne n'est affecté à sa propre demande, même temporairement.
    const requesterOf = new Map(data.requests.map((r) => [r.id, r.requesterId]));
    expect(data.requests.filter((r) => r.assigneeId === r.requesterId)).toEqual([]);
    for (const e of data.events.filter((x) => x.type === 'ASSIGNED' || x.type === 'REASSIGNED')) {
      expect((e.toValue as { assigneeId: string }).assigneeId).not.toBe(requesterOf.get(e.requestId));
    }
  });

  it('reproductible ; une date de démonstration plus tôt tronque l’histoire sans la modifier', () => {
    expect(simulate(END)).toEqual(data);
    const earlier = atLocalTime('2026-10-23', '12:00', TZ);
    const partial = simulate(earlier);
    const full = new Map(data.events.map((e) => [e.id, e]));
    for (const e of partial.events) expect(full.get(e.id)).toEqual(e);
    expect(partial.requests.every((r) => r.createdAt.getTime() <= earlier.getTime())).toBe(true);
  });
});

describe('Jeu de démonstration — sécurité de la remise à zéro', () => {
  it('accepte uniquement la base locale de développement', () => {
    expect(assertLocalDevelopmentDatabase('postgresql://postgres:postgres@localhost:5433/app', {})).toEqual({ host: 'localhost', port: '5433', database: 'app' });
    expect(() => assertLocalDevelopmentDatabase('postgresql://u:p@db.example.com:5433/app', {})).toThrow(/Refusé/);
    expect(() => assertLocalDevelopmentDatabase('postgresql://u:p@localhost:5432/app', {})).toThrow(/Refusé/);
    expect(() => assertLocalDevelopmentDatabase('postgresql://u:p@localhost:5433/app_test', {})).toThrow(/Refusé/);
    expect(() => assertLocalDevelopmentDatabase('postgresql://u:p@localhost:5433/app', { NODE_ENV: 'production' })).toThrow(/production/);
    expect(() => assertLocalDevelopmentDatabase(undefined, {})).toThrow(/absente/);
  });

  it('sauvegarde nommée et purge sans TRUNCATE ni suppression de migrations', () => {
    expect(backupName(new Date(2026, 9, 30, 2, 5))).toBe('app_backup_20261030_0205');
    expect(PURGE_STATEMENTS.some((s) => /TRUNCATE|_prisma_migrations|DROP/i.test(s))).toBe(false);
    expect(PURGE_STATEMENTS.some((s) => /DELETE FROM "(Setting|RolePermission)"/.test(s))).toBe(false);
  });
});
