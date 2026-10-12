import type {
  AssignmentMode,
  Circuit,
  ClosureMode,
  RequestStatus,
} from '@prisma/client';

/**
 * Machine à états des demandes — specs/001-demandes-travail-vocales/data-model.md §Machine à états.
 * Module pur : aucune dépendance à la base. Le service applique le résultat en base
 * (verrouillage optimiste, historique, notifications).
 */

export const ALL_STATUSES: readonly RequestStatus[] = [
  'DRAFT',
  'PENDING_ADMIN_VALIDATION',
  'SENT',
  'ACCEPTED',
  'IN_PROGRESS',
  'DONE',
  'PENDING_FINAL_VALIDATION',
  'TO_CORRECT',
  'CLOSED',
  'REJECTED',
  'CANCELLED',
];

export const ALL_ACTIONS = [
  'SUBMIT',
  'APPROVE',
  'REJECT',
  'DECLINE',
  'CANCEL',
  'ACCEPT',
  'START',
  'COMPLETE',
  'CLOSE',
  'VALIDATE_FINAL',
  'REQUEST_CORRECTION',
  'RESUME',
  'REASSIGN',
] as const;

export type RequestAction = (typeof ALL_ACTIONS)[number];

/**
 * Relation de l'utilisateur avec la demande. Le super administrateur agit en tant que MANAGER.
 * SYSTEM désigne les règles automatiques et les jobs planifiés.
 */
export type Actor = 'REQUESTER' | 'ASSIGNEE' | 'MANAGER' | 'SYSTEM';

/** Copie des règles de la catégorie prise à la création de la demande (FR-022). */
export interface RulesSnapshot {
  circuit: Circuit;
  closureMode: ClosureMode;
  autoCloseAfterMinutes: number;
  finalValidation: boolean;
  assignmentMode: AssignmentMode;
  photoRequired: boolean;
}

export interface MachineRequest {
  status: RequestStatus;
  rules: RulesSnapshot;
  hasVoice: boolean;
  hasDescription: boolean;
  assigneeId: string | null;
  autoCloseAt: Date | null;
}

export interface ActionContext {
  /** Toutes les relations de l'utilisateur avec la demande (il peut en cumuler plusieurs). */
  actors: readonly Actor[];
  now: Date;
  /** Motif (REJECT, DECLINE) ou commentaire (REQUEST_CORRECTION). */
  reason?: string;
  /** Employé visé par SUBMIT (circuit A), APPROVE ou REASSIGN, résolu par l'appelant. */
  assigneeId?: string;
  /** Vrai si `assigneeId` est un utilisateur actif parmi les destinataires de la catégorie. */
  assigneeAllowed?: boolean;
  /** Nombre de photos de preuve jointes au passage à « Terminée ». */
  proofPhotoCount?: number;
}

export type TransitionErrorCode =
  | 'INVALID_TRANSITION'
  | 'FORBIDDEN'
  | 'REASON_REQUIRED'
  | 'PHOTO_REQUIRED'
  | 'CONTENT_REQUIRED'
  | 'RECIPIENT_NOT_ALLOWED'
  | 'ASSIGNEE_REQUIRED';

export interface TransitionStep {
  from: RequestStatus;
  to: RequestStatus;
  action: RequestAction;
  actor: Actor;
}

export type TransitionResult =
  | {
      ok: true;
      from: RequestStatus;
      to: RequestStatus;
      /** Étapes appliquées, transitions automatiques comprises (T11, T12 immédiate). */
      steps: TransitionStep[];
      /** Affecté après la transition (inchangé si absent). */
      assigneeId?: string;
      /** Nouvelle échéance de clôture automatique ; null = aucune. */
      autoCloseAt: Date | null;
      reason?: string;
    }
  | { ok: false; code: TransitionErrorCode };

type Guard = (req: MachineRequest, ctx: ActionContext, actor: Actor) => TransitionErrorCode | null;

interface Transition {
  id: string;
  from: RequestStatus;
  action: RequestAction;
  to: RequestStatus;
  /** Acteurs autorisés, éventuellement selon les règles de la demande. */
  actors: (req: MachineRequest) => readonly Actor[];
  /** Transition applicable seulement si ce prédicat est vrai (ex. selon le circuit). */
  when?: (req: MachineRequest) => boolean;
  guards?: Guard[];
  /** Cette transition fixe l'employé affecté à partir de ctx.assigneeId. */
  assigns?: boolean;
}

const requiresReason: Guard = (_req, ctx) => (ctx.reason?.trim() ? null : 'REASON_REQUIRED');

const requiresContent: Guard = (req) => (req.hasVoice || req.hasDescription ? null : 'CONTENT_REQUIRED');

const requiresAllowedAssignee: Guard = (_req, ctx) =>
  ctx.assigneeId && ctx.assigneeAllowed ? null : 'RECIPIENT_NOT_ALLOWED';

const requiresApprovalAssignee: Guard = (_req, ctx) => {
  if (!ctx.assigneeId) return 'ASSIGNEE_REQUIRED';
  return ctx.assigneeAllowed ? null : 'RECIPIENT_NOT_ALLOWED';
};

/** En clôture automatique, le système ne clôt qu'à l'expiration du délai de grâce. */
const autoCloseDue: Guard = (req, ctx, actor) =>
  actor === 'SYSTEM' && (req.autoCloseAt === null || req.autoCloseAt.getTime() > ctx.now.getTime())
    ? 'INVALID_TRANSITION'
    : null;

const requiresProofPhoto: Guard = (req, ctx) =>
  req.rules.photoRequired && (ctx.proofPhotoCount ?? 0) < 1 ? 'PHOTO_REQUIRED' : null;

const only =
  (...actors: Actor[]) =>
  (): readonly Actor[] =>
    actors;

const closingActors = (req: MachineRequest): readonly Actor[] => {
  switch (req.rules.closureMode) {
    case 'REQUESTER':
      return ['REQUESTER'];
    case 'MANAGER':
      return ['MANAGER'];
    case 'AUTO':
      return ['SYSTEM'];
  }
};

const REASSIGNABLE: readonly RequestStatus[] = ['SENT', 'ACCEPTED', 'IN_PROGRESS', 'TO_CORRECT'];

const TRANSITIONS: readonly Transition[] = [
  {
    id: 'T1',
    from: 'DRAFT',
    action: 'SUBMIT',
    to: 'SENT',
    actors: only('REQUESTER'),
    when: (req) => req.rules.circuit === 'A_DIRECT',
    guards: [requiresContent, requiresAllowedAssignee],
    assigns: true,
  },
  {
    id: 'T2',
    from: 'DRAFT',
    action: 'SUBMIT',
    to: 'PENDING_ADMIN_VALIDATION',
    actors: only('REQUESTER'),
    when: (req) => req.rules.circuit === 'B_ADMIN_VALIDATION',
    guards: [requiresContent],
  },
  {
    id: 'T3',
    from: 'PENDING_ADMIN_VALIDATION',
    action: 'APPROVE',
    to: 'SENT',
    actors: only('MANAGER'),
    guards: [requiresApprovalAssignee],
    assigns: true,
  },
  { id: 'T4', from: 'PENDING_ADMIN_VALIDATION', action: 'REJECT', to: 'REJECTED', actors: only('MANAGER'), guards: [requiresReason] },
  { id: 'T5', from: 'PENDING_ADMIN_VALIDATION', action: 'CANCEL', to: 'CANCELLED', actors: only('REQUESTER') },
  { id: 'T6', from: 'SENT', action: 'ACCEPT', to: 'ACCEPTED', actors: only('ASSIGNEE') },
  { id: 'T7', from: 'SENT', action: 'DECLINE', to: 'REJECTED', actors: only('ASSIGNEE'), guards: [requiresReason] },
  { id: 'T8', from: 'SENT', action: 'CANCEL', to: 'CANCELLED', actors: only('REQUESTER') },
  { id: 'T9', from: 'ACCEPTED', action: 'START', to: 'IN_PROGRESS', actors: only('ASSIGNEE') },
  { id: 'T10', from: 'IN_PROGRESS', action: 'COMPLETE', to: 'DONE', actors: only('ASSIGNEE'), guards: [requiresProofPhoto] },
  {
    id: 'T13',
    from: 'DONE',
    action: 'CLOSE',
    to: 'CLOSED',
    actors: closingActors,
    guards: [autoCloseDue],
  },
  { id: 'T14', from: 'PENDING_FINAL_VALIDATION', action: 'VALIDATE_FINAL', to: 'CLOSED', actors: only('MANAGER') },
  { id: 'T15', from: 'DONE', action: 'REQUEST_CORRECTION', to: 'TO_CORRECT', actors: only('REQUESTER'), guards: [requiresReason] },
  {
    id: 'T16',
    from: 'PENDING_FINAL_VALIDATION',
    action: 'REQUEST_CORRECTION',
    to: 'TO_CORRECT',
    actors: only('MANAGER'),
    guards: [requiresReason],
  },
  { id: 'T17', from: 'TO_CORRECT', action: 'RESUME', to: 'IN_PROGRESS', actors: only('ASSIGNEE') },
  ...REASSIGNABLE.map(
    (from): Transition => ({
      id: `T18-${from}`,
      from,
      action: 'REASSIGN',
      to: 'SENT',
      actors: only('MANAGER'),
      guards: [requiresAllowedAssignee],
      assigns: true,
    }),
  ),
];

const MINUTE_MS = 60_000;

function findTransition(req: MachineRequest, action: RequestAction): Transition | undefined {
  return TRANSITIONS.find((t) => t.from === req.status && t.action === action && (t.when?.(req) ?? true));
}

function pickActor(transition: Transition, req: MachineRequest, actors: readonly Actor[]): Actor | undefined {
  const allowed = transition.actors(req);
  return actors.find((actor) => allowed.includes(actor));
}

/**
 * Applique une action à une demande. Ordre des contrôles :
 * statut/action (INVALID_TRANSITION) → acteur (FORBIDDEN) → gardes (codes métier).
 */
export function applyAction(req: MachineRequest, action: RequestAction, ctx: ActionContext): TransitionResult {
  const transition = findTransition(req, action);
  if (!transition) return { ok: false, code: 'INVALID_TRANSITION' };

  const actor = pickActor(transition, req, ctx.actors);
  if (!actor) return { ok: false, code: 'FORBIDDEN' };

  for (const guard of transition.guards ?? []) {
    const code = guard(req, ctx, actor);
    if (code) return { ok: false, code };
  }

  const steps: TransitionStep[] = [{ from: req.status, to: transition.to, action, actor }];
  let to = transition.to;
  let autoCloseAt: Date | null = req.autoCloseAt;

  if (action === 'COMPLETE') {
    // T11 / T12 : transitions automatiques après le passage à « Terminée ».
    if (req.rules.finalValidation) {
      steps.push({ from: 'DONE', to: 'PENDING_FINAL_VALIDATION', action, actor: 'SYSTEM' });
      to = 'PENDING_FINAL_VALIDATION';
      autoCloseAt = null;
    } else if (req.rules.closureMode === 'AUTO') {
      if (req.rules.autoCloseAfterMinutes <= 0) {
        steps.push({ from: 'DONE', to: 'CLOSED', action: 'CLOSE', actor: 'SYSTEM' });
        to = 'CLOSED';
        autoCloseAt = null;
      } else {
        autoCloseAt = new Date(ctx.now.getTime() + req.rules.autoCloseAfterMinutes * MINUTE_MS);
      }
    } else {
      autoCloseAt = null;
    }
  } else if (to !== 'DONE') {
    // Quitter « Terminée » (correction, clôture) annule toute clôture automatique programmée.
    autoCloseAt = null;
  }

  return {
    ok: true,
    from: req.status,
    to,
    steps,
    ...(transition.assigns && ctx.assigneeId ? { assigneeId: ctx.assigneeId } : {}),
    autoCloseAt,
    ...(ctx.reason?.trim() ? { reason: ctx.reason.trim() } : {}),
  };
}

/**
 * Actions que les acteurs donnés peuvent tenter sur la demande, selon son statut et ses règles
 * (sans évaluer les gardes qui dépendent d'une saisie : motif, photo, employé choisi).
 * Les actions réservées au système ne sont jamais proposées.
 */
export function availableActions(req: MachineRequest, actors: readonly Actor[]): RequestAction[] {
  const humanActors = actors.filter((actor) => actor !== 'SYSTEM');
  const result = new Set<RequestAction>();
  for (const action of ALL_ACTIONS) {
    const transition = findTransition(req, action);
    if (transition && pickActor(transition, req, humanActors)) result.add(action);
  }
  return [...result];
}
