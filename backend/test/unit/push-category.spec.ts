import { NotificationType, RequestKind } from '@prisma/client';
import { pushCategoryOf, pushRecipientAllowed, type PushCategory } from '../../src/push/domain/push-category';

/**
 * 014, T014 (D1, D4, NC-1, NC-2, research R3) : correspondance validée entre types de notification et
 * catégories push. Chaque valeur de l'énumération est vérifiée sur les deux natures de demande (SC-002).
 */

/** Types de garde envoyés en push, par catégorie (spec.md, « Correspondance entre types et catégories »). */
const ON_COVERAGE: Partial<Record<NotificationType, PushCategory>> = {
  ASSIGNED: 'coverage',
  COVERAGE_REQUESTED: 'coverage',
  COVERAGE_EMPTY_CLASS: 'coverage',
  COVERAGE_LIFTED: 'coverage',
  COVERAGE_UPDATED: 'coverage',
  COVERAGE_EXTENDED: 'coverage',
  COVERAGE_RELIEF_REQUESTED: 'coverage',
  COVERAGE_LATE: 'coverage',
  COVERAGE_DOUBLE_ASSIGNMENT: 'coverage',
  COVERAGE_SUPPORT_REMINDER: 'coverage',
  COVERAGE_TAKEOVER_EXPIRED: 'unfilled',
  COVERAGE_ESCALATED: 'unfilled',
  COVERAGE_UNFILLED: 'unfilled',
  COVERAGE_TEACHER_ARRIVED: 'attendance',
  COVERAGE_ATTENDANCE_ANOMALY: 'attendance',
};

/** Demandes de travail : seul le type URGENT part en push (NC-1). */
const ON_WORK: Partial<Record<NotificationType, PushCategory>> = { URGENT: 'urgent' };

const ALL_TYPES = Object.values(NotificationType);

describe('pushCategoryOf', () => {
  it.each(ALL_TYPES)('%s sur une garde', (type) => {
    expect(pushCategoryOf(type, RequestKind.COVERAGE)).toBe(ON_COVERAGE[type] ?? null);
  });

  it.each(ALL_TYPES)('%s sur une demande de travail', (type) => {
    expect(pushCategoryOf(type, RequestKind.WORK)).toBe(ON_WORK[type] ?? null);
  });

  it('envoie exactement 16 types en push', () => {
    const pushed = new Set(
      ALL_TYPES.filter((t) => pushCategoryOf(t, RequestKind.COVERAGE) !== null || pushCategoryOf(t, RequestKind.WORK) !== null),
    );
    expect(pushed.size).toBe(16);
  });

  it('ne dépend jamais de la priorité (aucun paramètre de priorité)', () => {
    expect(pushCategoryOf.length).toBe(2);
    // Types de garde souvent créés en priorité URGENT mais sans push.
    for (const type of ['COVERAGE_PRESENCE', 'COVERAGE_DUPLICATE', 'CLOSED', 'CANCELLED', 'STATUS_CHANGED'] as const) {
      expect(pushCategoryOf(type, RequestKind.COVERAGE)).toBeNull();
    }
  });
});

describe('pushRecipientAllowed (D4)', () => {
  it('« Enseignant arrivé » ne part qu’au surveillant affecté', () => {
    expect(pushRecipientAllowed('COVERAGE_TEACHER_ARRIVED', 'a', 'a')).toBe(true);
    expect(pushRecipientAllowed('COVERAGE_TEACHER_ARRIVED', 'a', 'b')).toBe(false);
    expect(pushRecipientAllowed('COVERAGE_TEACHER_ARRIVED', 'a', null)).toBe(false);
  });

  it.each(ALL_TYPES.filter((t) => t !== 'COVERAGE_TEACHER_ARRIVED'))('%s : aucun filtre de destinataire', (type) => {
    expect(pushRecipientAllowed(type, 'a', 'b')).toBe(true);
    expect(pushRecipientAllowed(type, 'a', null)).toBe(true);
  });
});
