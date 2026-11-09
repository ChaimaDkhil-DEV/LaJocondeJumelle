import type { ParentCommunicationStatus } from '@prisma/client';
import {
  canEdit,
  isFinal,
  missingForSubmit,
  nextStatus,
  parentCanSee,
  validatorCanSee,
  type CommunicationAction,
} from '../../src/parent-communications/domain/communication-workflow';

/** 015 — statuts et transitions d'une communication aux parents (FR-001, FR-002, FR-005). */

const ALL: ParentCommunicationStatus[] = [
  'DRAFT',
  'PENDING_ADMIN_VALIDATION',
  'RETURNED_FOR_CORRECTION',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
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

  it('refuse toute autre transition', () => {
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
      for (const action of [
        'SUBMIT',
        'CANCEL',
        'APPROVE',
        'RETURN',
        'REJECT',
      ] as CommunicationAction[]) {
        if (!allowed.has(`${status}:${action}`)) expect(nextStatus(status, action)).toBeNull();
      }
    }
  });

  it('une communication en attente ne se modifie pas ; approuvée, rejetée ou annulée, elle est définitive', () => {
    expect(ALL.filter(canEdit)).toEqual(['DRAFT', 'RETURNED_FOR_CORRECTION']);
    expect(ALL.filter(isFinal)).toEqual(['APPROVED', 'REJECTED', 'CANCELLED']);
  });
});

describe('Soumission', () => {
  it('exige la remarque écrite et le message vocal', () => {
    expect(missingForSubmit({ text: 'Très bon trimestre.', voiceFileId: 'f1' })).toEqual([]);
    expect(missingForSubmit({ text: '   ', voiceFileId: 'f1' })).toEqual(['text']);
    expect(missingForSubmit({ text: 'Remarque', voiceFileId: null })).toEqual(['voice']);
    expect(missingForSubmit({ text: null, voiceFileId: null })).toEqual(['text', 'voice']);
  });
});

describe('Visibilité', () => {
  it('le parent ne voit que les communications approuvées', () => {
    expect(ALL.filter(parentCanSee)).toEqual(['APPROVED']);
  });

  it('la validation ne voit jamais un brouillon jamais soumis', () => {
    expect(validatorCanSee('DRAFT', 0)).toBe(false);
    // Annulé avant toute soumission : reste privé à l'enseignant.
    expect(validatorCanSee('CANCELLED', 0)).toBe(false);
    for (const status of ALL.filter((s) => s !== 'DRAFT'))
      expect(validatorCanSee(status, 1)).toBe(true);
  });
});
