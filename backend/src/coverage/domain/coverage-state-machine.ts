import type { ProofMode, RequestStatus } from '@prisma/client';

/**
 * Machine à états des couvertures de classe (garde / remplacement).
 * Module pur, même principe que requests/domain/request-state-machine.ts : le service applique
 * le résultat en base (mise à jour conditionnelle, historique, notifications).
 *
 * Diffusée → Acceptée → En route (facultatif) → En garde → Relevée → Clôturée.
 * Exceptionnels : Non pourvue, En retard, Relève demandée, Annulée.
 * « Libérée » (désistement) et « Prolongée » sont des événements journalisés, pas des statuts.
 */

export const COVERAGE_STATUSES = [
  'BROADCAST',
  'UNFILLED',
  'ACCEPTED',
  'EN_ROUTE',
  'LATE',
  'ON_DUTY',
  'RELIEF_PENDING',
  'DONE',
  'CLOSED',
  'CANCELLED',
] as const satisfies readonly RequestStatus[];

export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

/** En attente d'un preneur (visible dans « À prendre »). */
export const OPEN_STATUSES: readonly CoverageStatus[] = ['BROADCAST', 'UNFILLED'];
/** Garde prise et non terminée : rend l'employé indisponible sur le créneau. */
export const ACTIVE_GUARD_STATUSES: readonly CoverageStatus[] = ['ACCEPTED', 'EN_ROUTE', 'LATE', 'ON_DUTY', 'RELIEF_PENDING'];
/** Prise mais présence pas encore confirmée : désistement et réaffectation possibles. */
const BEFORE_PRESENCE: readonly CoverageStatus[] = ['ACCEPTED', 'EN_ROUTE', 'LATE'];
const ON_SITE: readonly CoverageStatus[] = ['ON_DUTY', 'RELIEF_PENDING'];
export const FINAL_COVERAGE_STATUSES: readonly CoverageStatus[] = ['CLOSED', 'CANCELLED'];

export function isCoverageStatus(status: RequestStatus): status is CoverageStatus {
  return (COVERAGE_STATUSES as readonly RequestStatus[]).includes(status);
}

export const COVERAGE_ACTIONS = [
  'ACCEPT',
  'ASSIGN',
  'REASSIGN',
  'WIDEN',
  'DEPART',
  'CONFIRM_PRESENCE',
  'RELEASE',
  'REQUEST_RELIEF',
  'RELEASE_BY_MANAGER',
  'RELIEVE',
  'EXTEND',
  'VALIDATE',
  'CANCEL',
  // Réservées au système (tâche de délais, relève par un remplaçant).
  'EXPIRE',
  'RELIEF_ABANDONED',
] as const;

export type CoverageAction = (typeof COVERAGE_ACTIONS)[number];

/** Actions qu'un utilisateur peut demander par l'API (les actions système sont refusées). */
export const USER_COVERAGE_ACTIONS: readonly CoverageAction[] = COVERAGE_ACTIONS.filter(
  (a) => a !== 'EXPIRE' && a !== 'RELIEF_ABANDONED',
);

/**
 * MANAGER : responsable de la catégorie, auteur de la demande ou super administrateur.
 * CANDIDATE : membre d'un groupe ciblé, qui n'est pas le preneur actuel.
 */
export type CoverageActor = 'MANAGER' | 'ASSIGNEE' | 'CANDIDATE' | 'SYSTEM';

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
  /** Utilisateur qui agit (preneur pour ACCEPT). */
  userId?: string;
  reason?: string;
  /** ACCEPT / ASSIGN / REASSIGN : l'employé visé est disponible sur le créneau. */
  available?: boolean;
  /** ASSIGN / REASSIGN : affectation forcée malgré l'indisponibilité (confirmée par le responsable). */
  force?: boolean;
  /** ASSIGN / REASSIGN : employé visé, s'il est un compte actif pouvant prendre une garde. */
  assigneeId?: string;
  assigneeEligible?: boolean;
  /** CONFIRM_PRESENCE : preuves valides fournies (photo prise, QR de la bonne classe). */
  proof?: { photo: boolean; qr: boolean };
  /** EXTEND : minutes ajoutées. */
  minutes?: number;
  /** WIDEN : un nouveau groupe valide est ajouté. */
  groupAdded?: boolean;
}

export type CoverageErrorCode =
  | 'INVALID_TRANSITION'
  | 'FORBIDDEN'
  | 'REASON_REQUIRED'
  | 'NOT_AVAILABLE'
  | 'ASSIGNEE_REQUIRED'
  | 'RECIPIENT_NOT_ALLOWED'
  | 'PROOF_REQUIRED'
  | 'INVALID_DURATION'
  | 'VALIDATION_ERROR';

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
      /** Preneur après l'action : string = nouveau, null = retiré, absent = inchangé. */
      assigneeId?: string | null;
      /** Affectation forcée (employé déjà en garde ou indisponible). */
      forced?: boolean;
      reason?: string;
    }
  | { ok: false; code: CoverageErrorCode };

type Guard = (state: CoverageMachineState, ctx: CoverageContext, actor: CoverageActor) => CoverageErrorCode | null;

interface Transition {
  from: readonly CoverageStatus[];
  action: CoverageAction;
  /** Statut d'arrivée ; 'same' = le statut ne change pas (événement journalisé seulement). */
  to: CoverageStatus | 'same';
  actors: readonly CoverageActor[];
  guards?: Guard[];
}

const requiresReason: Guard = (_s, ctx) => (ctx.reason?.trim() ? null : 'REASON_REQUIRED');

/** Le preneur doit être disponible ; seul un responsable peut forcer (et jamais pour lui-même via ACCEPT). */
const requiresAvailability: Guard = (_s, ctx, actor) =>
  ctx.available || (actor === 'MANAGER' && ctx.force) ? null : 'NOT_AVAILABLE';

const requiresEligibleAssignee: Guard = (state, ctx) => {
  if (!ctx.assigneeId) return 'ASSIGNEE_REQUIRED';
  if (!ctx.assigneeEligible) return 'RECIPIENT_NOT_ALLOWED';
  // Réaffecter à la même personne n'a pas de sens.
  return ctx.assigneeId === state.assigneeId ? 'RECIPIENT_NOT_ALLOWED' : null;
};

const requiresProof: Guard = (state, ctx) => {
  const proof = ctx.proof ?? { photo: false, qr: false };
  switch (state.rules.proofMode) {
    case 'PHOTO':
      return proof.photo ? null : 'PROOF_REQUIRED';
    case 'QR':
      return proof.qr ? null : 'PROOF_REQUIRED';
    case 'BOTH':
      return proof.photo && proof.qr ? null : 'PROOF_REQUIRED';
  }
};

/** Preuve supplémentaire pendant la garde : au moins une preuve valide. */
const requiresAnyProof: Guard = (_s, ctx) => (ctx.proof?.photo || ctx.proof?.qr ? null : 'PROOF_REQUIRED');

const requiresMinutes: Guard = (_s, ctx) =>
  Number.isInteger(ctx.minutes) && ctx.minutes! >= EXTEND_MIN_MINUTES && ctx.minutes! <= EXTEND_MAX_MINUTES
    ? null
    : 'INVALID_DURATION';

const requiresGroup: Guard = (_s, ctx) => (ctx.groupAdded ? null : 'VALIDATION_ERROR');

const OPEN = OPEN_STATUSES;

const TRANSITIONS: readonly Transition[] = [
  // Prise en charge : premier arrivé, premier servi (la mise à jour conditionnelle garantit l'unicité).
  { from: OPEN, action: 'ACCEPT', to: 'ACCEPTED', actors: ['CANDIDATE'], guards: [requiresAvailability] },
  { from: OPEN, action: 'ASSIGN', to: 'ACCEPTED', actors: ['MANAGER'], guards: [requiresEligibleAssignee, requiresAvailability] },
  {
    from: BEFORE_PRESENCE,
    action: 'REASSIGN',
    to: 'ACCEPTED',
    actors: ['MANAGER'],
    guards: [requiresEligibleAssignee, requiresAvailability],
  },
  { from: OPEN, action: 'WIDEN', to: 'same', actors: ['MANAGER'], guards: [requiresGroup] },

  { from: ['ACCEPTED'], action: 'DEPART', to: 'EN_ROUTE', actors: ['ASSIGNEE'] },
  { from: BEFORE_PRESENCE, action: 'CONFIRM_PRESENCE', to: 'ON_DUTY', actors: ['ASSIGNEE'], guards: [requiresProof] },
  { from: ON_SITE, action: 'CONFIRM_PRESENCE', to: 'same', actors: ['ASSIGNEE'], guards: [requiresAnyProof] },

  // Désistement avant la présence uniquement : la demande repart immédiatement en diffusion.
  { from: BEFORE_PRESENCE, action: 'RELEASE', to: 'BROADCAST', actors: ['ASSIGNEE'], guards: [requiresReason] },
  // En garde, l'employé ne peut pas partir : il demande une relève et reste responsable.
  { from: ['ON_DUTY'], action: 'REQUEST_RELIEF', to: 'RELIEF_PENDING', actors: ['ASSIGNEE'], guards: [requiresReason] },
  { from: ON_SITE, action: 'RELEASE_BY_MANAGER', to: 'DONE', actors: ['MANAGER'], guards: [requiresReason] },
  { from: ON_SITE, action: 'RELIEVE', to: 'DONE', actors: ['ASSIGNEE', 'MANAGER', 'SYSTEM'] },
  { from: ['RELIEF_PENDING'], action: 'RELIEF_ABANDONED', to: 'ON_DUTY', actors: ['SYSTEM'] },

  {
    from: [...OPEN, ...BEFORE_PRESENCE, ...ON_SITE],
    action: 'EXTEND',
    to: 'same',
    actors: ['MANAGER', 'ASSIGNEE'],
    guards: [requiresMinutes],
  },
  { from: ['DONE'], action: 'VALIDATE', to: 'CLOSED', actors: ['MANAGER'] },
  {
    from: [...OPEN, ...BEFORE_PRESENCE],
    action: 'CANCEL',
    to: 'CANCELLED',
    actors: ['MANAGER', 'SYSTEM'],
    guards: [requiresReason],
  },

  // Dépassements de délai (tâche planifiée).
  { from: ['BROADCAST'], action: 'EXPIRE', to: 'UNFILLED', actors: ['SYSTEM'] },
  { from: ['ACCEPTED', 'EN_ROUTE'], action: 'EXPIRE', to: 'LATE', actors: ['SYSTEM'] },
];

function findTransition(status: CoverageStatus, action: CoverageAction): Transition | undefined {
  return TRANSITIONS.find((t) => t.action === action && t.from.includes(status));
}

/**
 * Applique une action. Ordre des contrôles : statut/action (INVALID_TRANSITION) → acteur (FORBIDDEN)
 * → gardes (codes métier).
 */
export function applyCoverageAction(
  state: CoverageMachineState,
  action: CoverageAction,
  ctx: CoverageContext,
): CoverageResult {
  const transition = findTransition(state.status, action);
  if (!transition) return { ok: false, code: 'INVALID_TRANSITION' };

  const actor = ctx.actors.find((a) => transition.actors.includes(a));
  if (!actor) return { ok: false, code: 'FORBIDDEN' };

  for (const guard of transition.guards ?? []) {
    const code = guard(state, ctx, actor);
    if (code) return { ok: false, code };
  }

  const to = transition.to === 'same' ? state.status : transition.to;
  const steps: CoverageStep[] = [{ from: state.status, to, action, actor }];
  // Relève sans validation finale : clôture immédiate par le système.
  if (to === 'DONE' && !state.rules.finalValidation) {
    steps.push({ from: 'DONE', to: 'CLOSED', action, actor: 'SYSTEM' });
  }

  let assigneeId: string | null | undefined;
  if (action === 'ACCEPT') assigneeId = ctx.userId;
  if (action === 'ASSIGN' || action === 'REASSIGN') assigneeId = ctx.assigneeId;
  if (action === 'RELEASE' || (action === 'CANCEL' && state.assigneeId)) assigneeId = null;

  const forced = (action === 'ASSIGN' || action === 'REASSIGN') && !ctx.available;
  const reason = ctx.reason?.trim();
  return {
    ok: true,
    from: state.status,
    to: steps.at(-1)!.to,
    steps,
    ...(assigneeId !== undefined ? { assigneeId } : {}),
    ...(forced ? { forced: true } : {}),
    ...(reason ? { reason } : {}),
  };
}

/** Actions proposées à l'utilisateur selon le statut et ses relations (gardes de saisie non évaluées). */
export function availableCoverageActions(
  state: CoverageMachineState,
  actors: readonly CoverageActor[],
): CoverageAction[] {
  const human = actors.filter((a) => a !== 'SYSTEM');
  return USER_COVERAGE_ACTIONS.filter((action) => {
    const transition = findTransition(state.status, action);
    return transition !== undefined && human.some((a) => transition.actors.includes(a));
  });
}
