import {
  afterSend,
  reminderChanges,
  type CoverageTiming,
  type OpenReminder,
  type ReminderSettings,
} from '../../src/coverage/domain/coverage-reminders';

const settings: ReminderSettings = {
  timezone: 'Europe/Paris',
  takeoverMinutes: 2,
  urgencyThresholdMinutes: 60,
  escalationMinutes: 5,
  morningReminderTime: '07:00',
  closeReminderMinutes: 10,
  closeEscalationMinutes: 10,
  supportReminderMinutes: 10,
  supportReminderMax: 3,
};

// 20 octobre 2026 : heure d'été, Paris = UTC+2.
const at = (iso: string) => new Date(iso);
const plus = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

function coverage(extra: Partial<CoverageTiming> = {}): CoverageTiming {
  return {
    status: 'PENDING',
    source: 'TEACHER_REQUEST',
    startAt: at('2026-10-20T13:00:00Z'), // 15:00 locales
    plannedEndAt: at('2026-10-20T14:00:00Z'),
    assigneeId: null,
    ...extra,
  };
}

let seq = 0;
function open(kind: OpenReminder['kind'], extra: Partial<OpenReminder> = {}): OpenReminder {
  seq += 1;
  return {
    id: `r${seq}`,
    kind,
    dueAt: at('2026-10-20T12:00:00Z'),
    targetUserId: null,
    supportId: null,
    attempts: 0,
    maxAttempts: 1,
    intervalMinutes: null,
    ...extra,
  };
}

describe('Échéances des affectations (R3)', () => {
  describe('délai de prise en charge (FR-011d)', () => {
    it('créneau lointain : le délai démarre quand le début passe sous le seuil de 60 min', () => {
      const now = at('2026-10-20T05:00:00Z'); // 07:00 locales, créneau à 15:00
      const { create, resolve } = reminderChanges(
        { type: 'CREATED' },
        coverage(),
        [],
        now,
        settings,
      );
      expect(resolve).toEqual([]);
      expect(create).toEqual([
        {
          kind: 'TAKEOVER',
          dueAt: at('2026-10-20T12:02:00Z'), // 14:00 + 2 min
          targetUserId: null,
          supportId: null,
          maxAttempts: 1,
          intervalMinutes: null,
        },
      ]);
    });

    it('créneau dans 30 min : le délai démarre à la création', () => {
      const now = at('2026-10-20T12:30:00Z');
      const { create } = reminderChanges({ type: 'CREATED' }, coverage(), [], now, settings);
      expect(create.map((r) => [r.kind, r.dueAt])).toEqual([['TAKEOVER', plus(now, 2)]]);
    });

    it('créneau déjà commencé : le délai démarre à la création', () => {
      const now = at('2026-10-20T13:20:00Z');
      const { create } = reminderChanges({ type: 'CREATED' }, coverage(), [], now, settings);
      expect(create.map((r) => [r.kind, r.dueAt])).toEqual([['TAKEOVER', plus(now, 2)]]);
    });

    it('aucune ligne TAKEOVER pour une classe vide déclarée par un surveillant', () => {
      const now = at('2026-10-20T13:00:00Z');
      const declared = coverage({
        source: 'SUPERVISOR_REPORT',
        status: 'ON_DUTY',
        startAt: now,
        assigneeId: 'sv-1',
      });
      const { create } = reminderChanges({ type: 'CREATED' }, declared, [], now, settings);
      expect(create.map((r) => r.kind)).toEqual(['END_OF_SLOT']);
    });

    it('après l’alerte, escalade aux super administrateurs 5 min plus tard (FR-011e)', () => {
      const takeover = open('TAKEOVER', { dueAt: at('2026-10-20T12:02:00Z') });
      expect(afterSend(takeover, at('2026-10-20T12:02:10Z'), settings)).toEqual({
        attempts: 1,
        resolution: 'SENT',
        nextDueAt: null,
        create: [
          {
            kind: 'TAKEOVER_ESCALATION',
            dueAt: at('2026-10-20T12:07:00Z'),
            targetUserId: null,
            supportId: null,
            maxAttempts: 1,
            intervalMinutes: null,
          },
        ],
      });
    });
  });

  describe('rappel du matin (FR-011f)', () => {
    it('demande pour demain : rappel à 07:00 locales le jour du créneau', () => {
      const now = at('2026-10-20T16:00:00Z'); // 18:00 le 20
      const tomorrow = coverage({
        startAt: at('2026-10-21T08:00:00Z'),
        plannedEndAt: at('2026-10-21T09:00:00Z'),
      });
      const { create } = reminderChanges({ type: 'CREATED' }, tomorrow, [], now, settings);
      expect(create.map((r) => [r.kind, r.dueAt.toISOString()])).toEqual([
        ['TAKEOVER', '2026-10-21T07:02:00.000Z'],
        ['MORNING', '2026-10-21T05:00:00.000Z'],
      ]);
    });

    it('demande pour aujourd’hui : aucun rappel du matin', () => {
      const now = at('2026-10-20T05:30:00Z');
      const { create } = reminderChanges({ type: 'CREATED' }, coverage(), [], now, settings);
      expect(create.map((r) => r.kind)).not.toContain('MORNING');
    });

    it('le jour local compte, pas le jour UTC (23:30 locales la veille)', () => {
      const now = at('2026-10-20T21:30:00Z'); // 23:30 le 20
      const early = coverage({
        startAt: at('2026-10-20T22:30:00Z'),
        plannedEndAt: at('2026-10-20T23:30:00Z'),
      }); // 00:30 le 21
      const { create } = reminderChanges({ type: 'CREATED' }, early, [], now, settings);
      expect(create.find((r) => r.kind === 'MORNING')?.dueAt.toISOString()).toBe(
        '2026-10-21T05:00:00.000Z',
      );
    });
  });

  describe('assignation, annulation, retrait, non pourvue', () => {
    const pending = [open('TAKEOVER'), open('TAKEOVER_ESCALATION'), open('MORNING')];

    it('ASSIGN : résout les délais de prise en charge et crée le rappel de fin de créneau du surveillant', () => {
      const assigned = coverage({ status: 'ACCEPTED', assigneeId: 'sv-1' });
      const { resolve, create } = reminderChanges(
        { type: 'TRANSITION', action: 'ASSIGN' },
        assigned,
        pending,
        at('2026-10-20T12:00:00Z'),
        settings,
      );
      expect(resolve).toEqual(pending.map((r) => ({ id: r.id, resolution: 'ASSIGNED' })));
      expect(create).toEqual([
        {
          kind: 'END_OF_SLOT',
          dueAt: at('2026-10-20T14:10:00Z'),
          targetUserId: 'sv-1',
          supportId: null,
          maxAttempts: 1,
          intervalMinutes: null,
        },
      ]);
    });

    it('ATTACH_DECLARATION : même effet qu’une assignation', () => {
      const { resolve, create } = reminderChanges(
        { type: 'TRANSITION', action: 'ATTACH_DECLARATION' },
        coverage({ status: 'ON_DUTY', assigneeId: 'sv-2' }),
        pending,
        at('2026-10-20T12:00:00Z'),
        settings,
      );
      expect(resolve.map((r) => r.resolution)).toEqual(['ASSIGNED', 'ASSIGNED', 'ASSIGNED']);
      expect(create.map((r) => [r.kind, r.targetUserId])).toEqual([['END_OF_SLOT', 'sv-2']]);
    });

    it.each(['CANCEL', 'WITHDRAW'] as const)(
      '%s : résout toutes les échéances ouvertes',
      (action) => {
        const { resolve, create } = reminderChanges(
          { type: 'TRANSITION', action },
          coverage({ status: 'CANCELLED' }),
          pending,
          at('2026-10-20T12:00:00Z'),
          settings,
        );
        expect(resolve.map((r) => r.resolution)).toEqual(['CANCELLED', 'CANCELLED', 'CANCELLED']);
        expect(create).toEqual([]);
      },
    );

    it('EXPIRE_UNFILLED : échéances devenues sans objet', () => {
      const { resolve } = reminderChanges(
        { type: 'TRANSITION', action: 'EXPIRE_UNFILLED' },
        coverage({ status: 'UNFILLED' }),
        pending,
        at('2026-10-20T14:01:00Z'),
        settings,
      );
      expect(resolve.map((r) => r.resolution)).toEqual(['OBSOLETE', 'OBSOLETE', 'OBSOLETE']);
    });

    it.each(['RELIEVE', 'RELEASE_BY_MANAGER'] as const)(
      '%s : affectation terminée, rappels de clôture et de renfort résolus',
      (action) => {
        const reminders = [
          open('END_OF_SLOT', { targetUserId: 'sv-1' }),
          open('SUPPORT_DECISION', { supportId: 's1' }),
        ];
        const { resolve, create } = reminderChanges(
          { type: 'TRANSITION', action },
          coverage({ status: 'DONE', assigneeId: 'sv-1' }),
          reminders,
          at('2026-10-20T14:01:00Z'),
          settings,
        );
        expect(resolve).toEqual(reminders.map((r) => ({ id: r.id, resolution: 'CLOSED' })));
        expect(create).toEqual([]);
      },
    );
  });

  describe('fin de créneau (FR-016a)', () => {
    it('rappel au surveillant à fin + 10 min, puis aux admins 10 min plus tard', () => {
      const endOfSlot = open('END_OF_SLOT', {
        dueAt: at('2026-10-20T14:10:00Z'),
        targetUserId: 'sv-1',
      });
      const { create, resolution } = afterSend(endOfSlot, at('2026-10-20T14:10:05Z'), settings);
      expect(resolution).toBe('SENT');
      expect(create.map((r) => [r.kind, r.dueAt.toISOString(), r.targetUserId])).toEqual([
        ['END_OF_SLOT_ADMIN', '2026-10-20T14:20:00.000Z', null],
      ]);
    });

    it('le rappel aux admins est le dernier', () => {
      const adminReminder = open('END_OF_SLOT_ADMIN', { dueAt: at('2026-10-20T14:20:00Z') });
      expect(afterSend(adminReminder, at('2026-10-20T14:20:00Z'), settings)).toEqual({
        attempts: 1,
        resolution: 'SENT',
        nextDueAt: null,
        create: [],
      });
    });

    it('garde « jusqu’à l’arrivée » (fin inconnue) : fin réputée = fin de la journée locale, aucun rappel avant', () => {
      const legacy = coverage({
        status: 'ON_DUTY',
        source: 'ADMIN_DIRECT',
        plannedEndAt: null,
        assigneeId: 'sv-1',
      });
      const { create } = reminderChanges(
        { type: 'TRANSITION', action: 'CONFIRM_PRESENCE' },
        legacy,
        [],
        at('2026-10-20T13:00:00Z'),
        settings,
      );
      expect(create).toEqual([]);
      const assigned = reminderChanges(
        { type: 'TRANSITION', action: 'REASSIGN' },
        { ...legacy, status: 'ACCEPTED' },
        [],
        at('2026-10-20T13:00:00Z'),
        settings,
      );
      // Minuit local du 21 = 22:00 UTC le 20, + 10 min.
      expect(assigned.create.map((r) => [r.kind, r.dueAt.toISOString()])).toEqual([
        ['END_OF_SLOT', '2026-10-20T22:10:00.000Z'],
      ]);
    });

    it('affectation directe et déclaration de classe vide : rappel de fin de créneau dès la création', () => {
      const now = at('2026-10-20T12:00:00Z');
      for (const created of [
        coverage({ source: 'ADMIN_DIRECT', status: 'ACCEPTED', assigneeId: 'sv-1' }),
        coverage({
          source: 'SUPERVISOR_REPORT',
          status: 'ON_DUTY',
          assigneeId: 'sv-1',
          plannedEndAt: null,
          startAt: now,
        }),
      ]) {
        const { create } = reminderChanges({ type: 'CREATED' }, created, [], now, settings);
        const expected = created.plannedEndAt
          ? '2026-10-20T14:10:00.000Z'
          : '2026-10-20T22:10:00.000Z';
        expect(create.map((r) => [r.kind, r.targetUserId, r.dueAt.toISOString()])).toEqual([
          ['END_OF_SLOT', 'sv-1', expected],
        ]);
      }
    });
  });

  describe('recalcul (FR-008g, prolongation, réassignation)', () => {
    it('UPDATE par l’enseignant : délais de prise en charge et rappel du matin recalculés', () => {
      const reminders = [open('TAKEOVER'), open('MORNING')];
      const now = at('2026-10-20T16:00:00Z');
      const moved = coverage({
        startAt: at('2026-10-21T10:00:00Z'),
        plannedEndAt: at('2026-10-21T11:00:00Z'),
      });
      const { resolve, create } = reminderChanges(
        { type: 'TRANSITION', action: 'UPDATE' },
        moved,
        reminders,
        now,
        settings,
      );
      expect(resolve).toEqual(reminders.map((r) => ({ id: r.id, resolution: 'OBSOLETE' })));
      expect(create.map((r) => [r.kind, r.dueAt.toISOString()])).toEqual([
        ['TAKEOVER', '2026-10-21T09:02:00.000Z'],
        ['MORNING', '2026-10-21T05:00:00.000Z'],
      ]);
    });

    it('EXTEND : rappels de clôture recalculés sur la nouvelle fin', () => {
      const reminders = [open('END_OF_SLOT', { targetUserId: 'sv-1' }), open('END_OF_SLOT_ADMIN')];
      const extended = coverage({
        status: 'ON_DUTY',
        assigneeId: 'sv-1',
        plannedEndAt: at('2026-10-20T14:30:00Z'),
      });
      const { resolve, create } = reminderChanges(
        { type: 'TRANSITION', action: 'EXTEND' },
        extended,
        reminders,
        at('2026-10-20T14:00:00Z'),
        settings,
      );
      expect(resolve).toEqual(reminders.map((r) => ({ id: r.id, resolution: 'OBSOLETE' })));
      expect(create.map((r) => [r.kind, r.targetUserId, r.dueAt.toISOString()])).toEqual([
        ['END_OF_SLOT', 'sv-1', '2026-10-20T14:40:00.000Z'],
      ]);
    });

    it('EXTEND d’une demande en attente : le délai de prise en charge ne change pas', () => {
      const reminders = [open('TAKEOVER')];
      const { resolve, create } = reminderChanges(
        { type: 'TRANSITION', action: 'EXTEND' },
        coverage({ plannedEndAt: at('2026-10-20T14:30:00Z') }),
        reminders,
        at('2026-10-20T12:00:00Z'),
        settings,
      );
      expect(resolve).toEqual([]);
      expect(create).toEqual([]);
    });

    it('REASSIGN avant la présence : le rappel de clôture suit le nouveau surveillant', () => {
      const reminders = [open('END_OF_SLOT', { targetUserId: 'sv-1' })];
      const { resolve, create } = reminderChanges(
        { type: 'TRANSITION', action: 'REASSIGN' },
        coverage({ status: 'ACCEPTED', assigneeId: 'sv-2' }),
        reminders,
        at('2026-10-20T12:00:00Z'),
        settings,
      );
      expect(resolve).toEqual([{ id: reminders[0].id, resolution: 'OBSOLETE' }]);
      expect(create.map((r) => [r.kind, r.targetUserId])).toEqual([['END_OF_SLOT', 'sv-2']]);
    });

    it('REASSIGN sur site (relève assignée) : l’affectation d’origine garde ses rappels', () => {
      const reminders = [open('END_OF_SLOT', { targetUserId: 'sv-1' })];
      const { resolve, create } = reminderChanges(
        { type: 'TRANSITION', action: 'REASSIGN' },
        coverage({ status: 'ON_DUTY', assigneeId: 'sv-1' }),
        reminders,
        at('2026-10-20T13:30:00Z'),
        settings,
      );
      expect(resolve).toEqual([]);
      expect(create).toEqual([]);
    });
  });

  describe('renfort (FR-015i)', () => {
    const now = at('2026-10-20T13:00:00Z');

    it('arrivée d’un renfort : rappel aux admins toutes les 10 min, 3 au plus', () => {
      const { create } = reminderChanges(
        { type: 'SUPPORT_JOINED', supportId: 's1' },
        coverage({ status: 'ON_DUTY', assigneeId: 'sv-1' }),
        [],
        now,
        settings,
      );
      expect(create).toEqual([
        {
          kind: 'SUPPORT_DECISION',
          dueAt: plus(now, 10),
          targetUserId: null,
          supportId: 's1',
          maxAttempts: 3,
          intervalMinutes: 10,
        },
      ]);
    });

    it('rappels répétés, puis escalade aux super administrateurs après le dernier', () => {
      const reminder = open('SUPPORT_DECISION', {
        supportId: 's1',
        dueAt: plus(now, 10),
        maxAttempts: 3,
        intervalMinutes: 10,
      });
      expect(afterSend(reminder, plus(now, 10), settings)).toEqual({
        attempts: 1,
        resolution: null,
        nextDueAt: plus(now, 20),
        create: [],
      });
      expect(
        afterSend({ ...reminder, attempts: 1, dueAt: plus(now, 20) }, plus(now, 20), settings),
      ).toMatchObject({
        attempts: 2,
        resolution: null,
        nextDueAt: plus(now, 30),
      });
      expect(
        afterSend({ ...reminder, attempts: 2, dueAt: plus(now, 30) }, plus(now, 30), settings),
      ).toEqual({
        attempts: 3,
        resolution: 'SENT',
        nextDueAt: null,
        create: [
          {
            kind: 'SUPPORT_ESCALATION',
            dueAt: plus(now, 40),
            targetUserId: null,
            supportId: 's1',
            maxAttempts: 1,
            intervalMinutes: null,
          },
        ],
      });
    });

    it('libération du renfort : seules ses échéances sont résolues', () => {
      const mine = open('SUPPORT_DECISION', { supportId: 's1' });
      const other = open('SUPPORT_DECISION', { supportId: 's2' });
      const escalation = open('SUPPORT_ESCALATION', { supportId: 's1' });
      const { resolve, create } = reminderChanges(
        { type: 'SUPPORT_RELEASED', supportId: 's1' },
        coverage({ status: 'ON_DUTY', assigneeId: 'sv-1' }),
        [mine, other, escalation, open('END_OF_SLOT')],
        now,
        settings,
      );
      expect(resolve).toEqual([
        { id: mine.id, resolution: 'DECIDED' },
        { id: escalation.id, resolution: 'DECIDED' },
      ]);
      expect(create).toEqual([]);
    });
  });
});
