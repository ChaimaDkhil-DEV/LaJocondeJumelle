import type { ParentCommunicationStatus } from '@prisma/client';
import {
  discussionKey,
  groupDiscussions,
  type DiscussionRow,
} from '../../src/parent-communications/domain/discussions';

/**
 * 015 — « Communications à valider » en messagerie : une discussion regroupe les messages d'un
 * enseignant au représentant d'un élève ; chaque message garde son propre statut de modération.
 */

let seq = 0;
function row(
  overrides: Partial<Omit<DiscussionRow, 'submittedAt'>> & {
    status: ParentCommunicationStatus;
    submittedAt: string;
  },
): DiscussionRow {
  seq += 1;
  return {
    id: `m${seq}`,
    teacherId: 't1',
    studentId: 's1',
    guardianId: 'g1',
    ...overrides,
    submittedAt: new Date(overrides.submittedAt),
  };
}

describe('discussionKey', () => {
  it('identifie une discussion par enseignant, élève et représentant', () => {
    expect(discussionKey({ teacherId: 't1', studentId: 's1', guardianId: 'g1' })).toBe('t1.s1.g1');
  });
});

describe('groupDiscussions', () => {
  it('regroupe par enseignant, élève et représentant : un autre parent ou un autre enseignant est une autre discussion', () => {
    const groups = groupDiscussions([
      row({ status: 'PENDING_ADMIN_VALIDATION', submittedAt: '2026-11-09T09:00:00Z' }),
      row({ status: 'APPROVED', submittedAt: '2026-11-09T08:00:00Z' }),
      row({ guardianId: 'g2', status: 'APPROVED', submittedAt: '2026-11-09T07:00:00Z' }),
      row({ teacherId: 't2', status: 'REJECTED', submittedAt: '2026-11-09T06:00:00Z' }),
    ]);
    expect(groups.map((g) => [g.key, g.total])).toEqual([
      ['t1.s1.g1', 2],
      ['t1.s1.g2', 1],
      ['t2.s1.g1', 1],
    ]);
  });

  it('compte les messages de chaque statut ; un brouillon jamais soumis est ignoré', () => {
    const [group] = groupDiscussions([
      row({ status: 'PENDING_ADMIN_VALIDATION', submittedAt: '2026-11-09T09:00:00Z' }),
      row({ status: 'PENDING_ADMIN_VALIDATION', submittedAt: '2026-11-09T09:10:00Z' }),
      row({ status: 'APPROVED', submittedAt: '2026-11-09T08:00:00Z' }),
      row({ status: 'RETURNED_FOR_CORRECTION', submittedAt: '2026-11-09T08:30:00Z' }),
      row({ status: 'REJECTED', submittedAt: '2026-11-09T07:00:00Z' }),
      row({ status: 'CANCELLED', submittedAt: '2026-11-09T06:00:00Z' }),
      row({ status: 'DRAFT', submittedAt: '2026-11-09T10:00:00Z' }),
    ]);
    expect(group!.counts).toEqual({
      PENDING_ADMIN_VALIDATION: 2,
      RETURNED_FOR_CORRECTION: 1,
      APPROVED: 1,
      REJECTED: 1,
      CANCELLED: 1,
    });
    expect(group!.total).toBe(6);
  });

  it('dernier message : le plus récemment soumis ; premier à valider : le plus ancien en attente', () => {
    const old = row({ status: 'PENDING_ADMIN_VALIDATION', submittedAt: '2026-11-08T09:00:00Z' });
    const recentPending = row({
      status: 'PENDING_ADMIN_VALIDATION',
      submittedAt: '2026-11-09T09:00:00Z',
    });
    const latest = row({ status: 'APPROVED', submittedAt: '2026-11-09T11:00:00Z' });
    const [group] = groupDiscussions([recentPending, latest, old]);
    expect(group!.last.id).toBe(latest.id);
    expect(group!.firstPending?.id).toBe(old.id);
  });

  it('sans message en attente, aucun premier message à valider', () => {
    const [group] = groupDiscussions([
      row({ status: 'APPROVED', submittedAt: '2026-11-09T09:00:00Z' }),
      row({ status: 'REJECTED', submittedAt: '2026-11-09T10:00:00Z' }),
    ]);
    expect(group!.firstPending).toBeNull();
  });

  it('trie les discussions du dernier échange au plus ancien', () => {
    const groups = groupDiscussions([
      row({ studentId: 'a', status: 'APPROVED', submittedAt: '2026-11-01T09:00:00Z' }),
      row({ studentId: 'b', status: 'APPROVED', submittedAt: '2026-11-09T09:00:00Z' }),
      row({ studentId: 'c', status: 'APPROVED', submittedAt: '2026-11-05T09:00:00Z' }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['t1.b.g1', 't1.c.g1', 't1.a.g1']);
  });
});
