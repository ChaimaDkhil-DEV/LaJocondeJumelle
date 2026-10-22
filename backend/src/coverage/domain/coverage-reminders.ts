import type { CoverageReminderKind, CoverageSource, RequestStatus } from '@prisma/client';
import { atLocalTime, endOfLocalDay, localDate } from '../../common/school-time';
import type { CoverageAction } from './coverage-state-machine';

/**
 * Échéances des affectations (R2, R3) : calcul pur des lignes `CoverageReminder` à créer ou à
 * résoudre. Le service applique le résultat dans la transaction de chaque changement ; le job
 * `CoverageRemindersJob` envoie les lignes échues puis applique `afterSend`.
 *
 * | Type                | Échéance                                       | Destinataire          |
 * |---------------------|------------------------------------------------|-----------------------|
 * | TAKEOVER            | max(création, début − seuil) + délai           | admins                |
 * | TAKEOVER_ESCALATION | TAKEOVER + escalade                            | super administrateurs |
 * | MORNING             | 07:00 locales du jour du créneau (jour suivant)| admins                |
 * | END_OF_SLOT         | fin du créneau + rappel de clôture             | surveillant           |
 * | END_OF_SLOT_ADMIN   | END_OF_SLOT + escalade de clôture              | admins                |
 * | SUPPORT_DECISION    | arrivée du renfort + intervalle, répété        | admins                |
 * | SUPPORT_ESCALATION  | dernier rappel + intervalle                    | super administrateurs |
 */

export type ReminderResolution = 'SENT' | 'ASSIGNED' | 'CANCELLED' | 'CLOSED' | 'DECIDED' | 'OBSOLETE';

export interface ReminderSettings {
  timezone: string;
  /** `DeadlineRule.takeoverMinutes` de la catégorie de garde. */
  takeoverMinutes: number;
  urgencyThresholdMinutes: number;
  escalationMinutes: number;
  morningReminderTime: string;
  closeReminderMinutes: number;
  closeEscalationMinutes: number;
  supportReminderMinutes: number;
  supportReminderMax: number;
}

/** Affectation après le changement (statut, preneur et créneau à jour). */
export interface CoverageTiming {
  status: RequestStatus;
  source: CoverageSource | null;
  startAt: Date;
  /** null : garde antérieure « jusqu'à l'arrivée », fin réputée = fin de la journée locale. */
  plannedEndAt: Date | null;
  assigneeId: string | null;
}

export interface ReminderPlan {
  kind: CoverageReminderKind;
  dueAt: Date;
  targetUserId: string | null;
  supportId: string | null;
  maxAttempts: number;
  intervalMinutes: number | null;
}

export interface OpenReminder extends ReminderPlan {
  id: string;
  attempts: number;
}

export type ReminderEvent =
  | { type: 'CREATED' }
  | { type: 'TRANSITION'; action: CoverageAction }
  | { type: 'SUPPORT_JOINED'; supportId: string }
  | { type: 'SUPPORT_RELEASED'; supportId: string };

export interface ReminderChanges {
  resolve: Array<{ id: string; resolution: ReminderResolution }>;
  create: ReminderPlan[];
}

export interface AfterSend {
  attempts: number;
  /** null : la ligne reste ouverte et repart à `nextDueAt`. */
  resolution: 'SENT' | null;
  nextDueAt: Date | null;
  create: ReminderPlan[];
}

const MINUTE_MS = 60_000;
const TAKEOVER_KINDS: readonly CoverageReminderKind[] = ['TAKEOVER', 'TAKEOVER_ESCALATION', 'MORNING'];
const CLOSE_KINDS: readonly CoverageReminderKind[] = ['END_OF_SLOT', 'END_OF_SLOT_ADMIN'];
const SUPPORT_KINDS: readonly CoverageReminderKind[] = ['SUPPORT_DECISION', 'SUPPORT_ESCALATION'];
const BEFORE_PRESENCE: readonly RequestStatus[] = ['ACCEPTED', 'EN_ROUTE', 'LATE'];
const ASSIGNED_OR_IN_PROGRESS: readonly RequestStatus[] = [...BEFORE_PRESENCE, 'ON_DUTY', 'RELIEF_PENDING'];

const plus = (date: Date, minutes: number) => new Date(date.getTime() + minutes * MINUTE_MS);

function plan(kind: CoverageReminderKind, dueAt: Date, extra: Partial<ReminderPlan> = {}): ReminderPlan {
  return { kind, dueAt, targetUserId: null, supportId: null, maxAttempts: 1, intervalMinutes: null, ...extra };
}

/** Délai de prise en charge et rappel du matin d'une demande « en attente » (FR-011d, FR-011f). */
function takeoverPlans(coverage: CoverageTiming, now: Date, settings: ReminderSettings): ReminderPlan[] {
  if (coverage.source === 'SUPERVISOR_REPORT') return [];
  const threshold = plus(coverage.startAt, -settings.urgencyThresholdMinutes);
  const start = threshold > now ? threshold : now;
  const plans = [plan('TAKEOVER', plus(start, settings.takeoverMinutes))];
  const slotDay = localDate(coverage.startAt, settings.timezone);
  if (slotDay > localDate(now, settings.timezone)) {
    plans.push(plan('MORNING', atLocalTime(slotDay, settings.morningReminderTime, settings.timezone)));
  }
  return plans;
}

/** Rappel de clôture au surveillant ; fin inconnue = fin de la journée locale (FR-016a). */
function endOfSlotPlan(coverage: CoverageTiming, settings: ReminderSettings): ReminderPlan[] {
  if (!coverage.assigneeId) return [];
  const end = coverage.plannedEndAt ?? endOfLocalDay(coverage.startAt, settings.timezone);
  return [plan('END_OF_SLOT', plus(end, settings.closeReminderMinutes), { targetUserId: coverage.assigneeId })];
}

function resolveKinds(
  open: readonly OpenReminder[],
  kinds: readonly CoverageReminderKind[] | 'ALL',
  resolution: ReminderResolution,
): ReminderChanges['resolve'] {
  return open.filter((r) => kinds === 'ALL' || kinds.includes(r.kind)).map((r) => ({ id: r.id, resolution }));
}

export function reminderChanges(
  event: ReminderEvent,
  coverage: CoverageTiming,
  open: readonly OpenReminder[],
  now: Date,
  settings: ReminderSettings,
): ReminderChanges {
  const none: ReminderChanges = { resolve: [], create: [] };
  switch (event.type) {
    case 'CREATED':
      if (coverage.status === 'PENDING') return { resolve: [], create: takeoverPlans(coverage, now, settings) };
      return { resolve: [], create: endOfSlotPlan(coverage, settings) };

    case 'SUPPORT_JOINED':
      return {
        resolve: [],
        create: [
          plan('SUPPORT_DECISION', plus(now, settings.supportReminderMinutes), {
            supportId: event.supportId,
            maxAttempts: settings.supportReminderMax,
            intervalMinutes: settings.supportReminderMinutes,
          }),
        ],
      };

    case 'SUPPORT_RELEASED':
      return {
        resolve: open
          .filter((r) => SUPPORT_KINDS.includes(r.kind) && r.supportId === event.supportId)
          .map((r) => ({ id: r.id, resolution: 'DECIDED' })),
        create: [],
      };

    case 'TRANSITION':
      break;
  }

  switch (event.action) {
    case 'ASSIGN':
    case 'ATTACH_DECLARATION':
      return { resolve: resolveKinds(open, TAKEOVER_KINDS, 'ASSIGNED'), create: endOfSlotPlan(coverage, settings) };

    case 'REASSIGN':
      // Sur site, la relève assignée porte ses propres échéances ; l'affectation d'origine garde les siennes.
      if (!BEFORE_PRESENCE.includes(coverage.status)) return none;
      return { resolve: resolveKinds(open, CLOSE_KINDS, 'OBSOLETE'), create: endOfSlotPlan(coverage, settings) };

    case 'UPDATE':
      // Affectation assignée ou en cours modifiée par l'admin (spec 006) : clôture sur la nouvelle fin.
      if (ASSIGNED_OR_IN_PROGRESS.includes(coverage.status)) {
        return { resolve: resolveKinds(open, CLOSE_KINDS, 'OBSOLETE'), create: endOfSlotPlan(coverage, settings) };
      }
      return { resolve: resolveKinds(open, TAKEOVER_KINDS, 'OBSOLETE'), create: takeoverPlans(coverage, now, settings) };

    case 'EXTEND':
      if (!ASSIGNED_OR_IN_PROGRESS.includes(coverage.status)) return none;
      return { resolve: resolveKinds(open, CLOSE_KINDS, 'OBSOLETE'), create: endOfSlotPlan(coverage, settings) };

    case 'CANCEL':
    case 'WITHDRAW':
      return { resolve: resolveKinds(open, 'ALL', 'CANCELLED'), create: [] };

    case 'EXPIRE_UNFILLED':
      return { resolve: resolveKinds(open, 'ALL', 'OBSOLETE'), create: [] };

    case 'RELIEVE':
    case 'RELEASE_BY_MANAGER':
      return { resolve: resolveKinds(open, 'ALL', 'CLOSED'), create: [] };

    default:
      return none;
  }
}

/** Suite d'un envoi : escalade, répétition plafonnée ou fin. */
export function afterSend(reminder: OpenReminder, _now: Date, settings: ReminderSettings): AfterSend {
  const attempts = reminder.attempts + 1;
  const done = (create: ReminderPlan[] = []): AfterSend => ({ attempts, resolution: 'SENT', nextDueAt: null, create });

  switch (reminder.kind) {
    case 'TAKEOVER':
      return done([plan('TAKEOVER_ESCALATION', plus(reminder.dueAt, settings.escalationMinutes))]);
    case 'END_OF_SLOT':
      return done([plan('END_OF_SLOT_ADMIN', plus(reminder.dueAt, settings.closeEscalationMinutes))]);
    case 'SUPPORT_DECISION': {
      const interval = reminder.intervalMinutes ?? settings.supportReminderMinutes;
      if (attempts < reminder.maxAttempts) {
        return { attempts, resolution: null, nextDueAt: plus(reminder.dueAt, interval), create: [] };
      }
      return done([plan('SUPPORT_ESCALATION', plus(reminder.dueAt, interval), { supportId: reminder.supportId })]);
    }
    default:
      return done();
  }
}
