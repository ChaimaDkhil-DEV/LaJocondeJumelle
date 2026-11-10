import type { ParentCommunicationStatus } from '@prisma/client';

/**
 * « Communications à valider » en messagerie (015) : une discussion regroupe les messages d'un
 * enseignant au représentant d'un élève. Ce n'est qu'un regroupement : chaque message
 * (ParentCommunication) garde son propre statut et se décide seul. Règles pures.
 */
export interface DiscussionRow {
  id: string;
  teacherId: string;
  studentId: string;
  guardianId: string;
  status: ParentCommunicationStatus;
  submittedAt: Date | null;
}

/** Statuts visibles par la validation : tout sauf le brouillon jamais soumis. */
export type DiscussionStatus = Exclude<ParentCommunicationStatus, 'DRAFT'>;
export type DiscussionCounts = Record<DiscussionStatus, number>;

export interface DiscussionGroup<T extends DiscussionRow> {
  key: string;
  /** Message soumis le plus récemment (aperçu, date du dernier échange). */
  last: T;
  /** Message en attente le plus ancien : celui à examiner en premier ; null s'il n'y en a pas. */
  firstPending: T | null;
  counts: DiscussionCounts;
  total: number;
}

export function discussionKey(row: {
  teacherId: string;
  studentId: string;
  guardianId: string;
}): string {
  return `${row.teacherId}.${row.studentId}.${row.guardianId}`;
}

const time = (row: DiscussionRow) => row.submittedAt?.getTime() ?? 0;

const emptyCounts = (): DiscussionCounts => ({
  PENDING_ADMIN_VALIDATION: 0,
  RETURNED_FOR_CORRECTION: 0,
  APPROVED: 0,
  REJECTED: 0,
  CANCELLED: 0,
});

/** Regroupe les messages soumis en discussions, de la plus récemment active à la plus ancienne. */
export function groupDiscussions<T extends DiscussionRow>(rows: T[]): DiscussionGroup<T>[] {
  const groups = new Map<string, DiscussionGroup<T>>();
  for (const row of rows) {
    if (row.status === 'DRAFT') continue;
    const key = discussionKey(row);
    let group = groups.get(key);
    if (!group) {
      group = { key, last: row, firstPending: null, counts: emptyCounts(), total: 0 };
      groups.set(key, group);
    }
    group.counts[row.status] += 1;
    group.total += 1;
    if (time(row) > time(group.last)) group.last = row;
    if (
      row.status === 'PENDING_ADMIN_VALIDATION' &&
      (!group.firstPending || time(row) < time(group.firstPending))
    ) {
      group.firstPending = row;
    }
  }
  return [...groups.values()].sort((a, b) => time(b.last) - time(a.last));
}
