import {
  applyCoverageAction,
  availableCoverageActions,
  COVERAGE_ACTIONS,
  COVERAGE_STATUSES,
  type CoverageAction,
  type CoverageActor,
  type CoverageContext,
  type CoverageMachineState,
  type CoverageStatus,
} from '../../src/coverage/domain/coverage-state-machine';

function state(status: CoverageStatus, extra: Partial<CoverageMachineState> = {}): CoverageMachineState {
  return {
    status,
    assigneeId: ['BROADCAST', 'UNFILLED'].includes(status) ? null : 'emp-1',
    rules: { proofMode: 'PHOTO', finalValidation: false },
    ...extra,
  };
}

function ctx(actors: CoverageActor[], extra: Partial<CoverageContext> = {}): CoverageContext {
  return { actors, userId: 'emp-2', ...extra };
}

describe('Machine à états des couvertures', () => {
  describe('prise en charge', () => {
    it('ACCEPT : un membre du groupe disponible prend la garde diffusée ou non pourvue', () => {
      for (const status of ['BROADCAST', 'UNFILLED'] as const) {
        const result = applyCoverageAction(state(status), 'ACCEPT', ctx(['CANDIDATE'], { available: true }));
        expect(result).toMatchObject({ ok: true, from: status, to: 'ACCEPTED', assigneeId: 'emp-2' });
      }
    });

    it('ACCEPT refusé si l’employé n’est pas disponible (déjà en garde sur le créneau)', () => {
      expect(applyCoverageAction(state('BROADCAST'), 'ACCEPT', ctx(['CANDIDATE'], { available: false }))).toEqual({
        ok: false,
        code: 'NOT_AVAILABLE',
      });
    });

    it('ACCEPT : un employé ne peut pas forcer sa propre disponibilité', () => {
      expect(applyCoverageAction(state('BROADCAST'), 'ACCEPT', ctx(['CANDIDATE'], { available: false, force: true }))).toEqual({
        ok: false,
        code: 'NOT_AVAILABLE',
      });
    });

    it('ACCEPT refusé à un employé hors groupe (aucun acteur) et sur une garde déjà prise', () => {
      expect(applyCoverageAction(state('BROADCAST'), 'ACCEPT', ctx([], { available: true }))).toEqual({ ok: false, code: 'FORBIDDEN' });
      expect(applyCoverageAction(state('ACCEPTED'), 'ACCEPT', ctx(['CANDIDATE'], { available: true }))).toEqual({
        ok: false,
        code: 'INVALID_TRANSITION',
      });
    });

    it('ASSIGN : affectation manuelle par un responsable, forcée seulement avec confirmation', () => {
      const base = { assigneeId: 'emp-3', assigneeEligible: true };
      expect(applyCoverageAction(state('UNFILLED'), 'ASSIGN', ctx(['MANAGER'], { ...base, available: false }))).toEqual({
        ok: false,
        code: 'NOT_AVAILABLE',
      });
      const forced = applyCoverageAction(state('UNFILLED'), 'ASSIGN', ctx(['MANAGER'], { ...base, available: false, force: true }));
      expect(forced).toMatchObject({ ok: true, to: 'ACCEPTED', assigneeId: 'emp-3', forced: true });
      const normal = applyCoverageAction(state('BROADCAST'), 'ASSIGN', ctx(['MANAGER'], { ...base, available: true }));
      expect(normal).toMatchObject({ ok: true, assigneeId: 'emp-3' });
      expect(normal.ok && normal.forced).toBeFalsy();
    });

    it('ASSIGN refusé aux employés et sans employé valide', () => {
      expect(applyCoverageAction(state('BROADCAST'), 'ASSIGN', ctx(['CANDIDATE'], { assigneeId: 'x', assigneeEligible: true, available: true }))).toEqual({ ok: false, code: 'FORBIDDEN' });
      expect(applyCoverageAction(state('BROADCAST'), 'ASSIGN', ctx(['MANAGER'], { available: true }))).toEqual({ ok: false, code: 'ASSIGNEE_REQUIRED' });
      expect(applyCoverageAction(state('BROADCAST'), 'ASSIGN', ctx(['MANAGER'], { assigneeId: 'x', assigneeEligible: false, available: true }))).toEqual({ ok: false, code: 'RECIPIENT_NOT_ALLOWED' });
    });
  });

  describe('présence', () => {
    it('CONFIRM_PRESENCE : preuve exigée selon la catégorie (photo, QR ou les deux)', () => {
      const photo = state('ACCEPTED', { rules: { proofMode: 'PHOTO', finalValidation: false } });
      const qr = state('EN_ROUTE', { rules: { proofMode: 'QR', finalValidation: false } });
      const both = state('LATE', { rules: { proofMode: 'BOTH', finalValidation: false } });
      const as = (proof: { photo: boolean; qr: boolean }) => ctx(['ASSIGNEE'], { proof });

      expect(applyCoverageAction(photo, 'CONFIRM_PRESENCE', as({ photo: false, qr: true }))).toEqual({ ok: false, code: 'PROOF_REQUIRED' });
      expect(applyCoverageAction(photo, 'CONFIRM_PRESENCE', as({ photo: true, qr: false }))).toMatchObject({ ok: true, to: 'ON_DUTY' });
      expect(applyCoverageAction(qr, 'CONFIRM_PRESENCE', as({ photo: true, qr: false }))).toEqual({ ok: false, code: 'PROOF_REQUIRED' });
      expect(applyCoverageAction(qr, 'CONFIRM_PRESENCE', as({ photo: false, qr: true }))).toMatchObject({ ok: true, to: 'ON_DUTY' });
      expect(applyCoverageAction(both, 'CONFIRM_PRESENCE', as({ photo: true, qr: false }))).toEqual({ ok: false, code: 'PROOF_REQUIRED' });
      expect(applyCoverageAction(both, 'CONFIRM_PRESENCE', as({ photo: true, qr: true }))).toMatchObject({ ok: true, from: 'LATE', to: 'ON_DUTY' });
    });

    it('seul le preneur confirme sa présence', () => {
      expect(applyCoverageAction(state('ACCEPTED'), 'CONFIRM_PRESENCE', ctx(['MANAGER', 'CANDIDATE'], { proof: { photo: true, qr: true } }))).toEqual({
        ok: false,
        code: 'FORBIDDEN',
      });
    });
  });

  describe('désistement et relève', () => {
    it('RELEASE avant la présence : motif obligatoire, la demande repart en diffusion sans preneur', () => {
      for (const status of ['ACCEPTED', 'EN_ROUTE', 'LATE'] as const) {
        expect(applyCoverageAction(state(status), 'RELEASE', ctx(['ASSIGNEE']))).toEqual({ ok: false, code: 'REASON_REQUIRED' });
        expect(applyCoverageAction(state(status), 'RELEASE', ctx(['ASSIGNEE'], { reason: '  ' }))).toEqual({ ok: false, code: 'REASON_REQUIRED' });
        expect(applyCoverageAction(state(status), 'RELEASE', ctx(['ASSIGNEE'], { reason: 'Malade' }))).toMatchObject({
          ok: true,
          to: 'BROADCAST',
          assigneeId: null,
          reason: 'Malade',
        });
      }
    });

    it('RELEASE refusé en garde (ON_DUTY) : il faut demander une relève', () => {
      expect(applyCoverageAction(state('ON_DUTY'), 'RELEASE', ctx(['ASSIGNEE'], { reason: 'Urgence' }))).toEqual({
        ok: false,
        code: 'INVALID_TRANSITION',
      });
      expect(applyCoverageAction(state('ON_DUTY'), 'REQUEST_RELIEF', ctx(['ASSIGNEE']))).toEqual({ ok: false, code: 'REASON_REQUIRED' });
      expect(applyCoverageAction(state('ON_DUTY'), 'REQUEST_RELIEF', ctx(['ASSIGNEE'], { reason: 'Urgence' }))).toMatchObject({
        ok: true,
        to: 'RELIEF_PENDING',
      });
      // L'employé reste responsable : le preneur ne change pas.
      const result = applyCoverageAction(state('ON_DUTY'), 'REQUEST_RELIEF', ctx(['ASSIGNEE'], { reason: 'Urgence' }));
      expect(result.ok && 'assigneeId' in result).toBe(false);
    });

    it('RELEASE_BY_MANAGER : réservé au responsable, motif obligatoire, garde relevée', () => {
      expect(applyCoverageAction(state('RELIEF_PENDING'), 'RELEASE_BY_MANAGER', ctx(['ASSIGNEE'], { reason: 'x' }))).toEqual({ ok: false, code: 'FORBIDDEN' });
      expect(applyCoverageAction(state('RELIEF_PENDING'), 'RELEASE_BY_MANAGER', ctx(['MANAGER']))).toEqual({ ok: false, code: 'REASON_REQUIRED' });
      expect(applyCoverageAction(state('RELIEF_PENDING'), 'RELEASE_BY_MANAGER', ctx(['MANAGER'], { reason: 'Remplacé' }))).toMatchObject({
        ok: true,
        to: 'CLOSED',
      });
    });

    it('RELIEVE par le système (le remplaçant a confirmé sa présence) ; RELIEF_ABANDONED revient en garde', () => {
      expect(applyCoverageAction(state('RELIEF_PENDING'), 'RELIEVE', ctx(['SYSTEM']))).toMatchObject({ ok: true, to: 'CLOSED' });
      expect(applyCoverageAction(state('RELIEF_PENDING'), 'RELIEF_ABANDONED', ctx(['SYSTEM']))).toMatchObject({ ok: true, to: 'ON_DUTY' });
      expect(applyCoverageAction(state('RELIEF_PENDING'), 'RELIEF_ABANDONED', ctx(['MANAGER']))).toEqual({ ok: false, code: 'FORBIDDEN' });
    });

    it('RELIEVE : clôture immédiate sans validation finale, sinon attente de validation', () => {
      const plain = applyCoverageAction(state('ON_DUTY'), 'RELIEVE', ctx(['ASSIGNEE']));
      expect(plain).toMatchObject({ ok: true, to: 'CLOSED' });
      expect(plain.ok && plain.steps.map((s) => s.to)).toEqual(['DONE', 'CLOSED']);

      const validated = state('ON_DUTY', { rules: { proofMode: 'PHOTO', finalValidation: true } });
      expect(applyCoverageAction(validated, 'RELIEVE', ctx(['ASSIGNEE']))).toMatchObject({ ok: true, to: 'DONE' });
      expect(applyCoverageAction({ ...validated, status: 'DONE' }, 'VALIDATE', ctx(['ASSIGNEE']))).toEqual({ ok: false, code: 'FORBIDDEN' });
      expect(applyCoverageAction({ ...validated, status: 'DONE' }, 'VALIDATE', ctx(['MANAGER']))).toMatchObject({ ok: true, to: 'CLOSED' });
    });
  });

  describe('délais, annulation, prolongation', () => {
    it('EXPIRE (système) : diffusée → non pourvue, acceptée / en route → en retard', () => {
      expect(applyCoverageAction(state('BROADCAST'), 'EXPIRE', ctx(['SYSTEM']))).toMatchObject({ ok: true, to: 'UNFILLED' });
      expect(applyCoverageAction(state('ACCEPTED'), 'EXPIRE', ctx(['SYSTEM']))).toMatchObject({ ok: true, to: 'LATE' });
      expect(applyCoverageAction(state('EN_ROUTE'), 'EXPIRE', ctx(['SYSTEM']))).toMatchObject({ ok: true, to: 'LATE' });
      expect(applyCoverageAction(state('ON_DUTY'), 'EXPIRE', ctx(['SYSTEM']))).toEqual({ ok: false, code: 'INVALID_TRANSITION' });
      expect(applyCoverageAction(state('BROADCAST'), 'EXPIRE', ctx(['MANAGER']))).toEqual({ ok: false, code: 'FORBIDDEN' });
    });

    it('CANCEL : responsable, motif obligatoire, libère le preneur ; impossible une fois en garde', () => {
      expect(applyCoverageAction(state('ACCEPTED'), 'CANCEL', ctx(['MANAGER']))).toEqual({ ok: false, code: 'REASON_REQUIRED' });
      expect(applyCoverageAction(state('ACCEPTED'), 'CANCEL', ctx(['ASSIGNEE'], { reason: 'x' }))).toEqual({ ok: false, code: 'FORBIDDEN' });
      expect(applyCoverageAction(state('ACCEPTED'), 'CANCEL', ctx(['MANAGER'], { reason: 'Enseignante arrivée' }))).toMatchObject({
        ok: true,
        to: 'CANCELLED',
        assigneeId: null,
      });
      expect(applyCoverageAction(state('ON_DUTY'), 'CANCEL', ctx(['MANAGER'], { reason: 'x' }))).toEqual({ ok: false, code: 'INVALID_TRANSITION' });
    });

    it('EXTEND : statut inchangé, durée bornée', () => {
      expect(applyCoverageAction(state('ON_DUTY'), 'EXTEND', ctx(['ASSIGNEE'], { minutes: 30 }))).toMatchObject({
        ok: true,
        from: 'ON_DUTY',
        to: 'ON_DUTY',
      });
      expect(applyCoverageAction(state('ON_DUTY'), 'EXTEND', ctx(['MANAGER'], { minutes: 0 }))).toEqual({ ok: false, code: 'INVALID_DURATION' });
      expect(applyCoverageAction(state('ON_DUTY'), 'EXTEND', ctx(['MANAGER'], { minutes: 10_000 }))).toEqual({ ok: false, code: 'INVALID_DURATION' });
      expect(applyCoverageAction(state('CLOSED'), 'EXTEND', ctx(['MANAGER'], { minutes: 10 }))).toEqual({ ok: false, code: 'INVALID_TRANSITION' });
    });
  });

  it('aucune transition depuis un statut final', () => {
    for (const status of ['CLOSED', 'CANCELLED'] as const) {
      for (const action of COVERAGE_ACTIONS) {
        const result = applyCoverageAction(state(status), action as CoverageAction, ctx(['MANAGER', 'ASSIGNEE', 'SYSTEM'], {
          reason: 'x',
          available: true,
          minutes: 10,
          assigneeId: 'emp-9',
          assigneeEligible: true,
          proof: { photo: true, qr: true },
          groupAdded: true,
        }));
        expect(result).toEqual({ ok: false, code: 'INVALID_TRANSITION' });
      }
    }
  });

  it('les actions proposées n’incluent jamais les actions système', () => {
    for (const status of COVERAGE_STATUSES) {
      const actions = availableCoverageActions(state(status), ['MANAGER', 'ASSIGNEE', 'CANDIDATE', 'SYSTEM']);
      expect(actions).not.toContain('EXPIRE');
      expect(actions).not.toContain('RELIEF_ABANDONED');
    }
    expect(availableCoverageActions(state('BROADCAST'), ['CANDIDATE'])).toEqual(['ACCEPT']);
    expect(availableCoverageActions(state('ON_DUTY'), ['ASSIGNEE'])).toEqual(['CONFIRM_PRESENCE', 'REQUEST_RELIEF', 'RELIEVE', 'EXTEND']);
  });
});
