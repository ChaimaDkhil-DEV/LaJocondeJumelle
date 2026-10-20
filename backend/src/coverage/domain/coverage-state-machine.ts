import type { ProofMode, RequestStatus } from '@prisma/client';

/**
 * Machine à états des affectations (garde enrichie, 004 — data-model §4).
 * Module pur, même principe que requests/domain/request-state-machine.ts : le service applique
 * le résultat en base (mise à jour conditionnelle, historique, échéances, notifications).
 *
 * En attente → Assignée (En route, En retard) → En cours (Relève demandée) → Terminée (Clôturée).
 * Finaux : Terminée, Annulée, Non pourvue. Seul l'admin assigne ; la diffusion n'existe plus.
 * Statut principal et sous-état : voir coverage-status.ts.
 */

export const COVERAGE_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'EN_ROUTE',
  'LATE',
  'ON_DUTY',
  'RELIEF_PENDING',
  'DONE',
  'CLOSED',
  'CANCELLED',
  'UNFILLED',
] as const satisfies readonly RequestStatus[];

export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

/** Affectation prise et non terminée : rend le surveillant occupé sur le créneau. */
export const ACTIVE_GUARD_STATUSES: readonly CoverageStatus[] = ['ACCEPTED', 'EN_ROUTE', 'LATE', 'ON_DUTY', 'RELIEF_PENDING'];
/** Assignée, présence pas encore confirmée : réassignation directe possible. */
const BEFORE_PRESENCE: readonly CoverageStatus[] = ['ACCEPTED', 'EN_ROUTE', 'LATE'];
const ON_SITE: readonly CoverageStatus[] = ['ON_DUTY', 'RELIEF_PENDING'];
const ACTIVE: readonly CoverageStatus[] = ['PENDING', ...ACTIVE_GUARD_STATUSES];
/** Terminée (y compris clôturée), annulée, non pourvue (FR-008a). */
export const FINAL_COVERAGE_STATUSES: readonly CoverageStatus[] = ['DONE', 'CLOSED', 'CANCELLED', 'UNFILLED'];

export function isCoverageStatus(status: RequestStatus): status is CoverageStatus {
  return (COVERAGE_STATUSES as readonly RequestStatus[]).includes(status);
}

export const COVERAGE_ACTIONS = [
  'ASSIGN',
  'REASSIGN',
  'UPDATE',
  'WITHDRAW',
  'DEPART',
  'CONFIRM_PRESENCE',
  'REQUEST_RELIEF',
  'RELEASE_BY_MANAGER',
  'RELIEVE',
  'EXTEND',
  'VALIDATE',
  'CANCEL',
  'SET_TEACHER',
  'RELEASE_SUPPORT',
  // Réservées au système (jobs, déclaration rattachée, relève par un remplaçant).
  'ATTACH_DECLARATION',
  'EXPIRE',
  'EXPIRE_UNFILLED',
  'RELIEF_ABANDONED',
] as const;

export type CoverageAction = (typeof COVERAGE_ACTIONS)[number];

const SYSTEM_ACTIONS: readonly CoverageAction[] = ['ATTACH_DECLARATION', 'EXPIRE', 'EXPIRE_UNFILLED', 'RELIEF_ABANDONED'];

/** Actions qu'un utilisateur peut demander par l'API (les actions système sont refusées). */
export const USER_COVERAGE_ACTIONS: readonly CoverageAction[] = COVERAGE_ACTIONS.filter((a) => !SYSTEM_ACTIONS.includes(a));

export function isCoverageAction(action: string): action is CoverageAction {
  return (COVERAGE_ACTIONS as readonly string[]).includes(action);
}

/** Créations : chacune a un statut de départ et un seul acteur. */
export const COVERAGE_CREATIONS = ['CREATE_TEACHER_REQUEST', 'CREATE_DIRECT', 'DECLARE_EMPTY_CLASS'] as const;
export type CoverageCreation = (typeof COVERAGE_CREATIONS)[number];

/**
 * ADMIN : rôle admin ou super administrateur.
 * ASSIGNEE : surveillant affecté. SUPPORT : surveillant en renfort (aucune action).
 * REQUESTER_TEACHER : enseignant auteur de la demande. SUPERVISOR : membre du groupe Surveillants.
 */
export type CoverageActor = 'ADMIN' | 'ASSIGNEE' | 'SUPPORT' | 'REQUESTER_TEACHER' | 'SUPERVISOR' | 'SYSTEM';

export interface CoverageRules {
  proofMode: ProofMode;
  finalValidation: boolean;
}

export interface CoverageMachineState {
  status: CoverageStatus;
  assigneeId: string | null;
  rules: CoverageRules;
}

/** Prolongation : minutes ajoutées, bornées. */
export const EXTEND_MIN_MINUTES = 1;
export const EXTEND_MAX_MINUTES = 480;

export interface CoverageContext {
  actors: readonly CoverageActor[];
  /** Utilisateur qui agit (déclarant d'une classe vide). */
  userId?: string;
  reason?: string;
  /** ASSIGN / REASSIGN / CREATE_DIRECT : le surveillant visé est disponible sur le créneau. */
  available?: boolean;
  /** ASSIGN / REASSIGN / CREATE_DIRECT / ATTACH_DECLARATION : surveillant visé. */
  assigneeId?: string;
  /** Le surveillant visé est un membre actif du groupe Surveillants. */
  assigneeEligible?: boolean;
  /** CONFIRM_PRESENCE : preuves valides fournies (photo prise, QR de la bonne classe). */
  proof?: { photo: boolean; qr: boolean };
  /** EXTEND : minutes ajoutées. */
  minutes?: number;
}

export type CoverageErrorCode =
  | 'UNKNOWN_ACTION'
  | 'INVALID_TRANSITION'
  | 'FORBIDDEN'
  | 'REASON_REQUIRED'
  | 'NOT_AVAILABLE'
  | 'ASSIGNEE_REQUIRED'
  | 'RECIPIENT_NOT_ALLOWED'
  | 'PROOF_REQUIRED'
  | 'INVALID_DURATION';

export interface CoverageStep {
  from: CoverageStatus;
  to: CoverageStatus;
  action: CoverageAction;
  actor: CoverageActor;
}

export type CoverageResult =
  | {
      ok: true;
      from: CoverageStatus;
      to: CoverageStatus;
      steps: CoverageStep[];
      /** Surveillant affecté après l'action : string = nouveau, null = retiré, absent = inchangé. */
      assigneeId?: string | null;
      /** REASSIGN sur site : la relève est assignée à ce surveillant (FR-008j). */
      reliefAssigneeId?: string;
      reason?: string;
    }
  | { ok: false; code: CoverageErrorCode };

export type CoverageCreationResult =
  | { ok: true; to: CoverageStatus; actor: CoverageActor; assigneeId?: string }
  | { ok: false; code: CoverageErrorCode };

type Guard = (state: CoverageMachineState | null, ctx: CoverageContext) => CoverageErrorCode | null;

interface Transition {
  from: readonly CoverageStatus[];
  action: CoverageAction;
  /** Statut d'arrivée ; 'same' = le statut ne change pas (événement journalisé seulement). */
  to: CoverageStatus | 'same';
  actors: readonly CoverageActor[];
  guards?: Guard[];
}

const requiresReason: Guard = (_s, ctx) => (ctx.reason?.trim() ? null : 'REASON_REQUIRED');

/** Jamais de forçage : un surveillant indisponible n'est pas assigné (FR-010). */
const requiresAvailability: Guard = (_s, ctx) => (ctx.available ? null : 'NOT_AVAILABLE');

const requiresEligibleAssignee: Guard = (state, ctx) => {
  if (!ctx.assigneeId) return 'ASSIGNEE_REQUIRED';
  if (!ctx.assigneeEligible) return 'RECIPIENT_NOT_ALLOWED';
  // Réassigner à la même personne n'a pas de sens.
  return state && ctx.assigneeId === state.assigneeId ? 'RECIPIENT_NOT_ALLOWED' : null;
};

const requiresAssignee: Guard = (_s, ctx) => (ctx.assigneeId ? null : 'ASSIGNEE_REQUIRED');

const requiresProof: Guard = (state, ctx) => {
  const proof = ctx.proof ?? { photo: false, qr: false };
  switch (state!.rules.proofMode) {
    case 'PHOTO':
      return proof.photo ? null : 'PROOF_REQUIRED';
    case 'QR':
      return proof.qr ? null : 'PROOF_REQUIRED';
    case 'BOTH':
      return proof.photo && proof.qr ? null : 'PROOF_REQUIRED';
  }
};

/** Preuve supplémentaire pendant l'affectation : au moins une preuve valide. */
const requiresAnyProof: Guard = (_s, ctx) => (ctx.proof?.photo || ctx.proof?.qr ? null : 'PROOF_REQUIRED');

const requiresMinutes: Guard = (_s, ctx) =>
  Number.isInteger(ctx.minutes) && ctx.minutes! >= EXTEND_MIN_MINUTES && ctx.minutes! <= EXTEND_MAX_MINUTES
    ? null
    : 'INVALID_DURATION';

const ASSIGNMENT_GUARDS = [requiresEligibleAssignee, requiresAvailability];

const TRANSITIONS: readonly Transition[] = [
  // En attente : l'admin assigne ou annule ; l'enseignant auteur modifie ou retire (FR-008b, FR-008g).
  { from: ['PENDING'], action: 'ASSIGN', to: 'ACCEPTED', actors: ['ADMIN'], guards: ASSIGNMENT_GUARDS },
  { from: ['PENDING'], action: 'UPDATE', to: 'same', actors: ['REQUESTER_TEACHER'] },
  { from: ['PENDING'], action: 'WITHDRAW', to: 'CANCELLED', actors: ['REQUESTER_TEACHER'] },
  { from: ['PENDING'], action: 'ATTACH_DECLARATION', to: 'ON_DUTY', actors: ['SYSTEM'], guards: [requiresAssignee] },
  { from: ['PENDING'], action: 'EXPIRE_UNFILLED', to: 'UNFILLED', actors: ['SYSTEM'] },

  // Réassignation : directe avant la présence ; par relève assignée sur site (FR-008e, FR-008j).
  { from: BEFORE_PRESENCE, action: 'REASSIGN', to: 'ACCEPTED', actors: ['ADMIN'], guards: ASSIGNMENT_GUARDS },
  { from: ON_SITE, action: 'REASSIGN', to: 'same', actors: ['ADMIN'], guards: ASSIGNMENT_GUARDS },

  { from: ['ACCEPTED'], action: 'DEPART', to: 'EN_ROUTE', actors: ['ASSIGNEE'] },
  { from: ['ACCEPTED', 'EN_ROUTE'], action: 'EXPIRE', to: 'LATE', actors: ['SYSTEM'] },
  { from: BEFORE_PRESENCE, action: 'CONFIRM_PRESENCE', to: 'ON_DUTY', actors: ['ASSIGNEE'], guards: [requiresProof] },
  { from: ON_SITE, action: 'CONFIRM_PRESENCE', to: 'same', actors: ['ASSIGNEE'], guards: [requiresAnyProof] },

  // En cours, le surveillant ne part pas : il demande une relève et reste responsable.
  { from: ['ON_DUTY'], action: 'REQUEST_RELIEF', to: 'RELIEF_PENDING', actors: ['ASSIGNEE'], guards: [requiresReason] },
  { from: ON_SITE, action: 'RELEASE_BY_MANAGER', to: 'DONE', actors: ['ADMIN'], guards: [requiresReason] },
  { from: ON_SITE, action: 'RELIEVE', to: 'DONE', actors: ['ASSIGNEE', 'SYSTEM'] },
  { from: ['RELIEF_PENDING'], action: 'RELIEF_ABANDONED', to: 'ON_DUTY', actors: ['SYSTEM'] },

  { from: ACTIVE, action: 'EXTEND', to: 'same', actors: ['ADMIN', 'ASSIGNEE'], guards: [requiresMinutes] },
  { from: ['DONE'], action: 'VALIDATE', to: 'CLOSED', actors: ['ADMIN'] },
  // Annulation par l'admin seulement, motif facultatif, y compris en cours (FR-008h).
  { from: ACTIVE, action: 'CANCEL', to: 'CANCELLED', actors: ['ADMIN'] },

  { from: COVERAGE_STATUSES, action: 'SET_TEACHER', to: 'same', actors: ['ADMIN'] },
  { from: ON_SITE, action: 'RELEASE_SUPPORT', to: 'same', actors: ['ADMIN'] },
];

interface Creation {
  action: CoverageCreation;
  to: CoverageStatus;
  actor: CoverageActor;
  guards?: Guard[];
}

const CREATIONS: readonly Creation[] = [
  { action: 'CREATE_TEACHER_REQUEST', to: 'PENDING', actor: 'REQUESTER_TEACHER' },
  { action: 'CREATE_DIRECT', to: 'ACCEPTED', actor: 'ADMIN', guards: ASSIGNMENT_GUARDS },
  // Jamais bloquée, même si le déclarant est déjà occupé (FR-015, FR-015j).
  { action: 'DECLARE_EMPTY_CLASS', to: 'ON_DUTY', actor: 'SUPERVISOR' },
];

function findTransition(status: CoverageStatus, action: CoverageAction): Transition | undefined {
  return TRANSITIONS.find((t) => t.action === action && t.from.includes(status));
}

/**
 * Applique une action. Ordre des contrôles : action connue (UNKNOWN_ACTION) → statut
 * (INVALID_TRANSITION) → acteur (FORBIDDEN) → gardes (codes métier).
 */
export function applyCoverageAction(state: CoverageMachineState, action: CoverageAction, ctx: CoverageContext): CoverageResult {
  if (!isCoverageAction(action)) return { ok: false, code: 'UNKNOWN_ACTION' };
  const transition = findTransition(state.status, action);
  if (!transition) return { ok: false, code: 'INVALID_TRANSITION' };

  const actor = ctx.actors.find((a) => transition.actors.includes(a));
  if (!actor) return { ok: false, code: 'FORBIDDEN' };

  for (const guard of transition.guards ?? []) {
    const code = guard(state, ctx);
    if (code) return { ok: false, code };
  }

  const to = transition.to === 'same' ? state.status : transition.to;
  const steps: CoverageStep[] = [{ from: state.status, to, action, actor }];
  // Fin sans validation finale : clôture immédiate par le système.
  if (to === 'DONE' && state.status !== 'DONE' && !state.rules.finalValidation) {
    steps.push({ from: 'DONE', to: 'CLOSED', action, actor: 'SYSTEM' });
  }

  let assigneeId: string | null | undefined;
  let reliefAssigneeId: string | undefined;
  if (action === 'ASSIGN' || action === 'ATTACH_DECLARATION') assigneeId = ctx.assigneeId;
  if (action === 'REASSIGN') {
    if (ON_SITE.includes(state.status)) reliefAssigneeId = ctx.assigneeId;
    else assigneeId = ctx.assigneeId;
  }
  if (action === 'CANCEL' && state.assigneeId) assigneeId = null;

  const reason = ctx.reason?.trim();
  return {
    ok: true,
    from: state.status,
    to: steps.at(-1)!.to,
    steps,
    ...(assigneeId !== undefined ? { assigneeId } : {}),
    ...(reliefAssigneeId ? { reliefAssigneeId } : {}),
    ...(reason ? { reason } : {}),
  };
}

/** Création d'une affectation : statut de départ, acteur et surveillant affecté. */
export function applyCoverageCreation(action: CoverageCreation, ctx: CoverageContext): CoverageCreationResult {
  const creation = CREATIONS.find((c) => c.action === action);
  if (!creation) return { ok: false, code: 'UNKNOWN_ACTION' };
  if (!ctx.actors.includes(creation.actor)) return { ok: false, code: 'FORBIDDEN' };
  for (const guard of creation.guards ?? []) {
    const code = guard(null, ctx);
    if (code) return { ok: false, code };
  }
  const assigneeId = action === 'CREATE_DIRECT' ? ctx.assigneeId : action === 'DECLARE_EMPTY_CLASS' ? ctx.userId : undefined;
  return { ok: true, to: creation.to, actor: creation.actor, ...(assigneeId ? { assigneeId } : {}) };
}

/** Actions proposées à l'utilisateur selon le statut et ses relations (gardes de saisie non évaluées). */
export function availableCoverageActions(state: CoverageMachineState, actors: readonly CoverageActor[]): CoverageAction[] {
  const human = actors.filter((a) => a !== 'SYSTEM');
  return USER_COVERAGE_ACTIONS.filter((action) => {
    const transition = findTransition(state.status, action);
    return transition !== undefined && human.some((a) => transition.actors.includes(a));
  });
}
