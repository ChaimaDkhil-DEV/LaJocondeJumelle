import type { RequestStatus } from '@prisma/client';
import {
  ALL_ACTIONS,
  ALL_STATUSES,
  applyAction,
  availableActions,
  type ActionContext,
  type Actor,
  type MachineRequest,
  type RequestAction,
  type RulesSnapshot,
} from '../../src/requests/domain/request-state-machine';

/**
 * Machine à états des demandes — data-model.md §Machine à états (T1–T18).
 * Tests table-driven : chaque transition autorisée, chaque combinaison interdite.
 */

const NOW = new Date('2026-10-12T10:00:00.000Z');

const circuitA: RulesSnapshot = {
  circuit: 'A_DIRECT',
  closureMode: 'REQUESTER',
  autoCloseAfterMinutes: 1440,
  finalValidation: false,
  assignmentMode: 'MANUAL',
  photoRequired: false,
};

const circuitB: RulesSnapshot = { ...circuitA, circuit: 'B_ADMIN_VALIDATION', closureMode: 'MANAGER' };

function request(status: RequestStatus, rules: Partial<RulesSnapshot> = {}, extra: Partial<MachineRequest> = {}): MachineRequest {
  return {
    status,
    rules: { ...circuitA, ...rules },
    hasVoice: true,
    hasDescription: false,
    assigneeId: 'employe-1',
    autoCloseAt: null,
    ...extra,
  };
}

function ctx(actors: Actor[], extra: Partial<ActionContext> = {}): ActionContext {
  return { actors, now: NOW, ...extra };
}

const R: Actor[] = ['REQUESTER'];
const E: Actor[] = ['ASSIGNEE'];
const M: Actor[] = ['MANAGER'];
const S: Actor[] = ['SYSTEM'];

interface AllowedCase {
  id: string;
  req: MachineRequest;
  action: RequestAction;
  context: ActionContext;
  to: RequestStatus;
}

const allowed: AllowedCase[] = [
  { id: 'T1', req: request('DRAFT'), action: 'SUBMIT', context: ctx(R, { assigneeId: 'employe-1', assigneeAllowed: true }), to: 'SENT' },
  { id: 'T2', req: request('DRAFT', circuitB, { assigneeId: null }), action: 'SUBMIT', context: ctx(R), to: 'PENDING_ADMIN_VALIDATION' },
  { id: 'T3', req: request('PENDING_ADMIN_VALIDATION', circuitB, { assigneeId: null }), action: 'APPROVE', context: ctx(M, { assigneeId: 'employe-2', assigneeAllowed: true }), to: 'SENT' },
  { id: 'T4', req: request('PENDING_ADMIN_VALIDATION', circuitB, { assigneeId: null }), action: 'REJECT', context: ctx(M, { reason: 'Hors budget' }), to: 'REJECTED' },
  { id: 'T5', req: request('PENDING_ADMIN_VALIDATION', circuitB, { assigneeId: null }), action: 'CANCEL', context: ctx(R), to: 'CANCELLED' },
  { id: 'T6', req: request('SENT'), action: 'ACCEPT', context: ctx(E), to: 'ACCEPTED' },
  { id: 'T7', req: request('SENT'), action: 'DECLINE', context: ctx(E, { reason: 'Pas mon service' }), to: 'REJECTED' },
  { id: 'T8', req: request('SENT'), action: 'CANCEL', context: ctx(R), to: 'CANCELLED' },
  { id: 'T9', req: request('ACCEPTED'), action: 'START', context: ctx(E), to: 'IN_PROGRESS' },
  { id: 'T10', req: request('IN_PROGRESS'), action: 'COMPLETE', context: ctx(E), to: 'DONE' },
  { id: 'T13-R', req: request('DONE', { closureMode: 'REQUESTER' }), action: 'CLOSE', context: ctx(R), to: 'CLOSED' },
  { id: 'T13-M', req: request('DONE', { closureMode: 'MANAGER' }), action: 'CLOSE', context: ctx(M), to: 'CLOSED' },
  {
    id: 'T13-S',
    req: request('DONE', { closureMode: 'AUTO' }, { autoCloseAt: new Date('2026-10-12T09:00:00.000Z') }),
    action: 'CLOSE',
    context: ctx(S),
    to: 'CLOSED',
  },
  { id: 'T14', req: request('PENDING_FINAL_VALIDATION', { ...circuitB, finalValidation: true }), action: 'VALIDATE_FINAL', context: ctx(M), to: 'CLOSED' },
  { id: 'T15', req: request('DONE'), action: 'REQUEST_CORRECTION', context: ctx(R, { reason: 'Recto-verso demandé' }), to: 'TO_CORRECT' },
  { id: 'T16', req: request('PENDING_FINAL_VALIDATION', { ...circuitB, finalValidation: true }), action: 'REQUEST_CORRECTION', context: ctx(M, { reason: 'Incomplet' }), to: 'TO_CORRECT' },
  { id: 'T17', req: request('TO_CORRECT'), action: 'RESUME', context: ctx(E), to: 'IN_PROGRESS' },
  ...(['SENT', 'ACCEPTED', 'IN_PROGRESS', 'TO_CORRECT'] as const).map((from) => ({
    id: `T18-${from}`,
    req: request(from),
    action: 'REASSIGN' as const,
    context: ctx(M, { assigneeId: 'employe-2', assigneeAllowed: true }),
    to: 'SENT' as const,
  })),
];

describe('applyAction — transitions autorisées', () => {
  it.each(allowed.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const result = applyAction(c.req, c.action, c.context);
    expect(result).toMatchObject({ ok: true, from: c.req.status, to: c.to });
  });

  it('T3 affecte l’employé choisi et T18 le nouvel employé', () => {
    const approve = allowed.find((c) => c.id === 'T3')!;
    expect(applyAction(approve.req, approve.action, approve.context)).toMatchObject({ assigneeId: 'employe-2' });
    const reassign = allowed.find((c) => c.id === 'T18-IN_PROGRESS')!;
    expect(applyAction(reassign.req, reassign.action, reassign.context)).toMatchObject({ assigneeId: 'employe-2' });
  });

  it('T1 affecte le destinataire choisi', () => {
    const t1 = allowed.find((c) => c.id === 'T1')!;
    expect(applyAction(t1.req, t1.action, t1.context)).toMatchObject({ assigneeId: 'employe-1' });
  });
});

describe('Transitions automatiques après COMPLETE (T11, T12)', () => {
  it('T11 : catégorie avec validation finale → En attente de validation finale', () => {
    const result = applyAction(request('IN_PROGRESS', { ...circuitB, finalValidation: true }), 'COMPLETE', ctx(E));
    expect(result).toMatchObject({ ok: true, to: 'PENDING_FINAL_VALIDATION' });
    if (!result.ok) throw new Error('attendu ok');
    expect(result.steps.map((s) => [s.from, s.to, s.actor])).toEqual([
      ['IN_PROGRESS', 'DONE', 'ASSIGNEE'],
      ['DONE', 'PENDING_FINAL_VALIDATION', 'SYSTEM'],
    ]);
  });

  it('T12 : clôture automatique → reste Terminée avec autoCloseAt = maintenant + délai de grâce', () => {
    const result = applyAction(request('IN_PROGRESS', { closureMode: 'AUTO', autoCloseAfterMinutes: 1440 }), 'COMPLETE', ctx(E));
    expect(result).toMatchObject({ ok: true, to: 'DONE', autoCloseAt: new Date('2026-10-13T10:00:00.000Z') });
  });

  it('T12 : délai de grâce de 0 → clôture immédiate par le système', () => {
    const result = applyAction(request('IN_PROGRESS', { closureMode: 'AUTO', autoCloseAfterMinutes: 0 }), 'COMPLETE', ctx(E));
    expect(result).toMatchObject({ ok: true, to: 'CLOSED' });
    if (!result.ok) throw new Error('attendu ok');
    expect(result.steps.at(-1)).toMatchObject({ from: 'DONE', to: 'CLOSED', actor: 'SYSTEM' });
  });

  it('sans clôture automatique ni validation finale → reste Terminée, sans autoCloseAt', () => {
    const result = applyAction(request('IN_PROGRESS', { closureMode: 'REQUESTER' }), 'COMPLETE', ctx(E));
    expect(result).toMatchObject({ ok: true, to: 'DONE', autoCloseAt: null });
  });

  it('T15 annule la clôture automatique programmée', () => {
    const req = request('DONE', { closureMode: 'AUTO' }, { autoCloseAt: new Date('2026-10-13T10:00:00.000Z') });
    expect(applyAction(req, 'REQUEST_CORRECTION', ctx(R, { reason: 'À refaire' }))).toMatchObject({
      ok: true,
      to: 'TO_CORRECT',
      autoCloseAt: null,
    });
  });
});

describe('applyAction — gardes', () => {
  it('T1 : destinataire hors catégorie ou inactif → RECIPIENT_NOT_ALLOWED', () => {
    expect(applyAction(request('DRAFT'), 'SUBMIT', ctx(R, { assigneeId: 'x', assigneeAllowed: false }))).toEqual({
      ok: false,
      code: 'RECIPIENT_NOT_ALLOWED',
    });
    expect(applyAction(request('DRAFT'), 'SUBMIT', ctx(R))).toEqual({ ok: false, code: 'RECIPIENT_NOT_ALLOWED' });
  });

  it.each([
    ['circuit A', request('DRAFT', {}, { hasVoice: false, hasDescription: false }), ctx(R, { assigneeId: 'e', assigneeAllowed: true })],
    ['circuit B', request('DRAFT', circuitB, { hasVoice: false, hasDescription: false }), ctx(R)],
  ])('SUBMIT sans vocal ni description (%s) → CONTENT_REQUIRED', (_label, req, context) => {
    expect(applyAction(req, 'SUBMIT', context)).toEqual({ ok: false, code: 'CONTENT_REQUIRED' });
  });

  it('SUBMIT avec une description seule est accepté', () => {
    const req = request('DRAFT', {}, { hasVoice: false, hasDescription: true });
    expect(applyAction(req, 'SUBMIT', ctx(R, { assigneeId: 'e', assigneeAllowed: true }))).toMatchObject({ ok: true });
  });

  it.each([
    ['REJECT', request('PENDING_ADMIN_VALIDATION', circuitB), M],
    ['DECLINE', request('SENT'), E],
    ['REQUEST_CORRECTION', request('DONE'), R],
    ['REQUEST_CORRECTION', request('PENDING_FINAL_VALIDATION', { ...circuitB, finalValidation: true }), M],
  ] as const)('%s sans motif (ou motif vide) → REASON_REQUIRED', (action, req, actors) => {
    expect(applyAction(req, action, ctx([...actors]))).toEqual({ ok: false, code: 'REASON_REQUIRED' });
    expect(applyAction(req, action, ctx([...actors], { reason: '   ' }))).toEqual({ ok: false, code: 'REASON_REQUIRED' });
  });

  it('COMPLETE sans photo de preuve quand la catégorie l’exige → PHOTO_REQUIRED', () => {
    const req = request('IN_PROGRESS', { photoRequired: true });
    expect(applyAction(req, 'COMPLETE', ctx(E))).toEqual({ ok: false, code: 'PHOTO_REQUIRED' });
    expect(applyAction(req, 'COMPLETE', ctx(E, { proofPhotoCount: 0 }))).toEqual({ ok: false, code: 'PHOTO_REQUIRED' });
    expect(applyAction(req, 'COMPLETE', ctx(E, { proofPhotoCount: 1 }))).toMatchObject({ ok: true, to: 'DONE' });
  });

  it('APPROVE en affectation manuelle sans employé → ASSIGNEE_REQUIRED', () => {
    const req = request('PENDING_ADMIN_VALIDATION', circuitB, { assigneeId: null });
    expect(applyAction(req, 'APPROVE', ctx(M))).toEqual({ ok: false, code: 'ASSIGNEE_REQUIRED' });
  });

  it.each(['APPROVE', 'REASSIGN'] as const)('%s vers un employé hors catégorie → RECIPIENT_NOT_ALLOWED', (action) => {
    const req = action === 'APPROVE' ? request('PENDING_ADMIN_VALIDATION', circuitB, { assigneeId: null }) : request('SENT');
    expect(applyAction(req, action, ctx(M, { assigneeId: 'x', assigneeAllowed: false }))).toEqual({
      ok: false,
      code: 'RECIPIENT_NOT_ALLOWED',
    });
  });

  it('APPROVE en affectation automatique utilise l’employé désigné fourni par l’appelant', () => {
    const req = request('PENDING_ADMIN_VALIDATION', { ...circuitB, assignmentMode: 'AUTO' }, { assigneeId: null });
    expect(applyAction(req, 'APPROVE', ctx(M, { assigneeId: 'auto-1', assigneeAllowed: true }))).toMatchObject({
      ok: true,
      assigneeId: 'auto-1',
    });
  });

  it('clôture automatique (T13 système) refusée avant l’échéance du délai de grâce', () => {
    const req = request('DONE', { closureMode: 'AUTO' }, { autoCloseAt: new Date('2026-10-13T10:00:00.000Z') });
    expect(applyAction(req, 'CLOSE', ctx(S))).toEqual({ ok: false, code: 'INVALID_TRANSITION' });
  });
});

describe('applyAction — acteurs non autorisés', () => {
  const forbidden: Array<[string, MachineRequest, RequestAction, Actor[], Partial<ActionContext>]> = [
    ['SUBMIT par l’employé', request('DRAFT'), 'SUBMIT', E, { assigneeId: 'e', assigneeAllowed: true }],
    ['APPROVE par le demandeur', request('PENDING_ADMIN_VALIDATION', circuitB), 'APPROVE', R, { assigneeId: 'e', assigneeAllowed: true }],
    ['APPROVE par un employé', request('PENDING_ADMIN_VALIDATION', circuitB), 'APPROVE', E, { assigneeId: 'e', assigneeAllowed: true }],
    ['REJECT par le demandeur', request('PENDING_ADMIN_VALIDATION', circuitB), 'REJECT', R, { reason: 'x' }],
    ['ACCEPT par le demandeur', request('SENT'), 'ACCEPT', R, {}],
    ['ACCEPT par un responsable', request('SENT'), 'ACCEPT', M, {}],
    ['DECLINE par le demandeur', request('SENT'), 'DECLINE', R, { reason: 'x' }],
    ['CANCEL par l’employé', request('SENT'), 'CANCEL', E, {}],
    ['CANCEL par un responsable', request('SENT'), 'CANCEL', M, {}],
    ['START par le demandeur', request('ACCEPTED'), 'START', R, {}],
    ['COMPLETE par un responsable', request('IN_PROGRESS'), 'COMPLETE', M, {}],
    ['CLOSE (mode demandeur) par un responsable', request('DONE', { closureMode: 'REQUESTER' }), 'CLOSE', M, {}],
    ['CLOSE (mode responsable) par le demandeur', request('DONE', { closureMode: 'MANAGER' }), 'CLOSE', R, {}],
    ['CLOSE (mode automatique) par le demandeur', request('DONE', { closureMode: 'AUTO' }), 'CLOSE', R, {}],
    ['CLOSE par l’employé', request('DONE'), 'CLOSE', E, {}],
    ['VALIDATE_FINAL par le demandeur', request('PENDING_FINAL_VALIDATION', circuitB), 'VALIDATE_FINAL', R, {}],
    ['REQUEST_CORRECTION (Terminée) par l’employé', request('DONE'), 'REQUEST_CORRECTION', E, { reason: 'x' }],
    ['REQUEST_CORRECTION (validation finale) par le demandeur', request('PENDING_FINAL_VALIDATION', circuitB), 'REQUEST_CORRECTION', R, { reason: 'x' }],
    ['RESUME par le demandeur', request('TO_CORRECT'), 'RESUME', R, {}],
    ['REASSIGN par l’employé', request('SENT'), 'REASSIGN', E, { assigneeId: 'e2', assigneeAllowed: true }],
    ['REASSIGN par le demandeur', request('SENT'), 'REASSIGN', R, { assigneeId: 'e2', assigneeAllowed: true }],
    ['ACCEPT sans aucun lien avec la demande', request('SENT'), 'ACCEPT', [], {}],
  ];

  it.each(forbidden)('%s → FORBIDDEN', (_label, req, action, actors, extra) => {
    expect(applyAction(req, action, ctx(actors, extra))).toEqual({ ok: false, code: 'FORBIDDEN' });
  });

  it('un utilisateur cumulant deux rôles peut agir au titre de l’un d’eux', () => {
    expect(applyAction(request('SENT'), 'ACCEPT', ctx(['REQUESTER', 'ASSIGNEE']))).toMatchObject({ ok: true });
  });
});

describe('applyAction — combinaisons (statut, action) interdites', () => {
  const allowedPairs = new Set([
    'DRAFT:SUBMIT',
    'PENDING_ADMIN_VALIDATION:APPROVE',
    'PENDING_ADMIN_VALIDATION:REJECT',
    'PENDING_ADMIN_VALIDATION:CANCEL',
    'SENT:ACCEPT',
    'SENT:DECLINE',
    'SENT:CANCEL',
    'SENT:REASSIGN',
    'ACCEPTED:START',
    'ACCEPTED:REASSIGN',
    'IN_PROGRESS:COMPLETE',
    'IN_PROGRESS:REASSIGN',
    'DONE:CLOSE',
    'DONE:REQUEST_CORRECTION',
    'PENDING_FINAL_VALIDATION:VALIDATE_FINAL',
    'PENDING_FINAL_VALIDATION:REQUEST_CORRECTION',
    'TO_CORRECT:RESUME',
    'TO_CORRECT:REASSIGN',
  ]);

  const everyActor: Actor[] = ['REQUESTER', 'ASSIGNEE', 'MANAGER', 'SYSTEM'];
  const forbiddenPairs = ALL_STATUSES.flatMap((status) =>
    ALL_ACTIONS.filter((action) => !allowedPairs.has(`${status}:${action}`)).map((action) => [status, action] as const),
  );

  it('couvre les 11 statuts et les 13 actions', () => {
    expect(ALL_STATUSES).toHaveLength(11);
    expect(ALL_ACTIONS).toHaveLength(13);
  });

  it.each(forbiddenPairs)('%s + %s → INVALID_TRANSITION', (status, action) => {
    const context = ctx(everyActor, { reason: 'motif', assigneeId: 'e2', assigneeAllowed: true, proofPhotoCount: 1 });
    expect(applyAction(request(status), action, context)).toEqual({ ok: false, code: 'INVALID_TRANSITION' });
  });

  it.each(['CLOSED', 'REJECTED', 'CANCELLED'] as const)('%s est final : aucune action possible', (status) => {
    for (const action of ALL_ACTIONS) {
      expect(applyAction(request(status), action, ctx(everyActor, { reason: 'x' }))).toEqual({
        ok: false,
        code: 'INVALID_TRANSITION',
      });
    }
  });

  it('CANCEL refusé une fois la demande acceptée', () => {
    expect(applyAction(request('ACCEPTED'), 'CANCEL', ctx(R))).toEqual({ ok: false, code: 'INVALID_TRANSITION' });
  });
});

describe('availableActions', () => {
  it('liste les actions possibles pour le statut et les acteurs, sans évaluer les gardes de saisie', () => {
    expect(availableActions(request('SENT'), ['ASSIGNEE']).sort()).toEqual(['ACCEPT', 'DECLINE']);
    expect(availableActions(request('SENT'), ['REQUESTER'])).toEqual(['CANCEL']);
    expect(availableActions(request('SENT'), ['MANAGER'])).toEqual(['REASSIGN']);
    expect(availableActions(request('DONE', { closureMode: 'REQUESTER' }), ['REQUESTER']).sort()).toEqual([
      'CLOSE',
      'REQUEST_CORRECTION',
    ]);
    expect(availableActions(request('CLOSED'), ['REQUESTER', 'ASSIGNEE', 'MANAGER'])).toEqual([]);
  });

  it('ne propose jamais les actions réservées au système', () => {
    const req = request('DONE', { closureMode: 'AUTO' }, { autoCloseAt: new Date('2026-10-12T09:00:00.000Z') });
    expect(availableActions(req, ['REQUESTER', 'MANAGER'])).toEqual(['REQUEST_CORRECTION']);
  });
});
