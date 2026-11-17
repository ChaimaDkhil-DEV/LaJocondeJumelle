import type { RequestKind, RequestStatus, Role, RoutingMode } from '@prisma/client';
import {
  actsAsAdministration,
  canAskTakeover,
  canClaim,
  canProposeDelegation,
  canSeeInCommonQueue,
  inCommonQueue,
  isEligibleAdmin,
  isFinishedStatus,
  isOwnable,
  isTransferable,
  takesByActing,
  type OwnershipCategory,
  type OwnershipRequest,
} from '../../src/requests/domain/ownership';

/**
 * T011 — 018, data-model.md §Rules : administrateur responsable d'une demande (file commune, prise en
 * charge). Fonctions pures, testées par table.
 */

const ADMIN_A = 'admin-a';
const ADMIN_B = 'admin-b';
const OUTSIDER = 'admin-hors-categorie';

const user = (id: string, role: Role = 'ADMIN', active = true) => ({ id, role, active });

const category = (routingMode: RoutingMode = 'VIA_ADMIN'): OwnershipCategory => ({
  routingMode,
  managerIds: new Set([ADMIN_A, ADMIN_B, 'super', 'employe']),
});

const request = (over: Partial<OwnershipRequest> = {}): OwnershipRequest => ({
  kind: 'WORK',
  status: 'PENDING_ADMIN_VALIDATION',
  adminOwnerId: null,
  ...over,
});

describe('Responsable administratif — règles pures', () => {
  describe('isOwnable', () => {
    it.each<[string, RequestKind, RoutingMode, RequestStatus, boolean]>([
      ['demande de travail via l’administration, en attente', 'WORK', 'VIA_ADMIN', 'PENDING_ADMIN_VALIDATION', true],
      ['demande déjà envoyée à l’employé', 'WORK', 'VIA_ADMIN', 'SENT', true],
      ['demande terminée', 'WORK', 'VIA_ADMIN', 'CLOSED', true],
      ['brouillon', 'WORK', 'VIA_ADMIN', 'DRAFT', false],
      ['catégorie directe', 'WORK', 'DIRECT', 'SENT', false],
      ['catégorie entre enseignants', 'WORK', 'PEER', 'SENT', false],
      ['garde de classe', 'COVERAGE', 'VIA_ADMIN', 'PENDING', false],
    ])('%s', (_label, kind, routingMode, status, expected) => {
      expect(isOwnable(request({ kind, status }), category(routingMode))).toBe(expected);
    });
  });

  describe('isEligibleAdmin', () => {
    it.each<[string, ReturnType<typeof user>, boolean]>([
      ['admin actif responsable de la catégorie', user(ADMIN_A), true],
      ['admin désactivé', user(ADMIN_A, 'ADMIN', false), false],
      ['admin non responsable de la catégorie', user(OUTSIDER), false],
      ['super administrateur, même listé', user('super', 'SUPER_ADMIN'), false],
      ['employé resté listé après rétrogradation', user('employe', 'EMPLOYEE'), false],
      ['parent', user('parent', 'PARENT'), false],
    ])('%s', (_label, candidate, expected) => {
      expect(isEligibleAdmin(candidate, category())).toBe(expected);
    });
  });

  describe('inCommonQueue', () => {
    it.each<[string, Partial<OwnershipRequest>, RoutingMode, boolean]>([
      ['en attente de validation et libre', {}, 'VIA_ADMIN', true],
      ['déjà prise en charge', { adminOwnerId: ADMIN_A }, 'VIA_ADMIN', false],
      ['libre mais déjà validée', { status: 'SENT' }, 'VIA_ADMIN', false],
      ['libre mais annulée', { status: 'CANCELLED' }, 'VIA_ADMIN', false],
      ['catégorie directe', { status: 'SENT' }, 'DIRECT', false],
      ['garde de classe', { kind: 'COVERAGE' }, 'VIA_ADMIN', false],
    ])('%s', (_label, over, routingMode, expected) => {
      expect(inCommonQueue(request(over), category(routingMode))).toBe(expected);
    });
  });

  describe('canSeeInCommonQueue', () => {
    it.each<[string, ReturnType<typeof user>, boolean]>([
      ['admin responsable de la catégorie', user(ADMIN_A), true],
      ['super administrateur : toute la file', user('quelconque', 'SUPER_ADMIN'), true],
      ['super administrateur désactivé', user('quelconque', 'SUPER_ADMIN', false), false],
      ['admin d’une autre catégorie', user(OUTSIDER), false],
      ['employé', user('employe', 'EMPLOYEE'), false],
    ])('%s', (_label, viewer, expected) => {
      expect(canSeeInCommonQueue(viewer, request(), category())).toBe(expected);
    });

    it('personne ne voit dans la file une demande déjà prise', () => {
      expect(canSeeInCommonQueue(user(ADMIN_B), request({ adminOwnerId: ADMIN_A }), category())).toBe(false);
    });
  });

  describe('canClaim', () => {
    it.each<[string, ReturnType<typeof user>, Partial<OwnershipRequest>, boolean]>([
      ['admin éligible, demande libre en attente', user(ADMIN_A), {}, true],
      ['demande déjà prise par un collègue', user(ADMIN_B), { adminOwnerId: ADMIN_A }, false],
      ['demande déjà prise par lui-même', user(ADMIN_A), { adminOwnerId: ADMIN_A }, false],
      ['demande libre mais plus en attente de validation', user(ADMIN_A), { status: 'SENT' }, false],
      ['super administrateur : jamais responsable', user('super', 'SUPER_ADMIN'), {}, false],
      ['admin non responsable de la catégorie', user(OUTSIDER), {}, false],
      ['admin désactivé', user(ADMIN_A, 'ADMIN', false), {}, false],
      ['employé', user('employe', 'EMPLOYEE'), {}, false],
    ])('%s', (_label, candidate, over, expected) => {
      expect(canClaim(candidate, request(over), category())).toBe(expected);
    });
  });

  describe('actsAsAdministration (qui garde le rôle d’administration sur la demande)', () => {
    it.each<[string, ReturnType<typeof user>, string | null, boolean]>([
      ['admin, demande libre : comme aujourd’hui', user(ADMIN_A), null, true],
      ['admin responsable', user(ADMIN_A), ADMIN_A, true],
      ['admin non responsable d’une demande prise', user(ADMIN_B), ADMIN_A, false],
      ['super administrateur, demande libre', user('super', 'SUPER_ADMIN'), null, true],
      ['super administrateur, demande prise : inchangé', user('super', 'SUPER_ADMIN'), ADMIN_A, true],
    ])('%s', (_label, actor, adminOwnerId, expected) => {
      expect(actsAsAdministration(actor, { adminOwnerId })).toBe(expected);
    });
  });

  describe('takesByActing (D4 : agir sur une demande libre vaut prise en charge)', () => {
    it.each<[string, ReturnType<typeof user>, Partial<OwnershipRequest>, RoutingMode, boolean]>([
      ['admin éligible, demande libre en attente', user(ADMIN_A), {}, 'VIA_ADMIN', true],
      ['admin éligible, demande libre déjà validée (antérieure à 018)', user(ADMIN_A), { status: 'SENT' }, 'VIA_ADMIN', true],
      ['admin déjà responsable', user(ADMIN_A), { adminOwnerId: ADMIN_A }, 'VIA_ADMIN', false],
      ['super administrateur : n’est jamais responsable', user('super', 'SUPER_ADMIN'), {}, 'VIA_ADMIN', false],
      ['catégorie directe (clôture confiée à l’administration)', user(ADMIN_A), { status: 'DONE' }, 'DIRECT', false],
      ['admin non responsable de la catégorie', user(OUTSIDER), {}, 'VIA_ADMIN', false],
    ])('%s', (_label, actor, over, routingMode, expected) => {
      expect(takesByActing(actor, request(over), category(routingMode))).toBe(expected);
    });
  });

  describe('isTransferable (une demande peut-elle faire l’objet d’une proposition de transfert ?)', () => {
    it.each<[string, Partial<OwnershipRequest>, RoutingMode, boolean]>([
      ['prise en charge, en attente de validation', { adminOwnerId: ADMIN_A }, 'VIA_ADMIN', true],
      ['prise en charge, en cours chez l’employé', { adminOwnerId: ADMIN_A, status: 'IN_PROGRESS' }, 'VIA_ADMIN', true],
      ['prise en charge, en attente de validation finale', { adminOwnerId: ADMIN_A, status: 'PENDING_FINAL_VALIDATION' }, 'VIA_ADMIN', true],
      ['libre : personne à qui la reprendre', {}, 'VIA_ADMIN', false],
      ['clôturée', { adminOwnerId: ADMIN_A, status: 'CLOSED' }, 'VIA_ADMIN', false],
      ['refusée', { adminOwnerId: ADMIN_A, status: 'REJECTED' }, 'VIA_ADMIN', false],
      ['annulée', { adminOwnerId: ADMIN_A, status: 'CANCELLED' }, 'VIA_ADMIN', false],
      ['catégorie directe', { adminOwnerId: ADMIN_A, status: 'SENT' }, 'DIRECT', false],
    ])('%s', (_label, over, routingMode, expected) => {
      expect(isTransferable(request(over), category(routingMode))).toBe(expected);
    });
  });

  describe('canProposeDelegation (le responsable confie sa demande)', () => {
    const taken = request({ adminOwnerId: ADMIN_A });
    it.each<[string, ReturnType<typeof user>, OwnershipRequest, boolean, boolean]>([
      ['le responsable, sans proposition en attente', user(ADMIN_A), taken, false, true],
      ['le responsable, une proposition déjà en attente', user(ADMIN_A), taken, true, false],
      ['un collègue : ce n’est pas sa demande', user(ADMIN_B), taken, false, false],
      ['le responsable d’une demande terminée', user(ADMIN_A), request({ adminOwnerId: ADMIN_A, status: 'CLOSED' }), false, false],
      ['le responsable désactivé', user(ADMIN_A, 'ADMIN', false), taken, false, false],
      ['le super administrateur', user('super', 'SUPER_ADMIN'), taken, false, false],
      ['demande libre', user(ADMIN_A), request(), false, false],
    ])('%s', (_label, actor, req, pending, expected) => {
      expect(canProposeDelegation(actor, req, category(), pending)).toBe(expected);
    });
  });

  describe('canAskTakeover (un collègue demande à reprendre la demande)', () => {
    const taken = request({ adminOwnerId: ADMIN_A });
    it.each<[string, ReturnType<typeof user>, OwnershipRequest, boolean, boolean]>([
      ['un collègue éligible, sans proposition en attente', user(ADMIN_B), taken, false, true],
      ['un collègue, une proposition déjà en attente', user(ADMIN_B), taken, true, false],
      ['le responsable lui-même', user(ADMIN_A), taken, false, false],
      ['un admin hors de la catégorie', user(OUTSIDER), taken, false, false],
      ['le super administrateur', user('super', 'SUPER_ADMIN'), taken, false, false],
      ['un employé', user('employe', 'EMPLOYEE'), taken, false, false],
      ['demande libre : il suffit de la prendre', user(ADMIN_B), request(), false, false],
      ['demande terminée', user(ADMIN_B), request({ adminOwnerId: ADMIN_A, status: 'REJECTED' }), false, false],
    ])('%s', (_label, actor, req, pending, expected) => {
      expect(canAskTakeover(actor, req, category(), pending)).toBe(expected);
    });
  });

  describe('isFinishedStatus', () => {
    it.each<[RequestStatus, boolean]>([
      ['CLOSED', true],
      ['REJECTED', true],
      ['CANCELLED', true],
      ['DONE', false],
      ['PENDING_FINAL_VALIDATION', false],
      ['PENDING_ADMIN_VALIDATION', false],
      ['IN_PROGRESS', false],
    ])('%s → %s', (status, expected) => {
      expect(isFinishedStatus(status)).toBe(expected);
    });
  });
});
