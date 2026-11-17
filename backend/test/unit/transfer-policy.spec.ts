import type { RequestTransferStatus, RequestTransferType } from '@prisma/client';
import { canAnswer, canCancel, isOverdue, newOwnerOf, type PolicyTransfer } from '../../src/transfers/domain/transfer-policy';

/** T031 — 018, data-model.md §Rules : réponse, annulation et effet d'une proposition de transfert. */

const NOW = new Date('2026-11-17T10:00:00.000Z');
const LATER = new Date('2026-11-17T12:00:00.000Z');
const EARLIER = new Date('2026-11-17T09:59:59.000Z');

const OWNER = 'admin-a';
const COLLEAGUE = 'admin-b';
const THIRD = 'admin-c';

/** Délégation : A (responsable) propose à B. Reprise : B demande à A (responsable). */
function transfer(type: RequestTransferType, over: Partial<PolicyTransfer> = {}): PolicyTransfer {
  const delegation = type === 'DELEGATION_REQUEST';
  return {
    type,
    status: 'PENDING',
    initiatorId: delegation ? OWNER : COLLEAGUE,
    recipientId: delegation ? COLLEAGUE : OWNER,
    currentOwnerId: OWNER,
    expiresAt: LATER,
    ...over,
  };
}

describe('Propositions de transfert — règles pures', () => {
  describe('newOwnerOf : qui devient responsable si la proposition est acceptée', () => {
    it('délégation : le collègue à qui elle est proposée', () => {
      expect(newOwnerOf(transfer('DELEGATION_REQUEST'))).toBe(COLLEAGUE);
    });

    it('demande de reprise : celui qui l’a demandée, jamais sans l’accord du responsable', () => {
      expect(newOwnerOf(transfer('TAKEOVER_REQUEST'))).toBe(COLLEAGUE);
    });
  });

  describe('canAnswer : seul le destinataire, sur une proposition en attente et non échue', () => {
    it.each<[string, RequestTransferType, string, Partial<PolicyTransfer>, boolean]>([
      ['délégation : le collègue destinataire', 'DELEGATION_REQUEST', COLLEAGUE, {}, true],
      ['délégation : son auteur ne répond pas à sa propre proposition', 'DELEGATION_REQUEST', OWNER, {}, false],
      ['reprise : le responsable, destinataire', 'TAKEOVER_REQUEST', OWNER, {}, true],
      ['reprise : le demandeur ne s’accorde pas la demande', 'TAKEOVER_REQUEST', COLLEAGUE, {}, false],
      ['un troisième administrateur', 'DELEGATION_REQUEST', THIRD, {}, false],
      ['proposition échue', 'DELEGATION_REQUEST', COLLEAGUE, { expiresAt: EARLIER }, false],
      ['proposition échue à l’instant même', 'DELEGATION_REQUEST', COLLEAGUE, { expiresAt: NOW }, false],
    ])('%s', (_label, type, userId, over, expected) => {
      expect(canAnswer(userId, transfer(type, over), NOW)).toBe(expected);
    });

    it.each<RequestTransferStatus>(['ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED'])('proposition déjà %s : plus de réponse possible', (status) => {
      expect(canAnswer(COLLEAGUE, transfer('DELEGATION_REQUEST', { status }), NOW)).toBe(false);
    });
  });

  describe('canCancel : seul l’auteur, tant que la proposition est en attente', () => {
    it.each<[string, RequestTransferType, string, Partial<PolicyTransfer>, boolean]>([
      ['délégation : son auteur', 'DELEGATION_REQUEST', OWNER, {}, true],
      ['reprise : son auteur', 'TAKEOVER_REQUEST', COLLEAGUE, {}, true],
      ['le destinataire refuse, il n’annule pas', 'DELEGATION_REQUEST', COLLEAGUE, {}, false],
      ['un troisième administrateur', 'DELEGATION_REQUEST', THIRD, {}, false],
      ['proposition déjà acceptée', 'DELEGATION_REQUEST', OWNER, { status: 'ACCEPTED' }, false],
      ['proposition déjà refusée', 'DELEGATION_REQUEST', OWNER, { status: 'REJECTED' }, false],
      ['proposition expirée', 'DELEGATION_REQUEST', OWNER, { status: 'EXPIRED' }, false],
      ['échue mais pas encore marquée expirée : l’auteur peut encore la retirer', 'DELEGATION_REQUEST', OWNER, { expiresAt: EARLIER }, true],
    ])('%s', (_label, type, userId, over, expected) => {
      expect(canCancel(userId, transfer(type, over))).toBe(expected);
    });
  });

  describe('isOverdue', () => {
    it.each<[string, Partial<PolicyTransfer>, boolean]>([
      ['en attente, délai dépassé', { expiresAt: EARLIER }, true],
      ['en attente, délai atteint à l’instant', { expiresAt: NOW }, true],
      ['en attente, délai non atteint', {}, false],
      ['déjà acceptée : n’expire plus', { status: 'ACCEPTED', expiresAt: EARLIER }, false],
    ])('%s', (_label, over, expected) => {
      expect(isOverdue(transfer('DELEGATION_REQUEST', over), NOW)).toBe(expected);
    });
  });
});
