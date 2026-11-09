import type { NotificationType, RequestKind } from '@prisma/client';

/**
 * Catégories push (spec 014, D1) et correspondance validée avec les types de notification (NC-1, NC-2,
 * research R3). La catégorie dépend du type et de la nature de la demande, jamais de la priorité : les
 * notifications de garde sont souvent créées en priorité urgente sans devoir partir en push.
 */
export type PushCategory = 'urgent' | 'coverage' | 'unfilled' | 'attendance';

type Rule = Record<RequestKind, PushCategory | null>;

const NONE: Rule = { WORK: null, COVERAGE: null };
const onCoverage = (category: PushCategory): Rule => ({ WORK: null, COVERAGE: category });

/**
 * Table exhaustive : un nouveau type de notification ne compile pas tant qu'on n'a pas décidé s'il part
 * en push. Types de garde jamais émis (COVERAGE_NEW, TAKEN, ACCEPTED, RELEASED) : sans push.
 */
const RULES: Record<NotificationType, Rule> = {
  // Demandes de travail : seul URGENT part en push (NC-1).
  REQUEST_NEW: NONE,
  MESSAGE_NEW: NONE,
  ASSIGNED: onCoverage('coverage'),
  STATUS_CHANGED: NONE,
  URGENT: { WORK: 'urgent', COVERAGE: null },
  TO_CORRECT: NONE,
  REJECTED: NONE,
  CANCELLED: NONE,
  OVERDUE: NONE,
  CLOSED: NONE,
  UNASSIGNED: NONE,
  // Gardes : Couverture.
  COVERAGE_REQUESTED: onCoverage('coverage'),
  COVERAGE_EMPTY_CLASS: onCoverage('coverage'),
  COVERAGE_LIFTED: onCoverage('coverage'),
  COVERAGE_UPDATED: onCoverage('coverage'),
  COVERAGE_EXTENDED: onCoverage('coverage'),
  COVERAGE_RELIEF_REQUESTED: onCoverage('coverage'),
  COVERAGE_LATE: onCoverage('coverage'),
  COVERAGE_DOUBLE_ASSIGNMENT: onCoverage('coverage'),
  COVERAGE_SUPPORT_REMINDER: onCoverage('coverage'),
  // Gardes : Garde non pourvue.
  COVERAGE_TAKEOVER_EXPIRED: onCoverage('unfilled'),
  COVERAGE_ESCALATED: onCoverage('unfilled'),
  COVERAGE_UNFILLED: onCoverage('unfilled'),
  // Gardes : Pointage.
  COVERAGE_TEACHER_ARRIVED: onCoverage('attendance'),
  COVERAGE_ATTENDANCE_ANOMALY: onCoverage('attendance'),
  // Gardes : dans l'application seulement.
  COVERAGE_NEW: NONE,
  COVERAGE_TAKEN: NONE,
  COVERAGE_ACCEPTED: NONE,
  COVERAGE_PRESENCE: NONE,
  COVERAGE_RELEASED: NONE,
  COVERAGE_RELIEVED: NONE,
  COVERAGE_MORNING_REMINDER: NONE,
  COVERAGE_CLOSE_REMINDER: NONE,
  COVERAGE_DUPLICATE: NONE,
};

/** Catégorie push d'une notification, ou null si elle reste dans l'application. */
export function pushCategoryOf(type: NotificationType, kind: RequestKind): PushCategory | null {
  return RULES[type][kind];
}

/**
 * Filtre de destinataire propre au push (D4) : « Enseignant arrivé » ne part qu'au surveillant affecté ;
 * les administrateurs la gardent dans l'application. Aucun autre type n'est filtré.
 */
export function pushRecipientAllowed(type: NotificationType, recipientId: string, assigneeId: string | null): boolean {
  return type !== 'COVERAGE_TEACHER_ARRIVED' || recipientId === assigneeId;
}
