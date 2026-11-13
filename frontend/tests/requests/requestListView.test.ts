import { describe, expect, it } from 'vitest';
import {
  defaultTabKey,
  isFinished,
  isLate,
  primaryAction,
  rowLevel,
  sortRequests,
  splitSections,
} from '../../src/features/requests/requestListView';
import type { RequestSummary } from '../../src/features/requests/types';

/** « Mes demandes » : tri commun aux onglets, deux sections, action principale, onglet par défaut. */

const NOW = Date.parse('2026-11-13T12:00:00.000Z');

function req(id: string, over: Partial<RequestSummary> = {}): RequestSummary {
  return {
    id,
    reference: id,
    title: id,
    category: { id: 'c', name: 'Cat' },
    priority: 'NORMAL',
    status: 'SENT',
    requester: { id: 'u1', displayName: 'A' },
    assignee: null,
    createdAt: '2026-11-10T08:00:00.000Z',
    currentStage: null,
    currentDueAt: null,
    warnAt: null,
    overdueStage: null,
    hasVoice: false,
    unreadCount: 0,
    ...over,
  };
}

const late = (id: string, createdAt: string, over: Partial<RequestSummary> = {}) =>
  req(id, { createdAt, overdueStage: 'TAKEOVER', ...over });

describe('isFinished / isLate', () => {
  it('terminées, clôturées, refusées et annulées sont closes ; les autres sont ouvertes', () => {
    for (const s of ['DONE', 'CLOSED', 'REJECTED', 'CANCELLED'] as const) expect(isFinished(s)).toBe(true);
    for (const s of ['SENT', 'ACCEPTED', 'IN_PROGRESS', 'PENDING_ADMIN_VALIDATION', 'PENDING_FINAL_VALIDATION', 'TO_CORRECT', 'DRAFT'] as const) {
      expect(isFinished(s)).toBe(false);
    }
  });

  it('en retard : étape marquée en retard par le serveur, ou échéance dépassée', () => {
    expect(isLate(req('a', { overdueStage: 'VALIDATION' }), NOW)).toBe(true);
    expect(isLate(req('b', { currentStage: 'TAKEOVER', currentDueAt: '2026-11-13T11:00:00.000Z' }), NOW)).toBe(true);
    expect(isLate(req('c', { currentStage: 'TAKEOVER', currentDueAt: '2026-11-13T13:00:00.000Z' }), NOW)).toBe(false);
    expect(isLate(req('d'), NOW)).toBe(false);
  });

  it('une demande close n’est jamais en retard', () => {
    expect(isLate(req('e', { status: 'CLOSED', overdueStage: 'COMPLETION' }), NOW)).toBe(false);
  });
});

describe('rowLevel', () => {
  it('urgente ouverte d’abord, même en retard', () => {
    expect(rowLevel(req('a', { priority: 'URGENT', overdueStage: 'TAKEOVER' }), NOW)).toBe('urgent');
    expect(rowLevel(req('b', { priority: 'URGENT' }), NOW)).toBe('urgent');
  });
  it('retard, normale, close', () => {
    expect(rowLevel(late('c', '2026-11-01T00:00:00.000Z'), NOW)).toBe('late');
    expect(rowLevel(req('d'), NOW)).toBe('normal');
    expect(rowLevel(req('e', { status: 'REJECTED', priority: 'URGENT' }), NOW)).toBe('closed');
  });
});

describe('sortRequests', () => {
  it('urgentes, puis en retard, puis normales, puis closes (urgentes d’abord)', () => {
    const list = [
      req('normale'),
      req('close-normale', { status: 'CLOSED' }),
      late('retard', '2026-11-05T00:00:00.000Z'),
      req('close-urgente', { status: 'DONE', priority: 'URGENT' }),
      req('urgente', { priority: 'URGENT' }),
    ];
    expect(sortRequests(list, NOW).map((r) => r.id)).toEqual(['urgente', 'retard', 'normale', 'close-urgente', 'close-normale']);
  });

  it('en retard : la plus ancienne d’abord ; les autres : la plus récente d’abord', () => {
    const lates = sortRequests([late('r-recent', '2026-11-09T00:00:00.000Z'), late('r-ancien', '2026-11-02T00:00:00.000Z')], NOW);
    expect(lates.map((r) => r.id)).toEqual(['r-ancien', 'r-recent']);
    const normals = sortRequests(
      [req('n-ancien', { createdAt: '2026-11-02T00:00:00.000Z' }), req('n-recent', { createdAt: '2026-11-09T00:00:00.000Z' })],
      NOW,
    );
    expect(normals.map((r) => r.id)).toEqual(['n-recent', 'n-ancien']);
  });

  it('ne modifie pas le tableau reçu', () => {
    const list = [req('b', { createdAt: '2026-11-01T00:00:00.000Z' }), req('a', { createdAt: '2026-11-09T00:00:00.000Z' })];
    sortRequests(list, NOW);
    expect(list.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('splitSections', () => {
  it('« Prioritaires » : urgentes et en retard ouvertes ; « Autres » : normales et closes', () => {
    const sorted = sortRequests(
      [req('n'), req('u', { priority: 'URGENT' }), late('r', '2026-11-01T00:00:00.000Z'), req('c', { status: 'CLOSED', priority: 'URGENT' })],
      NOW,
    );
    const { priority, others } = splitSections(sorted, NOW);
    expect(priority.map((r) => r.id)).toEqual(['u', 'r']);
    expect(others.map((r) => r.id)).toEqual(['n', 'c']);
  });

  it('une section vide reste vide', () => {
    expect(splitSections([req('n')], NOW)).toEqual({ priority: [], others: [req('n')] });
    expect(splitSections([], NOW)).toEqual({ priority: [], others: [] });
  });
});

describe('primaryAction', () => {
  it('« Valider » dans l’onglet À valider, « Corriger » pour À corriger, sinon « Ouvrir »', () => {
    expect(primaryAction('a-valider', 'PENDING_ADMIN_VALIDATION')).toBe('validate');
    expect(primaryAction('recues', 'TO_CORRECT')).toBe('correct');
    expect(primaryAction('envoyees', 'SENT')).toBe('open');
    expect(primaryAction('suivi', 'PENDING_ADMIN_VALIDATION')).toBe('open');
  });
});

describe('defaultTabKey', () => {
  it('À valider s’il contient des demandes, sinon Reçues', () => {
    expect(defaultTabKey(2)).toBe('a-valider');
    expect(defaultTabKey(0)).toBe('recues');
  });
});
