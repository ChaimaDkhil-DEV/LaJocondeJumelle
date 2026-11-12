import { describe, expect, it } from 'vitest';
import type { ConversationSummary } from '../../src/features/parent-communications/api';
import {
  filterConversations,
  legacyCommunicationsUrl,
  parseVue,
  unreadTotal,
} from '../../src/features/parent-communications/communicationsView';

/** 017 — page unique « Communications » de l'administration : logique pure (onglet, filtres, anciennes adresses). */

const base = {
  status: 'OPEN',
  lastMessage: null,
  createdAt: '2026-11-11T08:00:00.000Z',
  lastMessageAt: '2026-11-11T08:00:00.000Z',
} as const;
const student = (first: string, last: string) => ({
  id: `${first}-${last}`,
  firstName: first,
  lastName: last,
  class: { id: 'k1', name: '1ère année Violet' },
});
const conv = (
  id: string,
  type: ConversationSummary['type'],
  unread: number,
  first = 'Lina',
  last = 'Ben Salah',
) => ({ ...base, id, type, unread, student: student(first, last) }) as ConversationSummary;

const list = [
  conv('a', 'INTERNAL', 2),
  conv('b', 'PARENT', 0, 'Adam', 'Kefi'),
  conv('c', 'LEGACY_TEACHER_PARENT', 0),
  conv('d', 'PARENT', 1, 'Nora', 'Trabelsi'),
];
const ids = (items: ConversationSummary[]) => items.map((c) => c.id);

describe('parseVue', () => {
  it('lit ?vue= et retombe sur la boîte de réception', () => {
    expect(parseVue('conversations', false)).toBe('conversations');
    expect(parseVue('boite', false)).toBe('boite');
    expect(parseVue(null, true)).toBe('boite');
    expect(parseVue('nimporte-quoi', true)).toBe('boite');
  });

  it('« À valider » n’est accessible qu’avec le droit de valider', () => {
    expect(parseVue('valider', true)).toBe('valider');
    expect(parseVue('valider', false)).toBe('boite');
  });
});

describe('filterConversations', () => {
  it('« Tous » garde tout, dans l’ordre', () => {
    expect(ids(filterConversations(list, { filter: 'all' }))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('« Non lus » : seulement les conversations avec des messages non lus', () => {
    expect(ids(filterConversations(list, { filter: 'unread' }))).toEqual(['a', 'd']);
  });

  it('« Enseignants », « Parents », « Archivés » : un type chacun', () => {
    expect(ids(filterConversations(list, { filter: 'teachers' }))).toEqual(['a']);
    expect(ids(filterConversations(list, { filter: 'parents' }))).toEqual(['b', 'd']);
    expect(ids(filterConversations(list, { filter: 'archived' }))).toEqual(['c']);
  });

  it('la recherche porte sur le nom de l’élève, sans tenir compte des accents ni de la casse', () => {
    expect(ids(filterConversations(list, { filter: 'all', q: 'KEFI' }))).toEqual(['b']);
    expect(ids(filterConversations(list, { filter: 'parents', q: 'trab' }))).toEqual(['d']);
    expect(ids(filterConversations(list, { filter: 'all', q: '   ' }))).toHaveLength(4);
  });
});

describe('unreadTotal', () => {
  it('additionne les messages non lus (jamais de valeur fictive)', () => {
    expect(unreadTotal(list)).toBe(3);
    expect(unreadTotal(undefined)).toBe(0);
  });
});

describe('legacyCommunicationsUrl', () => {
  it('boîte et conversations : ?vue= et la conversation ouverte', () => {
    expect(legacyCommunicationsUrl('boite', undefined, '')).toBe('/communications?vue=boite');
    expect(legacyCommunicationsUrl('boite', 'c1', '')).toBe(
      '/communications?vue=boite&conversation=c1',
    );
    expect(legacyCommunicationsUrl('conversations', 'c1', '')).toBe(
      '/communications?vue=conversations&conversation=c1',
    );
  });

  it('« À valider » : le message examiné', () => {
    expect(legacyCommunicationsUrl('valider', undefined, '')).toBe('/communications?vue=valider');
    expect(legacyCommunicationsUrl('valider', 'm5', '')).toBe(
      '/communications?vue=valider&message=m5',
    );
  });

  it('« nouveau » : ouvre le panneau et garde l’élève et le lien préremplis', () => {
    expect(legacyCommunicationsUrl('nouveau', undefined, '')).toBe('/communications?nouveau');
    expect(
      legacyCommunicationsUrl(
        'nouveau',
        undefined,
        '?type=PARENT&studentId=s1&linkedInternalId=c1&autre=x',
      ),
    ).toBe('/communications?nouveau&type=PARENT&studentId=s1&linkedInternalId=c1');
  });

  it('encode l’identifiant', () => {
    expect(legacyCommunicationsUrl('conversations', 'a b', '')).toBe(
      '/communications?vue=conversations&conversation=a%20b',
    );
  });
});
