import type { ParentCommunicationStatus } from '@prisma/client';
import {
  missingForSubmit,
  visibleInConversation,
} from '../../src/parent-communications/domain/communication-workflow';

/** 015 — conversations : messages du parent et visibilité dans les deux sens. */

const SUBMITTED: ParentCommunicationStatus[] = [
  'PENDING_ADMIN_VALIDATION',
  'RETURNED_FOR_CORRECTION',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];

describe('Soumission d’un message du parent', () => {
  it('exige le texte, le vocal reste facultatif', () => {
    expect(missingForSubmit({ text: 'Bonjour', voiceFileId: null }, 'PARENT')).toEqual([]);
    expect(missingForSubmit({ text: 'Bonjour', voiceFileId: 'f1' }, 'PARENT')).toEqual([]);
    expect(missingForSubmit({ text: '  ', voiceFileId: 'f1' }, 'PARENT')).toEqual(['text']);
  });

  it('premier message de l’enseignant : règle existante, texte et vocal', () => {
    expect(missingForSubmit({ text: 'Bonjour', voiceFileId: null }, 'TEACHER')).toEqual(['voice']);
    expect(missingForSubmit({ text: 'Bonjour', voiceFileId: null })).toEqual(['voice']);
  });

  it('réponse de l’enseignant dans une conversation commencée : vocal facultatif, texte obligatoire', () => {
    expect(missingForSubmit({ text: 'Merci', voiceFileId: null }, 'TEACHER', true)).toEqual([]);
    expect(missingForSubmit({ text: ' ', voiceFileId: 'f1' }, 'TEACHER', true)).toEqual(['text']);
  });
});

describe('Visibilité dans la conversation', () => {
  it('le destinataire ne voit que les messages approuvés, dans les deux sens', () => {
    for (const [author, viewer] of [
      ['TEACHER', 'PARENT'],
      ['PARENT', 'TEACHER'],
    ] as const) {
      expect(
        SUBMITTED.filter((status) => visibleInConversation({ author, status }, viewer)),
      ).toEqual(['APPROVED']);
      expect(visibleInConversation({ author, status: 'DRAFT' }, viewer)).toBe(false);
    }
  });

  it('l’auteur voit ses messages soumis et leur état de modération', () => {
    for (const status of SUBMITTED) {
      expect(visibleInConversation({ author: 'PARENT', status }, 'PARENT')).toBe(true);
      expect(visibleInConversation({ author: 'TEACHER', status }, 'TEACHER')).toBe(true);
    }
    // Brouillon : privé à l'enseignant (le parent n'a pas de brouillon).
    expect(visibleInConversation({ author: 'TEACHER', status: 'DRAFT' }, 'TEACHER')).toBe(true);
    expect(visibleInConversation({ author: 'PARENT', status: 'DRAFT' }, 'PARENT')).toBe(false);
  });
});
