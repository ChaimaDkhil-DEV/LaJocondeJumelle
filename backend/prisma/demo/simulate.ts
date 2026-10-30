import type { NotificationType, Prisma, Priority, RequestStatus, Role } from '@prisma/client';
import { addDays, atLocalTime, localDate } from '../../src/common/school-time';
import { isReadOnlyStatus } from '../../src/requests/domain/access-policy';
import { NO_DEADLINE, nextDeadlineState, type DeadlineState } from '../../src/requests/domain/deadlines';
import { applyAction, type Actor, type RequestAction, type TransitionResult } from '../../src/requests/domain/request-state-machine';
import { transitionNotifications } from '../../src/requests/domain/transition-notifications';
import type { RequestRulesSnapshot } from '../../src/requests/request-policy.loader';
import { notificationRecipients } from '../../src/notifications/notifications.service';
import { isActiveWorkRequest, isLate, superAdminMayReceive, SUPERVISION_TYPES } from '../../src/notifications/super-admin-policy';
import { addMinutes, addWorkingMinutes, nextOpening, openingWindow, weekday } from './calendar';
import { Random, stableId } from './random';
import type { Fate, MessageMoment, Scenario } from './request-scenarios';
import type { CategoryKey, CategorySeed, FloorKey, StaffKind } from './school-data';

/**
 * Simulation pure du fonctionnement de l'école : chaque demande suit son circuit action par action
 * à travers la machine à états de l'application (applyAction), avec ses délais (nextDeadlineState),
 * ses notifications (transitionNotifications) et les effets des tâches planifiées (retards, alertes
 * du super administrateur, clôture automatique) à leur échéance. Une action refusée par la machine
 * arrête le jeu de données : aucun historique impossible n'est produit. Rien n'est daté après
 * `cutoff` : les étapes suivantes n'ont pas encore eu lieu.
 */

// ---------------------------------------------------------------------------
// Entrées
// ---------------------------------------------------------------------------

export interface DirectoryUser {
  id: string;
  username: string;
  displayName: string;
  firstName: string;
  role: Role;
  kind: StaffKind;
  floor?: FloorKey;
  classKey?: string;
}

export interface DirectoryCategory {
  id: string;
  name: string;
  seed: CategorySeed;
  recipientIds: string[];
  managerIds: string[];
}

export interface Directory {
  timeZone: string;
  users: DirectoryUser[];
  classes: Map<string, { name: string; room: string; floor: FloorKey; level: string }>;
  floors: Map<FloorKey, string>;
  categories: Map<CategoryKey, DirectoryCategory>;
  guidelines: Map<string, { id: string; title: string }>;
}

export interface SimulationOptions {
  /** Premier et dernier jour (dates locales « AAAA-MM-JJ »), inclus. */
  firstDay: string;
  lastDay: string;
  /** Instant présent de la simulation : rien n'est daté après. */
  cutoff: Date;
  seed: number;
  deadlineWarnPercent: number;
}

// ---------------------------------------------------------------------------
// Sorties
// ---------------------------------------------------------------------------

export interface DemoRequest extends Omit<Prisma.RequestCreateManyInput, 'number' | 'reference'> {
  id: string;
  createdAt: Date;
}

export interface DemoData {
  /** Par date de création : le numéro (séquence) est attribué dans cet ordre à l'insertion. */
  requests: DemoRequest[];
  /** Ordre chronologique d'écriture (la colonne seq suit l'ordre d'insertion). */
  events: Prisma.RequestEventCreateManyInput[];
  messages: Prisma.MessageCreateManyInput[];
  notifications: Prisma.NotificationCreateManyInput[];
  audits: Prisma.AuditLogCreateManyInput[];
}

// ---------------------------------------------------------------------------
// Délais humains (minutes ouvrées ; minutes calendaires pour les urgences)
// ---------------------------------------------------------------------------

type Step = 'APPROVE' | 'ACCEPT' | 'START' | 'COMPLETE' | 'CLOSE' | 'VALIDATE' | 'CORRECT' | 'RESUME' | 'CANCEL' | 'REFUSE' | 'REASSIGN';

const DELAYS: Record<Step, Record<Priority, readonly [number, number]>> = {
  APPROVE: { URGENT: [3, 12], HIGH: [10, 60], MEDIUM: [30, 200], NORMAL: [45, 420] },
  ACCEPT: { URGENT: [2, 8], HIGH: [5, 45], MEDIUM: [15, 150], NORMAL: [20, 300] },
  START: { URGENT: [2, 6], HIGH: [5, 60], MEDIUM: [20, 360], NORMAL: [30, 600] },
  COMPLETE: { URGENT: [15, 80], HIGH: [30, 300], MEDIUM: [60, 700], NORMAL: [90, 1200] },
  CLOSE: { URGENT: [20, 300], HIGH: [30, 600], MEDIUM: [90, 1500], NORMAL: [120, 2400] },
  VALIDATE: { URGENT: [15, 240], HIGH: [30, 480], MEDIUM: [60, 900], NORMAL: [90, 1500] },
  CORRECT: { URGENT: [10, 60], HIGH: [15, 120], MEDIUM: [20, 180], NORMAL: [20, 240] },
  RESUME: { URGENT: [5, 30], HIGH: [15, 120], MEDIUM: [30, 300], NORMAL: [60, 600] },
  CANCEL: { URGENT: [5, 30], HIGH: [10, 90], MEDIUM: [15, 120], NORMAL: [20, 180] },
  REFUSE: { URGENT: [5, 30], HIGH: [15, 120], MEDIUM: [30, 240], NORMAL: [45, 480] },
  REASSIGN: { URGENT: [5, 20], HIGH: [15, 60], MEDIUM: [30, 180], NORMAL: [60, 300] },
};

const ACKNOWLEDGEMENTS = [
  'Bien reçu, je m’en occupe dans la journée.',
  'C’est noté, je passe dès que possible.',
  'Je regarde cela tout à l’heure et je vous tiens au courant.',
  'Merci pour le signalement, je m’en charge.',
  'Reçu. Je vous préviens quand c’est fait.',
] as const;

const CORRECTION_DEFAULT = 'Le problème est réapparu, merci de vérifier à nouveau.';

// ---------------------------------------------------------------------------
// Plan d'une demande
// ---------------------------------------------------------------------------

type Who = 'REQUESTER' | 'ASSIGNEE' | 'MANAGER';

interface PlannedAction {
  action: RequestAction;
  who: Who;
  step: Step;
  reason?: string;
  /** Employé visé (SUBMIT en circuit A, APPROVE, REASSIGN). */
  assigneeId?: string;
}

interface PlannedMessage {
  after: MessageMoment;
  by: 'requester' | 'assignee';
  text: string;
}

interface Plan {
  index: number;
  scenario: Scenario;
  category: DirectoryCategory;
  requester: DirectoryUser;
  title: string;
  description: string;
  createdAt: Date;
  /** Destinataire initial : choisi (entre enseignants) ou service unique (circuit A). */
  directRecipient: DirectoryUser | null;
  /** Employé affecté par l'administration (circuit B). */
  approveTo: DirectoryUser | null;
  reassignTo: DirectoryUser | null;
  actions: PlannedAction[];
  messages: PlannedMessage[];
  /** Ralentit certaines étapes (oubli, absence) : retards réalistes. */
  slow: boolean;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

interface State {
  status: RequestStatus;
  assigneeId: string | null;
  autoCloseAt: Date | null;
  deadline: DeadlineState;
  version: number;
  updatedAt: Date;
  submittedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  assignedAt: Date | null;
  acceptedAt: Date | null;
  startedAt: Date | null;
  doneAt: Date | null;
  finalValidatedAt: Date | null;
  closedAt: Date | null;
  cancelledAt: Date | null;
  rejectionReason: string | null;
  urgentMarker: Date | null;
  unassignedMarker: Date | null;
  overdueMarker: Date | null;
  /** Première fin (lecture seule) : les alertes du super administrateur deviennent caduques. */
  finishedAt: Date | null;
}

interface Effect<T> {
  time: number;
  order: number;
  row: T;
}

const SUPERVISION = new Set<NotificationType>(SUPERVISION_TYPES);

export function simulateDemo(scenarios: readonly Scenario[], directory: Directory, options: SimulationOptions): DemoData {
  const random = new Random(options.seed);
  const tz = directory.timeZone;
  const userById = new Map(directory.users.map((u) => [u.id, u]));
  const superAdmins = directory.users.filter((u) => u.role === 'SUPER_ADMIN').map((u) => u.id);
  const manager = (category: DirectoryCategory) => {
    const id = category.managerIds[0];
    if (!id) throw new Error(`Catégorie sans admin : ${category.name}`);
    return userById.get(id)!;
  };

  // Rotation par type de personnel : les demandes viennent de nombreux collègues différents.
  const rotations = new Map<StaffKind, DirectoryUser[]>();
  const nextOf = (kind: StaffKind): DirectoryUser => {
    let queue = rotations.get(kind);
    if (!queue || queue.length === 0) {
      queue = random.shuffle(directory.users.filter((u) => u.kind === kind));
      if (queue.length === 0) throw new Error(`Aucun personnel : ${kind}`);
      rotations.set(kind, queue);
    }
    return queue.shift()!;
  };
  const byUsername = (username: string) => {
    const user = directory.users.find((u) => u.username === username);
    if (!user) throw new Error(`Compte introuvable : ${username}`);
    return user;
  };

  const plans = schedule(scenarios, options, tz, random).map(({ scenario, createdAt }, index) =>
    planOf(index, scenario, createdAt),
  );

  const events: Array<Effect<Prisma.RequestEventCreateManyInput>> = [];
  const messages: Prisma.MessageCreateManyInput[] = [];
  const notifications: Array<Effect<Prisma.NotificationCreateManyInput> & { requestIndex: number }> = [];
  const audits: Prisma.AuditLogCreateManyInput[] = [];
  const requests: DemoRequest[] = [];
  let order = 0;

  for (const plan of plans) simulateOne(plan);

  return {
    requests: requests.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    events: events.sort((a, b) => a.time - b.time || a.order - b.order).map((e) => e.row),
    messages,
    notifications: notifications.sort((a, b) => a.time - b.time || a.order - b.order).map((n) => n.row),
    audits: audits.sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime()),
  };

  // -------------------------------------------------------------------------

  function planOf(index: number, scenario: Scenario, createdAt: Date): Plan {
    const category = directory.categories.get(scenario.category);
    if (!category) throw new Error(`Catégorie inconnue : ${scenario.category}`);
    const requester = scenario.requester.startsWith('@') ? byUsername(scenario.requester.slice(1)) : nextOf(scenario.requester as StaffKind);
    const routing = category.seed.routingMode;
    const fate: Fate = scenario.fate ?? 'normal';

    // Destinataire en circuit A : service unique de la catégorie, ou collègue choisi (entraide).
    let directRecipient: DirectoryUser | null = null;
    if (routing === 'DIRECT') {
      if (category.recipientIds.length !== 1) throw new Error(`Service unique attendu : ${category.name}`);
      directRecipient = userById.get(category.recipientIds[0])!;
    } else if (routing === 'PEER') {
      directRecipient = colleagueOf(requester, random);
    }

    // Circuit B : l'administration affecte la personne cohérente avec la demande.
    let approveTo: DirectoryUser | null = null;
    let reassignTo: DirectoryUser | null = null;
    if (routing === 'VIA_ADMIN') {
      const kind: StaffKind = scenario.assignTo ?? (scenario.category === 'maintenance' ? 'technician' : 'supervisor');
      approveTo = kind === 'supervisor' ? floorSupervisor(requester, random) : nextOfKindIn(category, kind);
      if (fate === 'reassign') {
        reassignTo =
          kind === 'supervisor'
            ? floorSupervisor(requester, random, approveTo)
            : directory.users.find((u) => category.recipientIds.includes(u.id) && u.id !== approveTo!.id)!;
      }
    }

    // Personne n'est destinataire ni chargé de sa propre demande.
    for (const assignee of [directRecipient, approveTo, reassignTo]) {
      if (assignee?.id === requester.id) throw new Error(`${scenario.title} : ${requester.username} serait affecté à sa propre demande`);
    }
    const fill = (text: string) => fillPlaceholders(text, requester, directRecipient, directory);
    const actions = actionsFor(fate, routing, category.seed, scenario, approveTo, reassignTo);
    const messagesPlanned: PlannedMessage[] = (scenario.messages ?? []).map((m) => ({ ...m, text: fill(m.text) }));
    if (!scenario.messages && fate === 'normal' && random.chance(0.22)) {
      messagesPlanned.push({ after: 'ACCEPT', by: 'assignee', text: random.pick(ACKNOWLEDGEMENTS) });
    }
    return {
      index,
      scenario,
      category,
      requester,
      title: fill(scenario.title),
      description: fill(scenario.description),
      createdAt,
      directRecipient,
      approveTo,
      reassignTo,
      actions,
      messages: messagesPlanned,
      slow: random.chance(0.15),
    };
  }

  function nextOfKindIn(category: DirectoryCategory, kind: StaffKind): DirectoryUser {
    const candidate = directory.users.find((u) => u.kind === kind && category.recipientIds.includes(u.id));
    if (!candidate) throw new Error(`Aucun ${kind} affectable dans ${category.name}`);
    return candidate;
  }

  /** Surveillant de l'étage concerné (celui du demandeur), autre que le demandeur et que `except`. */
  function floorSupervisor(requester: DirectoryUser, rnd: Random, except?: DirectoryUser): DirectoryUser {
    const floor = requester.floor ?? rnd.pick([...directory.floors.keys()]);
    const sameFloor = directory.users.filter((u) => u.kind === 'supervisor' && u.floor === floor && u.id !== requester.id && u.id !== except?.id);
    if (sameFloor.length > 0) return rnd.pick(sameFloor);
    return rnd.pick(directory.users.filter((u) => u.kind === 'supervisor' && u.id !== requester.id && u.id !== except?.id));
  }

  /** Entraide : un enseignant du même niveau si possible (jamais le demandeur). */
  function colleagueOf(requester: DirectoryUser, rnd: Random): DirectoryUser {
    const level = requester.classKey ? directory.classes.get(requester.classKey)?.level : undefined;
    const teachers = directory.users.filter((u) => u.kind === 'teacher' && u.id !== requester.id);
    const sameLevel = teachers.filter((u) => u.classKey && directory.classes.get(u.classKey)?.level === level);
    return rnd.pick(sameLevel.length > 0 ? sameLevel : teachers);
  }

  // -------------------------------------------------------------------------

  function simulateOne(plan: Plan): void {
    if (plan.createdAt.getTime() > options.cutoff.getTime()) return;
    const { category, requester, scenario } = plan;
    const priority = scenario.priority;
    const rules = rulesSnapshot(category.seed, priority);
    const managers = category.managerIds;
    const requestId = stableId(`request:${plan.index}`);
    const at = (time: Date) => ({ time: time.getTime(), order: order++ });
    // Hasard propre à la demande : la date de coupure tronque son histoire sans la modifier.
    const random = new Random(hash(`${options.seed}:request:${plan.index}`));
    const serial = { notification: 0, event: 0, message: 0, audit: 0 };
    const idOf = (kind: keyof typeof serial) => stableId(`${kind}:${plan.index}:${serial[kind]++}`);

    const state: State = {
      status: 'DRAFT',
      assigneeId: null,
      autoCloseAt: null,
      deadline: NO_DEADLINE,
      version: 0,
      updatedAt: plan.createdAt,
      submittedAt: null,
      approvedAt: null,
      rejectedAt: null,
      assignedAt: null,
      acceptedAt: null,
      startedAt: null,
      doneAt: null,
      finalValidatedAt: null,
      closedAt: null,
      cancelledAt: null,
      rejectionReason: null,
      urgentMarker: null,
      unassignedMarker: null,
      overdueMarker: null,
      finishedAt: null,
    };
    const requestView = () => ({
      kind: 'WORK' as const,
      status: state.status,
      priority,
      requesterId: requester.id,
      assigneeId: state.assigneeId,
      currentDueAt: state.deadline.currentDueAt,
      overdueStage: state.deadline.overdueStage,
    });

    const actorsOf = (who: Who): { actorId: string; actors: Actor[] } => {
      if (who === 'REQUESTER') return { actorId: requester.id, actors: ['REQUESTER'] };
      if (who === 'MANAGER') return { actorId: manager(category).id, actors: ['MANAGER'] };
      if (!state.assigneeId) throw new Error(`${plan.title} : action de l'employé sans employé affecté`);
      return { actorId: state.assigneeId, actors: ['ASSIGNEE'] };
    };

    const notify = (time: Date, candidates: Array<string | null>, actorId: string | null, type: NotificationType, alert = false) => {
      for (const userId of notificationRecipients(candidates, actorId)) {
        if (userById.get(userId)?.role === 'SUPER_ADMIN' && !superAdminMayReceive(userId, type, requestView(), { alert, now: time })) continue;
        notifications.push({
          ...at(time),
          requestIndex: plan.index,
          row: { id: idOf('notification'), userId, type, requestId, priority, createdAt: time },
        });
      }
    };
    const event = (time: Date, row: Omit<Prisma.RequestEventCreateManyInput, 'requestId' | 'createdAt' | 'id'>) => {
      events.push({ ...at(time), row: { id: idOf('event'), requestId, createdAt: time, ...row } });
    };

    // --- Brouillon : enregistré, jamais envoyé (aucun historique, visible de son auteur seul).
    if ((scenario.fate ?? 'normal') === 'draft') {
      requests.push(rowOf(plan, requestId, rules, state, plan.directRecipient?.id ?? null));
      return;
    }

    // --- Tâches planifiées entre deux actions (rattrapage jusqu'à `until`).
    const runJobs = (until: Date) => {
      for (let guard = 0; guard < 20; guard += 1) {
        const due = nextJob();
        if (!due || due.time.getTime() > until.getTime() || due.time.getTime() > options.cutoff.getTime()) return;
        due.apply();
      }
    };
    const jitter = (time: Date, key: string) => new Date(time.getTime() + 2_000 + (hash(`${plan.index}:${key}`) % 13_000));
    const nextJob = (): { time: Date; apply: () => void } | null => {
      const candidates: Array<{ time: Date; apply: () => void }> = [];
      const d = state.deadline;
      const active = isActiveWorkRequest(requestView());
      if (d.currentStage && d.currentDueAt && d.overdueStage !== d.currentStage) {
        const time = jitter(d.currentDueAt, `overdue:${d.currentStage}:${d.currentDueAt.getTime()}`);
        candidates.push({
          time,
          apply: () => {
            state.deadline = { ...state.deadline, overdueStage: d.currentStage };
            state.updatedAt = time;
            event(time, { actorId: null, type: 'OVERDUE', toValue: { stage: d.currentStage } });
            notify(time, [...(category.seed.routingMode === 'VIA_ADMIN' ? managers : []), state.assigneeId], null, 'OVERDUE');
          },
        });
      }
      if (active && d.currentStage && d.currentDueAt && !state.overdueMarker) {
        const time = jitter(d.currentDueAt, `alert-overdue:${d.currentDueAt.getTime()}`);
        candidates.push({
          time: new Date(time.getTime() + 1),
          apply: () => {
            state.overdueMarker = time;
            notify(time, superAdmins, null, 'OVERDUE', true);
          },
        });
      }
      if (active && !state.assigneeId && d.warnAt && !state.unassignedMarker) {
        const time = jitter(d.warnAt, `alert-unassigned:${d.warnAt.getTime()}`);
        candidates.push({
          time,
          apply: () => {
            state.unassignedMarker = time;
            notify(time, superAdmins, null, 'UNASSIGNED', true);
          },
        });
      }
      if (state.status === 'DONE' && state.autoCloseAt) {
        const time = jitter(state.autoCloseAt, 'auto-close');
        candidates.push({ time, apply: () => perform({ action: 'CLOSE', who: 'REQUESTER', step: 'CLOSE' }, time, true) });
      }
      candidates.sort((a, b) => a.time.getTime() - b.time.getTime());
      return candidates[0] ?? null;
    };

    // --- Une transition de la machine à états, appliquée comme RequestTransitionsService.
    const perform = (planned: PlannedAction, time: Date, system = false): void => {
      const { actorId, actors } = system ? { actorId: null, actors: ['SYSTEM'] as Actor[] } : actorsOf(planned.who);
      const before = { assigneeId: state.assigneeId };
      const result = applyAction(
        {
          status: state.status,
          rules,
          hasVoice: false,
          hasDescription: true,
          assigneeId: state.assigneeId,
          autoCloseAt: state.autoCloseAt,
        },
        planned.action,
        {
          actors,
          now: time,
          reason: planned.reason,
          ...(planned.assigneeId ? { assigneeId: planned.assigneeId, assigneeAllowed: category.recipientIds.includes(planned.assigneeId) } : {}),
          proofPhotoCount: 0,
        },
      );
      if (!result.ok) throw new Error(`${plan.title} : ${planned.action} refusée (${result.code}) depuis ${state.status}`);
      applyResult(result, time, actorId, before);
    };

    const applyResult = (result: Extract<TransitionResult, { ok: true }>, time: Date, actorId: string | null, before: { assigneeId: string | null }) => {
      const action = result.steps[0].action;
      state.deadline = nextDeadlineState(state.deadline, result.steps, rules, time, options.deadlineWarnPercent);
      state.status = result.to;
      state.autoCloseAt = result.autoCloseAt;
      if (action !== 'SUBMIT') state.version += 1;
      state.updatedAt = time;
      if (result.assigneeId) {
        state.assigneeId = result.assigneeId;
        state.assignedAt = time;
      }
      for (const step of result.steps) {
        if (step.to === 'PENDING_ADMIN_VALIDATION') state.submittedAt = time;
        if (step.to === 'SENT' && step.action === 'SUBMIT') state.submittedAt = time;
        if (step.to === 'SENT' && step.action === 'APPROVE') state.approvedAt = time;
        if (step.to === 'ACCEPTED') state.acceptedAt = time;
        if (step.to === 'IN_PROGRESS') state.startedAt = time;
        if (step.to === 'DONE') state.doneAt = time;
        if (step.to === 'CLOSED') {
          state.closedAt = time;
          if (step.action === 'VALIDATE_FINAL') state.finalValidatedAt = time;
        }
        if (step.to === 'REJECTED') {
          state.rejectedAt = time;
          state.rejectionReason = result.reason ?? null;
        }
        if (step.to === 'CANCELLED') state.cancelledAt = time;
      }

      // Historique (recordTransition).
      if (action === 'SUBMIT') {
        event(time, { actorId, type: 'CREATED', toValue: { title: plan.title, priority, categoryId: category.id } });
      }
      result.steps.forEach((step, index) =>
        event(time, {
          actorId: step.actor === 'SYSTEM' ? null : actorId,
          type: 'STATUS_CHANGED',
          fromValue: { status: step.from },
          toValue: { status: step.to },
          comment: index === 0 ? (result.reason ?? null) : null,
        }),
      );
      if (result.assigneeId) {
        event(time, {
          actorId,
          type: action === 'REASSIGN' ? 'REASSIGNED' : 'ASSIGNED',
          fromValue: before.assigneeId ? { assigneeId: before.assigneeId } : undefined,
          toValue: { assigneeId: result.assigneeId, ...(action === 'APPROVE' ? { assigneeSource: 'MANAGER_CHOICE' } : {}) },
        });
      }
      const label = action === 'REJECT' || action === 'DECLINE' ? 'Motif du refus' : action === 'REQUEST_CORRECTION' ? 'À corriger' : null;
      if (label && result.reason) {
        messages.push({ id: idOf('message'), requestId, authorId: actorId, kind: 'SYSTEM', text: `${label} : ${result.reason}`, createdAt: time });
      }
      for (const target of transitionNotifications(result, before, { requesterId: requester.id, assigneeId: state.assigneeId, priority }, managers)) {
        notify(time, target.users, actorId, target.type);
      }
      if (priority === 'URGENT' && isActiveWorkRequest(requestView()) && !state.urgentMarker) {
        state.urgentMarker = time;
        notify(time, superAdmins, actorId, 'URGENT', true);
      }
      if (isReadOnlyStatus(state.status) && !state.finishedAt) state.finishedAt = time;

      if (['APPROVE', 'REJECT', 'REASSIGN', 'CANCEL', 'VALIDATE_FINAL', 'REQUEST_CORRECTION'].includes(action)) {
        audits.push({
          id: idOf('audit'),
          actorId,
          action: 'REQUEST_MANAGED',
          targetType: 'Request',
          targetId: requestId,
          details: {
            action,
            status: result.to,
            ...(result.reason ? { reasonGiven: true } : {}),
            ...(result.assigneeId !== undefined ? { before: { assigneeId: before.assigneeId }, after: { assigneeId: result.assigneeId } } : {}),
          },
          createdAt: time,
        });
      }
    };

    const postMessage = (time: Date, authorId: string, text: string) => {
      const messageId = idOf('message');
      messages.push({ id: messageId, requestId, authorId, clientId: stableId(`message-client:${messageId}`), kind: 'TEXT', text, createdAt: time });
      event(time, { actorId: authorId, type: 'MESSAGE_ADDED', toValue: { messageId, kind: 'TEXT' } });
      const view = requestView();
      const participants = state.assigneeId ? [requester.id, state.assigneeId] : [requester.id, ...managers];
      const supervisors = isActiveWorkRequest(view) && (priority === 'URGENT' || isLate(view, time)) ? superAdmins : [];
      notify(time, [...participants, ...supervisors], authorId, 'MESSAGE_NEW');
    };

    // --- Création et envoi (SUBMIT depuis le formulaire), puis propositions de l'assistance.
    perform(
      { action: 'SUBMIT', who: 'REQUESTER', step: 'ACCEPT', ...(plan.directRecipient ? { assigneeId: plan.directRecipient.id } : {}) },
      plan.createdAt,
    );
    if (scenario.assist) {
      const guideline = directory.guidelines.get(scenario.assist.guideline);
      if (!guideline) throw new Error(`Consigne inconnue : ${scenario.assist.guideline}`);
      const recipient = plan.directRecipient ? { recipientId: plan.directRecipient.id } : {};
      event(plan.createdAt, {
        actorId: requester.id,
        type: 'ASSIST_SUGGESTED',
        fromValue: {
          title: scenario.assist.proposedTitle ?? plan.title,
          categoryId: category.id,
          categoryName: category.name,
          priority: scenario.assist.proposedPriority ?? priority,
          ...recipient,
          sources: [{ id: guideline.id, title: guideline.title }],
        },
        toValue: { title: plan.title, categoryId: category.id, categoryName: category.name, priority, ...recipient },
      });
    }

    // --- Actions humaines, chacune après un délai réaliste ; tâches planifiées entre les deux.
    let time = plan.createdAt;
    let moment: MessageMoment = 'SUBMIT';
    const pending = [...plan.messages];
    for (const planned of plan.actions) {
      if (planned.action === scenario.waitsFor) break;
      const [min, max] = DELAYS[planned.step][priority];
      const minutes = random.int(min, max) * (plan.slow && planned.step !== 'CANCEL' ? random.int(2, 4) : 1);
      // Demandes courantes souvent traitées le lendemain matin (file d'attente de l'employé).
      const nextMorning = (priority === 'NORMAL' || priority === 'MEDIUM') && ['APPROVE', 'ACCEPT', 'START'].includes(planned.step) && random.chance(0.4);
      const next =
        priority === 'URGENT'
          ? addMinutes(time, minutes)
          : nextMorning
            ? addWorkingMinutes(nextOpening(time, tz), random.int(0, 120), tz)
            : addWorkingMinutes(time, minutes, tz);

      // Messages prévus après l'étape précédente : avant l'action suivante, fil encore ouvert.
      for (const message of pending.filter((m) => m.after === moment)) {
        pending.splice(pending.indexOf(message), 1);
        const author = message.by === 'requester' ? requester.id : state.assigneeId;
        const when = new Date(time.getTime() + (next.getTime() - time.getTime()) * (0.25 + random.next() * 0.4));
        if (!author || isReadOnlyStatus(state.status) || when.getTime() > options.cutoff.getTime()) continue;
        runJobs(when);
        postMessage(when, author, message.text);
      }

      runJobs(next);
      if (isReadOnlyStatus(state.status) && planned.action !== 'CLOSE' && planned.action !== 'VALIDATE_FINAL' && planned.action !== 'REQUEST_CORRECTION') break;
      if (state.status === 'CLOSED' || state.status === 'REJECTED' || state.status === 'CANCELLED') break;
      if (next.getTime() > options.cutoff.getTime()) break;
      perform(planned, next);
      time = next;
      moment = momentOf(planned.action) ?? moment;
    }
    runJobs(options.cutoff);

    requests.push(rowOf(plan, requestId, rules, state, state.assigneeId));
  }

  function rowOf(plan: Plan, id: string, rules: RequestRulesSnapshot, state: State, assigneeId: string | null): DemoRequest {
    return {
      id,
      kind: 'WORK',
      clientId: stableId(`request-client:${plan.index}`),
      title: plan.title,
      description: plan.description,
      categoryId: plan.category.id,
      priority: plan.scenario.priority,
      requesterId: plan.requester.id,
      assigneeId,
      status: state.status,
      version: state.version,
      rulesSnapshot: rules as unknown as Prisma.InputJsonValue,
      currentStage: state.deadline.currentStage,
      currentDueAt: state.deadline.currentDueAt,
      warnAt: state.deadline.warnAt,
      overdueStage: state.deadline.overdueStage,
      autoCloseAt: state.autoCloseAt,
      rejectionReason: state.rejectionReason,
      createdAt: plan.createdAt,
      submittedAt: state.submittedAt,
      approvedAt: state.approvedAt,
      rejectedAt: state.rejectedAt,
      assignedAt: state.assignedAt,
      acceptedAt: state.acceptedAt,
      startedAt: state.startedAt,
      doneAt: state.doneAt,
      finalValidatedAt: state.finalValidatedAt,
      closedAt: state.closedAt,
      cancelledAt: state.cancelledAt,
      superAdminUrgentNotifiedAt: state.urgentMarker,
      superAdminUnassignedNotifiedAt: state.unassignedMarker,
      superAdminOverdueNotifiedAt: state.overdueMarker,
      updatedAt: state.updatedAt,
    };
  }
}

// ---------------------------------------------------------------------------
// Lecture des notifications : après coup, de façon déterministe
// ---------------------------------------------------------------------------

/**
 * Une notification est lue quand son destinataire agit ensuite sur la demande, ou quelques minutes
 * à quelques heures plus tard (la plupart) ; les plus récentes restent non lues. Les alertes du
 * super administrateur sont marquées lues quand la demande se termine (clearOnFinishInTx).
 */
export function markReadings(data: DemoData, roles: Map<string, Role>, cutoff: Date, seed: number): void {
  const actionsBy = new Map<string, number[]>();
  for (const e of data.events) {
    if (!e.actorId) continue;
    const key = `${e.requestId}:${e.actorId}`;
    const list = actionsBy.get(key) ?? [];
    list.push((e.createdAt as Date).getTime());
    actionsBy.set(key, list);
  }
  const finishedAt = new Map<string, number>();
  for (const e of data.events) {
    const to = (e.toValue as { status?: RequestStatus } | null)?.status;
    if (e.type === 'STATUS_CHANGED' && to && isReadOnlyStatus(to) && !finishedAt.has(e.requestId)) {
      finishedAt.set(e.requestId, (e.createdAt as Date).getTime());
    }
  }
  const requestById = new Map(data.requests.map((r) => [r.id, r]));

  for (const n of data.notifications) {
    const created = (n.createdAt as Date).getTime();
    const ownAction = (actionsBy.get(`${n.requestId}:${n.userId}`) ?? []).find((t) => t > created);
    const request = requestById.get(n.requestId)!;
    const personal = n.userId === request.requesterId || n.userId === request.assigneeId;
    const finish = finishedAt.get(n.requestId);
    const cleared = roles.get(n.userId) === 'SUPER_ADMIN' && !personal && SUPERVISION.has(n.type) && finish !== undefined && finish >= created ? finish : undefined;
    const random = new Random(hash(`${seed}:${n.id}`));
    const browsed = cutoff.getTime() - created > 4 * 3_600_000 && random.chance(0.86) ? created + random.int(3, 240) * 60_000 : undefined;
    const readAt = [ownAction, cleared, browsed].filter((t): t is number => t !== undefined && t <= cutoff.getTime()).sort((a, b) => a - b)[0];
    n.readAt = readAt === undefined ? null : new Date(readAt);
  }
}

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

function hash(text: string): number {
  let h = 2166136261;
  for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function momentOf(action: RequestAction): MessageMoment | null {
  if (action === 'SUBMIT' || action === 'APPROVE' || action === 'ACCEPT' || action === 'START') return action;
  return null;
}

/** Même instantané que RequestPolicyLoader.rulesSnapshot (catégorie + délais de la priorité). */
export function rulesSnapshot(seed: CategorySeed, priority: Priority): RequestRulesSnapshot {
  const circuitB = seed.routingMode === 'VIA_ADMIN';
  const rule = seed.deadlines[priority];
  return {
    circuit: circuitB ? 'B_ADMIN_VALIDATION' : 'A_DIRECT',
    closureMode: seed.closureMode,
    autoCloseAfterMinutes: seed.autoCloseAfterMinutes,
    finalValidation: circuitB && seed.finalValidation,
    assignmentMode: 'MANUAL',
    autoAssigneeId: null,
    photoRequired: false,
    validationMinutes: circuitB ? rule.validationMinutes : null,
    takeoverMinutes: rule.takeoverMinutes,
    completionMinutes: rule.completionMinutes,
  };
}

/** Parcours d'une demande selon son issue et les règles de sa catégorie. */
function actionsFor(
  fate: Fate,
  routing: CategorySeed['routingMode'],
  category: CategorySeed,
  scenario: Scenario,
  approveTo: DirectoryUser | null,
  reassignTo: DirectoryUser | null,
): PlannedAction[] {
  const reason = scenario.reason;
  const work: PlannedAction[] = [
    { action: 'ACCEPT', who: 'ASSIGNEE', step: 'ACCEPT' },
    { action: 'START', who: 'ASSIGNEE', step: 'START' },
    { action: 'COMPLETE', who: 'ASSIGNEE', step: 'COMPLETE' },
  ];
  const finalValidation = routing === 'VIA_ADMIN' && category.finalValidation;
  const closing: PlannedAction[] = finalValidation
    ? [{ action: 'VALIDATE_FINAL', who: 'MANAGER', step: 'VALIDATE' }]
    : category.closureMode === 'REQUESTER'
      ? [{ action: 'CLOSE', who: 'REQUESTER', step: 'CLOSE' }]
      : category.closureMode === 'MANAGER'
        ? [{ action: 'CLOSE', who: 'MANAGER', step: 'CLOSE' }]
        : []; // AUTO : la tâche planifiée clôt à l'échéance.
  const correction: PlannedAction[] = [
    { action: 'REQUEST_CORRECTION', who: finalValidation ? 'MANAGER' : 'REQUESTER', step: 'CORRECT', reason: reason ?? CORRECTION_DEFAULT },
    { action: 'RESUME', who: 'ASSIGNEE', step: 'RESUME' },
    { action: 'COMPLETE', who: 'ASSIGNEE', step: 'COMPLETE' },
  ];

  const approval: PlannedAction[] =
    routing === 'VIA_ADMIN' ? [{ action: 'APPROVE', who: 'MANAGER', step: 'APPROVE', assigneeId: approveTo!.id }] : [];

  switch (fate) {
    case 'reject':
      if (routing !== 'VIA_ADMIN') throw new Error(`${scenario.title} : refus par l'administration hors circuit B`);
      return [{ action: 'REJECT', who: 'MANAGER', step: 'APPROVE', reason }];
    case 'cancel':
      return [{ action: 'CANCEL', who: 'REQUESTER', step: 'CANCEL', reason }];
    case 'decline':
      return [...approval, { action: 'DECLINE', who: 'ASSIGNEE', step: 'REFUSE', reason }];
    case 'correction':
      return [...approval, ...work, ...correction, ...closing];
    case 'reassign':
      if (!reassignTo) throw new Error(`${scenario.title} : réaffectation sans second employé`);
      return [
        ...approval,
        { action: 'ACCEPT', who: 'ASSIGNEE', step: 'ACCEPT' },
        { action: 'REASSIGN', who: 'MANAGER', step: 'REASSIGN', assigneeId: reassignTo.id },
        ...work,
        ...closing,
      ];
    default:
      return [...approval, ...work, ...closing];
  }
}

function fillPlaceholders(text: string, requester: DirectoryUser, colleague: DirectoryUser | null, directory: Directory): string {
  const schoolClass = requester.classKey ? directory.classes.get(requester.classKey) : undefined;
  const floorKey = requester.floor ?? schoolClass?.floor;
  const values: Record<string, string | undefined> = {
    classe: schoolClass?.name,
    salle: schoolClass?.room.replace(/^Salle/, 'salle'),
    etage: floorKey ? directory.floors.get(floorKey)?.toLocaleLowerCase('fr') : undefined,
    collegue: colleague?.firstName,
  };
  return text.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = values[key];
    if (!value) throw new Error(`Repère {${key}} sans valeur pour ${requester.username} : « ${text} »`);
    return value;
  });
}

/**
 * Dates de création : chaque jour de la période reçoit des demandes (moins le samedi, une ou deux
 * le dimanche), à des heures variées (matin, midi, après-midi, fin de journée).
 */
function schedule(scenarios: readonly Scenario[], options: SimulationOptions, tz: string, random: Random): Array<{ scenario: Scenario; createdAt: Date }> {
  const days: string[] = [];
  for (let day = options.firstDay; day <= options.lastDay; day = addDays(day, 1)) days.push(day);
  // Activité qui s'intensifie au fil des semaines (installation de l'année, préparation des évaluations).
  const weightOf = (day: string, i: number) => [1, 9, 9, 7, 9, 8, 3][weekday(day)] * (0.75 + random.next() * 0.5) * (0.7 + (0.8 * i) / (days.length - 1));
  const weights = days.map(weightOf);
  const total = weights.reduce((a, b) => a + b, 0);
  const counts = weights.map((w) => Math.max(1, Math.floor((w / total) * scenarios.length)));
  for (let i = 0; counts.reduce((a, b) => a + b, 0) < scenarios.length; i = (i + 1) % days.length) {
    if (weekday(days[i]) !== 0) counts[i] += 1;
  }
  while (counts.reduce((a, b) => a + b, 0) > scenarios.length) counts[counts.indexOf(Math.max(...counts))] -= 1;

  // Les situations « récentes » sont placées en premier sur les derniers jours ouvrés.
  const shuffled = random.shuffle(scenarios);
  const recent = shuffled.filter((s) => s.recent);
  const others = shuffled.filter((s) => !s.recent);
  const assigned: Scenario[][] = days.map(() => []);
  for (let i = days.length - 1; i >= 0 && recent.length > 0; i -= 1) {
    while (assigned[i].length < counts[i] && recent.length > 0 && weekday(days[i]) !== 0) assigned[i].push(recent.shift()!);
  }
  days.forEach((_day, i) => {
    while (assigned[i].length < counts[i]) assigned[i].push(others.shift()!);
  });
  const result: Array<{ scenario: Scenario; createdAt: Date }> = [];
  days.forEach((day, i) => {
    for (const scenario of assigned[i]) result.push({ scenario, createdAt: creationTime(day, tz, random) });
  });
  return result.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function creationTime(day: string, tz: string, random: Random): Date {
  const window = openingWindow(day, tz);
  // Dimanche : permanence de la direction et de l'entretien, en matinée.
  const start = window?.start ?? atLocalTime(day, '09:00', tz);
  const end = window?.end ?? atLocalTime(day, '11:30', tz);
  const span = end.getTime() - start.getTime();
  // Pic du matin, creux de midi, reprise l'après-midi, quelques demandes en fin de journée.
  const slot = random.weighted<readonly [number, number]>([
    [[0, 0.3], 45],
    [[0.3, 0.5], 18],
    [[0.5, 0.85], 27],
    [[0.85, 1], 10],
  ]);
  const fraction = slot[0] + random.next() * (slot[1] - slot[0]);
  const time = new Date(start.getTime() + Math.floor((fraction * span) / 60_000) * 60_000 + random.int(0, 59) * 1000);
  if (localDate(time, tz) !== day) throw new Error(`Création hors du jour ${day}`);
  return time;
}
