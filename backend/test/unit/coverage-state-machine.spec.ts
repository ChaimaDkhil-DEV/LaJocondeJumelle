import {
  applyCoverageAction,
  applyCoverageCreation,
  availableCoverageActions,
  COVERAGE_ACTIONS,
  COVERAGE_STATUSES,
  FINAL_COVERAGE_STATUSES,
  type CoverageActor,
  type CoverageContext,
  type CoverageMachineState,
  type CoverageStatus,
} from '../../src/coverage/domain/coverage-state-machine';

/** Machine à états des affectations : table de data-model §4 (004). */

function state(
  status: CoverageStatus,
  extra: Partial<CoverageMachineState> = {},
): CoverageMachineState {
  return {
    status,
    assigneeId: ['PENDING', 'UNFILLED', 'CANCELLED'].includes(status) ? null : 'sv-1',
    rules: { proofMode: 'PHOTO', finalValidation: false },
    ...extra,
  };
}

function ctx(actors: CoverageActor[], extra: Partial<CoverageContext> = {}): CoverageContext {
  return { actors, ...extra };
}

const assignTo = (id: string, extra: Partial<CoverageContext> = {}) =>
  ctx(['ADMIN'], { assigneeId: id, assigneeEligible: true, available: true, ...extra });

/** Contexte « tout est fourni » : seul le statut ou l'acteur peut faire échouer l'action. */
const everything = (actors: CoverageActor[]) =>
  ctx(actors, {
    userId: 'sv-9',
    reason: 'x',
    available: true,
    minutes: 10,
    assigneeId: 'sv-9',
    assigneeEligible: true,
    proof: { photo: true, qr: true },
  });

const BEFORE_PRESENCE = ['ACCEPTED', 'EN_ROUTE', 'LATE'] as const;
const ON_SITE = ['ON_DUTY', 'RELIEF_PENDING'] as const;

describe('Machine à états des affectations', () => {
  it('statuts gérés : « en attente » ajouté, diffusion retirée', () => {
    expect(COVERAGE_STATUSES).toContain('PENDING');
    expect(COVERAGE_STATUSES).not.toContain('BROADCAST');
  });

  describe('création', () => {
    it('demande d’un enseignant : « en attente »', () => {
      expect(applyCoverageCreation('CREATE_TEACHER_REQUEST', ctx(['REQUESTER_TEACHER']))).toEqual({
        ok: true,
        to: 'PENDING',
        actor: 'REQUESTER_TEACHER',
      });
    });

    it('affectation directe : « assignée », surveillant disponible obligatoire, jamais forcée', () => {
      expect(applyCoverageCreation('CREATE_DIRECT', assignTo('sv-2'))).toEqual({
        ok: true,
        to: 'ACCEPTED',
        actor: 'ADMIN',
        assigneeId: 'sv-2',
      });
      expect(
        applyCoverageCreation('CREATE_DIRECT', assignTo('sv-2', { available: false })),
      ).toEqual({ ok: false, code: 'NOT_AVAILABLE' });
      expect(applyCoverageCreation('CREATE_DIRECT', ctx(['ADMIN'], { available: true }))).toEqual({
        ok: false,
        code: 'ASSIGNEE_REQUIRED',
      });
      expect(
        applyCoverageCreation('CREATE_DIRECT', assignTo('x', { assigneeEligible: false })),
      ).toEqual({
        ok: false,
        code: 'RECIPIENT_NOT_ALLOWED',
      });
    });

    it('classe vide déclarée par un surveillant : « en cours » à son nom, même s’il est occupé (FR-015j)', () => {
      expect(
        applyCoverageCreation(
          'DECLARE_EMPTY_CLASS',
          ctx(['SUPERVISOR'], { userId: 'sv-3', available: false }),
        ),
      ).toEqual({
        ok: true,
        to: 'ON_DUTY',
        actor: 'SUPERVISOR',
        assigneeId: 'sv-3',
      });
    });

    it.each([
      ['CREATE_TEACHER_REQUEST', ['ADMIN', 'SUPERVISOR', 'ASSIGNEE']],
      ['CREATE_DIRECT', ['REQUESTER_TEACHER', 'SUPERVISOR', 'ASSIGNEE']],
      ['DECLARE_EMPTY_CLASS', ['ADMIN', 'REQUESTER_TEACHER', 'ASSIGNEE']],
    ] as const)('%s refusé aux autres acteurs', (action, actors) => {
      expect(applyCoverageCreation(action, everything([...actors]))).toEqual({
        ok: false,
        code: 'FORBIDDEN',
      });
    });
  });

  describe('actions retirées (diffusion supprimée, FR-011a)', () => {
    it.each(['ACCEPT', 'WIDEN', 'RELEASE', 'NIMPORTE_QUOI'])('%s → UNKNOWN_ACTION', (action) => {
      expect(COVERAGE_ACTIONS).not.toContain(action);
      for (const status of COVERAGE_STATUSES) {
        expect(
          applyCoverageAction(
            state(status),
            action as never,
            everything(['ADMIN', 'ASSIGNEE', 'SUPERVISOR', 'SYSTEM']),
          ),
        ).toEqual({
          ok: false,
          code: 'UNKNOWN_ACTION',
        });
      }
    });

    it('le paramètre force n’existe plus : un surveillant indisponible n’est jamais assigné', () => {
      expect(
        applyCoverageAction(
          state('PENDING'),
          'ASSIGN',
          assignTo('sv-2', { available: false, force: true } as never),
        ),
      ).toEqual({
        ok: false,
        code: 'NOT_AVAILABLE',
      });
    });
  });

  describe('« en attente »', () => {
    it('ASSIGN par l’admin → assignée', () => {
      expect(applyCoverageAction(state('PENDING'), 'ASSIGN', assignTo('sv-2'))).toMatchObject({
        ok: true,
        from: 'PENDING',
        to: 'ACCEPTED',
        assigneeId: 'sv-2',
      });
      expect(
        applyCoverageAction(state('PENDING'), 'ASSIGN', ctx(['ADMIN'], { available: true })),
      ).toEqual({ ok: false, code: 'ASSIGNEE_REQUIRED' });
    });

    it('UPDATE et WITHDRAW par l’enseignant auteur, seulement « en attente » (FR-008g)', () => {
      expect(
        applyCoverageAction(state('PENDING'), 'UPDATE', ctx(['REQUESTER_TEACHER'])),
      ).toMatchObject({ ok: true, to: 'PENDING' });
      expect(
        applyCoverageAction(state('PENDING'), 'WITHDRAW', ctx(['REQUESTER_TEACHER'])),
      ).toMatchObject({ ok: true, to: 'CANCELLED' });
      expect(
        applyCoverageAction(
          state('PENDING'),
          'WITHDRAW',
          ctx(['REQUESTER_TEACHER'], { reason: 'Réunion annulée' }),
        ),
      ).toMatchObject({
        reason: 'Réunion annulée',
      });
      for (const status of COVERAGE_STATUSES.filter((s) => s !== 'PENDING')) {
        for (const action of ['UPDATE', 'WITHDRAW'] as const) {
          expect(applyCoverageAction(state(status), action, ctx(['REQUESTER_TEACHER']))).toEqual({
            ok: false,
            code: 'INVALID_TRANSITION',
          });
        }
      }
      expect(applyCoverageAction(state('PENDING'), 'UPDATE', ctx(['ADMIN']))).toEqual({
        ok: false,
        code: 'FORBIDDEN',
      });
      expect(applyCoverageAction(state('PENDING'), 'WITHDRAW', ctx(['ADMIN']))).toEqual({
        ok: false,
        code: 'FORBIDDEN',
      });
    });

    it('ATTACH_DECLARATION (système) : la demande passe « en cours » avec le déclarant (FR-015d)', () => {
      expect(
        applyCoverageAction(
          state('PENDING'),
          'ATTACH_DECLARATION',
          ctx(['SYSTEM'], { assigneeId: 'sv-4' }),
        ),
      ).toMatchObject({
        ok: true,
        to: 'ON_DUTY',
        assigneeId: 'sv-4',
      });
      expect(applyCoverageAction(state('PENDING'), 'ATTACH_DECLARATION', ctx(['SYSTEM']))).toEqual({
        ok: false,
        code: 'ASSIGNEE_REQUIRED',
      });
      expect(
        applyCoverageAction(
          state('PENDING'),
          'ATTACH_DECLARATION',
          ctx(['ADMIN'], { assigneeId: 'sv-4' }),
        ),
      ).toEqual({
        ok: false,
        code: 'FORBIDDEN',
      });
    });

    it('EXPIRE_UNFILLED (système) seulement depuis « en attente » (FR-008a)', () => {
      expect(
        applyCoverageAction(state('PENDING'), 'EXPIRE_UNFILLED', ctx(['SYSTEM'])),
      ).toMatchObject({ ok: true, to: 'UNFILLED' });
      for (const status of COVERAGE_STATUSES.filter((s) => s !== 'PENDING')) {
        expect(applyCoverageAction(state(status), 'EXPIRE_UNFILLED', ctx(['SYSTEM']))).toEqual({
          ok: false,
          code: 'INVALID_TRANSITION',
        });
      }
      expect(applyCoverageAction(state('PENDING'), 'EXPIRE_UNFILLED', ctx(['ADMIN']))).toEqual({
        ok: false,
        code: 'FORBIDDEN',
      });
    });

    it('EXPIRE ne mène plus à « non pourvue »', () => {
      expect(applyCoverageAction(state('PENDING'), 'EXPIRE', ctx(['SYSTEM']))).toEqual({
        ok: false,
        code: 'INVALID_TRANSITION',
      });
    });
  });

  describe('annulation par l’admin (FR-008b, FR-008e, FR-008h)', () => {
    it.each(['PENDING', ...BEFORE_PRESENCE, ...ON_SITE] as const)(
      'CANCEL depuis %s, motif facultatif',
      (status) => {
        const result = applyCoverageAction(state(status), 'CANCEL', ctx(['ADMIN']));
        expect(result).toMatchObject({ ok: true, from: status, to: 'CANCELLED' });
        if (status !== 'PENDING') expect(result).toMatchObject({ assigneeId: null });
      },
    );

    it('le surveillant n’annule pas, même en cours', () => {
      for (const status of [...BEFORE_PRESENCE, ...ON_SITE]) {
        expect(
          applyCoverageAction(
            state(status),
            'CANCEL',
            ctx(['ASSIGNEE', 'SUPERVISOR'], { reason: 'x' }),
          ),
        ).toEqual({
          ok: false,
          code: 'FORBIDDEN',
        });
      }
    });
  });

  describe('réassignation (FR-008e, FR-008j)', () => {
    it.each(BEFORE_PRESENCE)(
      'REASSIGN depuis %s : retour à « assignée » avec le nouveau surveillant',
      (status) => {
        expect(applyCoverageAction(state(status), 'REASSIGN', assignTo('sv-2'))).toMatchObject({
          ok: true,
          to: 'ACCEPTED',
          assigneeId: 'sv-2',
        });
      },
    );

    it.each(ON_SITE)(
      'REASSIGN depuis %s : statut inchangé, relève assignée au nouveau surveillant',
      (status) => {
        const result = applyCoverageAction(state(status), 'REASSIGN', assignTo('sv-2'));
        expect(result).toMatchObject({
          ok: true,
          from: status,
          to: status,
          reliefAssigneeId: 'sv-2',
        });
        // L'ancien surveillant reste responsable jusqu'à la présence du nouveau.
        expect(result.ok && 'assigneeId' in result).toBe(false);
      },
    );

    it('réassigner à la même personne ou à un indisponible est refusé', () => {
      expect(applyCoverageAction(state('ACCEPTED'), 'REASSIGN', assignTo('sv-1'))).toEqual({
        ok: false,
        code: 'RECIPIENT_NOT_ALLOWED',
      });
      expect(
        applyCoverageAction(state('ON_DUTY'), 'REASSIGN', assignTo('sv-2', { available: false })),
      ).toEqual({
        ok: false,
        code: 'NOT_AVAILABLE',
      });
    });
  });

  describe('avancement par le surveillant affecté', () => {
    it('DEPART : assignée → en route ; EXPIRE (arrivée) : → en retard', () => {
      expect(applyCoverageAction(state('ACCEPTED'), 'DEPART', ctx(['ASSIGNEE']))).toMatchObject({
        ok: true,
        to: 'EN_ROUTE',
      });
      expect(applyCoverageAction(state('ACCEPTED'), 'EXPIRE', ctx(['SYSTEM']))).toMatchObject({
        ok: true,
        to: 'LATE',
      });
      expect(applyCoverageAction(state('EN_ROUTE'), 'EXPIRE', ctx(['SYSTEM']))).toMatchObject({
        ok: true,
        to: 'LATE',
      });
      expect(applyCoverageAction(state('ON_DUTY'), 'EXPIRE', ctx(['SYSTEM']))).toEqual({
        ok: false,
        code: 'INVALID_TRANSITION',
      });
    });

    it('CONFIRM_PRESENCE : preuve exigée selon la catégorie (photo, QR ou les deux)', () => {
      const photo = state('ACCEPTED', { rules: { proofMode: 'PHOTO', finalValidation: false } });
      const qr = state('EN_ROUTE', { rules: { proofMode: 'QR', finalValidation: false } });
      const both = state('LATE', { rules: { proofMode: 'BOTH', finalValidation: false } });
      const as = (proof: { photo: boolean; qr: boolean }) => ctx(['ASSIGNEE'], { proof });

      expect(
        applyCoverageAction(photo, 'CONFIRM_PRESENCE', as({ photo: false, qr: true })),
      ).toEqual({ ok: false, code: 'PROOF_REQUIRED' });
      expect(
        applyCoverageAction(photo, 'CONFIRM_PRESENCE', as({ photo: true, qr: false })),
      ).toMatchObject({ ok: true, to: 'ON_DUTY' });
      expect(
        applyCoverageAction(qr, 'CONFIRM_PRESENCE', as({ photo: false, qr: true })),
      ).toMatchObject({ ok: true, to: 'ON_DUTY' });
      expect(applyCoverageAction(both, 'CONFIRM_PRESENCE', as({ photo: true, qr: false }))).toEqual(
        { ok: false, code: 'PROOF_REQUIRED' },
      );
      expect(
        applyCoverageAction(both, 'CONFIRM_PRESENCE', as({ photo: true, qr: true })),
      ).toMatchObject({ ok: true, from: 'LATE', to: 'ON_DUTY' });
      expect(
        applyCoverageAction(
          state('ACCEPTED'),
          'CONFIRM_PRESENCE',
          ctx(['ADMIN'], { proof: { photo: true, qr: true } }),
        ),
      ).toEqual({
        ok: false,
        code: 'FORBIDDEN',
      });
    });

    it('REQUEST_RELIEF : motif obligatoire, le surveillant reste responsable', () => {
      expect(applyCoverageAction(state('ON_DUTY'), 'REQUEST_RELIEF', ctx(['ASSIGNEE']))).toEqual({
        ok: false,
        code: 'REASON_REQUIRED',
      });
      const result = applyCoverageAction(
        state('ON_DUTY'),
        'REQUEST_RELIEF',
        ctx(['ASSIGNEE'], { reason: 'Urgence' }),
      );
      expect(result).toMatchObject({ ok: true, to: 'RELIEF_PENDING' });
      expect(result.ok && 'assigneeId' in result).toBe(false);
    });

    it('RELIEVE (« Terminer ») par le surveillant ou le système ; clôture immédiate sans validation finale', () => {
      const plain = applyCoverageAction(state('ON_DUTY'), 'RELIEVE', ctx(['ASSIGNEE']));
      expect(plain.ok && plain.steps.map((s) => s.to)).toEqual(['DONE', 'CLOSED']);
      expect(
        applyCoverageAction(state('RELIEF_PENDING'), 'RELIEVE', ctx(['SYSTEM'])),
      ).toMatchObject({ ok: true, to: 'CLOSED' });
      expect(applyCoverageAction(state('ON_DUTY'), 'RELIEVE', ctx(['ADMIN']))).toEqual({
        ok: false,
        code: 'FORBIDDEN',
      });

      const validated = state('ON_DUTY', { rules: { proofMode: 'PHOTO', finalValidation: true } });
      expect(applyCoverageAction(validated, 'RELIEVE', ctx(['ASSIGNEE']))).toMatchObject({
        ok: true,
        to: 'DONE',
      });
      expect(
        applyCoverageAction({ ...validated, status: 'DONE' }, 'VALIDATE', ctx(['ASSIGNEE'])),
      ).toEqual({ ok: false, code: 'FORBIDDEN' });
      expect(
        applyCoverageAction({ ...validated, status: 'DONE' }, 'VALIDATE', ctx(['ADMIN'])),
      ).toMatchObject({ ok: true, to: 'CLOSED' });
    });

    it('RELEASE_BY_MANAGER : admin, motif obligatoire ; RELIEF_ABANDONED : système', () => {
      expect(
        applyCoverageAction(
          state('RELIEF_PENDING'),
          'RELEASE_BY_MANAGER',
          ctx(['ASSIGNEE'], { reason: 'x' }),
        ),
      ).toEqual({
        ok: false,
        code: 'FORBIDDEN',
      });
      expect(
        applyCoverageAction(state('RELIEF_PENDING'), 'RELEASE_BY_MANAGER', ctx(['ADMIN'])),
      ).toEqual({ ok: false, code: 'REASON_REQUIRED' });
      expect(
        applyCoverageAction(
          state('RELIEF_PENDING'),
          'RELEASE_BY_MANAGER',
          ctx(['ADMIN'], { reason: 'Remplacé' }),
        ),
      ).toMatchObject({
        ok: true,
        to: 'CLOSED',
      });
      expect(
        applyCoverageAction(state('RELIEF_PENDING'), 'RELIEF_ABANDONED', ctx(['SYSTEM'])),
      ).toMatchObject({ ok: true, to: 'ON_DUTY' });
    });

    it('EXTEND : admin ou surveillant affecté, statut inchangé, durée bornée', () => {
      expect(
        applyCoverageAction(state('ON_DUTY'), 'EXTEND', ctx(['ASSIGNEE'], { minutes: 30 })),
      ).toMatchObject({ ok: true, to: 'ON_DUTY' });
      expect(
        applyCoverageAction(state('PENDING'), 'EXTEND', ctx(['ADMIN'], { minutes: 30 })),
      ).toMatchObject({ ok: true, to: 'PENDING' });
      expect(
        applyCoverageAction(state('ON_DUTY'), 'EXTEND', ctx(['ADMIN'], { minutes: 0 })),
      ).toEqual({ ok: false, code: 'INVALID_DURATION' });
      expect(
        applyCoverageAction(state('ON_DUTY'), 'EXTEND', ctx(['ADMIN'], { minutes: 10_000 })),
      ).toEqual({ ok: false, code: 'INVALID_DURATION' });
      expect(
        applyCoverageAction(
          state('ON_DUTY'),
          'EXTEND',
          ctx(['SUPERVISOR', 'SUPPORT'], { minutes: 10 }),
        ),
      ).toEqual({
        ok: false,
        code: 'FORBIDDEN',
      });
    });
  });

  describe('décisions de l’admin', () => {
    it.each(COVERAGE_STATUSES)('SET_TEACHER depuis %s : statut inchangé (FR-015c)', (status) => {
      expect(applyCoverageAction(state(status), 'SET_TEACHER', ctx(['ADMIN']))).toMatchObject({
        ok: true,
        from: status,
        to: status,
      });
      expect(
        applyCoverageAction(state(status), 'SET_TEACHER', ctx(['ASSIGNEE', 'REQUESTER_TEACHER'])),
      ).toEqual({
        ok: false,
        code: 'FORBIDDEN',
      });
    });

    it('RELEASE_SUPPORT : admin, affectation en cours seulement (FR-015i)', () => {
      for (const status of ON_SITE) {
        expect(applyCoverageAction(state(status), 'RELEASE_SUPPORT', ctx(['ADMIN']))).toMatchObject(
          { ok: true, to: status },
        );
      }
      expect(
        applyCoverageAction(state('ON_DUTY'), 'RELEASE_SUPPORT', ctx(['ASSIGNEE', 'SUPPORT'])),
      ).toEqual({ ok: false, code: 'FORBIDDEN' });
      for (const status of ['PENDING', 'ACCEPTED', 'CLOSED'] as const) {
        expect(applyCoverageAction(state(status), 'RELEASE_SUPPORT', ctx(['ADMIN']))).toEqual({
          ok: false,
          code: 'INVALID_TRANSITION',
        });
      }
    });
  });

  describe('statuts finaux (FR-008a)', () => {
    it('terminée, annulée, non pourvue', () => {
      expect([...FINAL_COVERAGE_STATUSES].sort()).toEqual([
        'CANCELLED',
        'CLOSED',
        'DONE',
        'UNFILLED',
      ]);
    });

    it('depuis un statut final : seulement la validation d’une affectation terminée et la correction de l’enseignant', () => {
      const all: CoverageActor[] = [
        'ADMIN',
        'ASSIGNEE',
        'REQUESTER_TEACHER',
        'SUPERVISOR',
        'SUPPORT',
        'SYSTEM',
      ];
      for (const status of FINAL_COVERAGE_STATUSES) {
        const allowed = COVERAGE_ACTIONS.filter(
          (action) => applyCoverageAction(state(status), action, everything(all)).ok,
        );
        expect(allowed).toEqual(status === 'DONE' ? ['VALIDATE', 'SET_TEACHER'] : ['SET_TEACHER']);
      }
    });
  });

  describe('actions proposées', () => {
    it('le surveillant n’a aucune action d’acceptation, de refus ni d’annulation (FR-008f)', () => {
      for (const status of COVERAGE_STATUSES) {
        const actions = availableCoverageActions(state(status), [
          'ASSIGNEE',
          'SUPERVISOR',
          'SUPPORT',
        ]);
        for (const forbidden of [
          'ASSIGN',
          'REASSIGN',
          'CANCEL',
          'WITHDRAW',
          'UPDATE',
          'SET_TEACHER',
          'RELEASE_SUPPORT',
        ]) {
          expect(actions).not.toContain(forbidden);
        }
      }
      expect(availableCoverageActions(state('ACCEPTED'), ['ASSIGNEE'])).toEqual([
        'DEPART',
        'CONFIRM_PRESENCE',
        'EXTEND',
      ]);
      expect(availableCoverageActions(state('ON_DUTY'), ['ASSIGNEE'])).toEqual([
        'CONFIRM_PRESENCE',
        'REQUEST_RELIEF',
        'RELIEVE',
        'EXTEND',
      ]);
    });

    it('jamais d’action système ; l’enseignant auteur ne peut que modifier ou retirer en attente', () => {
      for (const status of COVERAGE_STATUSES) {
        const actions = availableCoverageActions(state(status), [
          'ADMIN',
          'ASSIGNEE',
          'REQUESTER_TEACHER',
          'SYSTEM',
        ]);
        for (const system of [
          'EXPIRE',
          'EXPIRE_UNFILLED',
          'ATTACH_DECLARATION',
          'RELIEF_ABANDONED',
        ]) {
          expect(actions).not.toContain(system);
        }
      }
      expect(availableCoverageActions(state('PENDING'), ['REQUESTER_TEACHER'])).toEqual([
        'UPDATE',
        'WITHDRAW',
      ]);
      expect(availableCoverageActions(state('ACCEPTED'), ['REQUESTER_TEACHER'])).toEqual([]);
    });

    it('admin : en attente, puis en cours', () => {
      expect(availableCoverageActions(state('PENDING'), ['ADMIN'])).toEqual([
        'ASSIGN',
        'EXTEND',
        'CANCEL',
        'SET_TEACHER',
      ]);
      expect(availableCoverageActions(state('ON_DUTY'), ['ADMIN'])).toEqual([
        'REASSIGN',
        'RELEASE_BY_MANAGER',
        'EXTEND',
        'CANCEL',
        'SET_TEACHER',
        'RELEASE_SUPPORT',
      ]);
    });
  });
});
