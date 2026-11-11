import type { ParentCommunicationStatus } from '@prisma/client';
import {
  canEdit,
  decisionBlocked,
  isFinal,
  missingContent,
  nextStatus,
  type CommunicationAction,
} from '../../src/parent-communications/domain/communication-workflow';

/**
 * Statuts et transitions d'un message (015, FR-001 ; 017, FR-007 à FR-010). La visibilité selon le lecteur
 * est dans domain/conversation-access.ts (test conversation-access.spec.ts).
 */

const ALL: ParentCommunicationStatus[] = [
  'DRAFT',
  'PENDING_ADMIN_VALIDATION',
  'RETURNED_FOR_CORRECTION',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'SENT',
];

describe('Transitions', () => {
  it.each<[ParentCommunicationStatus, CommunicationAction, ParentCommunicationStatus]>([
    ['DRAFT', 'SUBMIT', 'PENDING_ADMIN_VALIDATION'],
    ['DRAFT', 'CANCEL', 'CANCELLED'],
    ['PENDING_ADMIN_VALIDATION', 'APPROVE', 'APPROVED'],
    ['PENDING_ADMIN_VALIDATION', 'RETURN', 'RETURNED_FOR_CORRECTION'],
    ['PENDING_ADMIN_VALIDATION', 'REJECT', 'REJECTED'],
    ['RETURNED_FOR_CORRECTION', 'SUBMIT', 'PENDING_ADMIN_VALIDATION'],
    ['RETURNED_FOR_CORRECTION', 'CANCEL', 'CANCELLED'],
  ])('%s + %s → %s', (from, action, to) => {
    expect(nextStatus(from, action)).toBe(to);
  });

  it('refuse toute autre transition ; un message envoyé directement n’en a aucune (017)', () => {
    const allowed = new Set([
      'DRAFT:SUBMIT',
      'DRAFT:CANCEL',
      'PENDING_ADMIN_VALIDATION:APPROVE',
      'PENDING_ADMIN_VALIDATION:RETURN',
      'PENDING_ADMIN_VALIDATION:REJECT',
      'RETURNED_FOR_CORRECTION:SUBMIT',
      'RETURNED_FOR_CORRECTION:CANCEL',
    ]);
    for (const status of ALL) {
      for (const action of ['SUBMIT', 'CANCEL', 'APPROVE', 'RETURN', 'REJECT'] as CommunicationAction[]) {
        if (!allowed.has(`${status}:${action}`)) expect(nextStatus(status, action)).toBeNull();
      }
    }
  });

  it('se modifient : brouillon et message retourné ; définitifs : approuvé, rejeté, annulé, envoyé', () => {
    expect(ALL.filter(canEdit)).toEqual(['DRAFT', 'RETURNED_FOR_CORRECTION']);
    expect(ALL.filter(isFinal)).toEqual(['APPROVED', 'REJECTED', 'CANCELLED', 'SENT']);
  });
});

describe('Contenu d’un message (017, FR-007)', () => {
  it('un texte, un vocal, ou les deux', () => {
    expect(missingContent({ text: 'Bonjour', voiceFileId: null })).toBe(false);
    expect(missingContent({ text: null, voiceFileId: 'f1' })).toBe(false);
    expect(missingContent({ text: 'Bonjour', voiceFileId: 'f1' })).toBe(false);
  });

  it('ni texte (ou seulement des espaces) ni vocal : incomplet', () => {
    expect(missingContent({ text: null, voiceFileId: null })).toBe(true);
    expect(missingContent({ text: '   ', voiceFileId: null })).toBe(true);
  });
});

describe('Décision sur un message (017, D4)', () => {
  it('refusée dans une archive et dans une conversation clôturée', () => {
    expect(decisionBlocked({ type: 'LEGACY_TEACHER_PARENT', status: 'CLOSED' })).toBe('ARCHIVED');
    expect(decisionBlocked({ type: 'PARENT', status: 'CLOSED' })).toBe('CLOSED');
    expect(decisionBlocked({ type: 'PARENT', status: 'OPEN' })).toBeNull();
  });
});
