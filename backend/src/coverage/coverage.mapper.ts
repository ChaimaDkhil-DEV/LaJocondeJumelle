import type { Prisma, RequestStatus } from '@prisma/client';
import { readCoverageRules } from './coverage-access.loader';
import type { CoverageView } from './domain/coverage-policy';
import type { CoverageAction } from './domain/coverage-state-machine';
import { coverageMainStatus, type DerivedStatus } from './domain/coverage-status';

/** Relations chargées pour les vues des affectations. */
export const COVERAGE_INCLUDE = {
  category: { select: { id: true, name: true } },
  requester: { select: { id: true, displayName: true } },
  assignee: { select: { id: true, displayName: true } },
  voiceFile: { select: { id: true, durationSeconds: true } },
  coverage: {
    include: {
      class: { select: { id: true, name: true, room: true } },
      floor: { select: { id: true, name: true } },
      teacher: { select: { id: true, displayName: true } },
    },
  },
  supports: {
    where: { releasedAt: null },
    select: { id: true, joinedAt: true, user: { select: { id: true, displayName: true } } },
    orderBy: { joinedAt: 'asc' },
  },
  // Délai de prise en charge expiré (alerte envoyée) : la demande est affichée en priorité (FR-011e).
  reminders: { where: { kind: 'TAKEOVER', resolution: 'SENT' }, select: { id: true } },
} satisfies Prisma.RequestInclude;

export type CoverageRow = Prisma.RequestGetPayload<{ include: typeof COVERAGE_INCLUDE }>;

/** Statut principal et sous-état (R1) ; une garde non migrée (BROADCAST) est présentée « en attente ». */
export function derivedStatus(status: RequestStatus): DerivedStatus {
  return status === 'BROADCAST' ? { mainStatus: 'PENDING', subState: null } : coverageMainStatus(status);
}

/** Alertes affichées en tête de liste : délai de prise en charge expiré sur une demande en attente. */
export function coverageAlerts(row: Pick<CoverageRow, 'status' | 'reminders'>): string[] {
  return row.status === 'PENDING' && row.reminders.length > 0 ? ['TAKEOVER_EXPIRED'] : [];
}

export function toCoverageSummary(row: CoverageRow) {
  const c = row.coverage!;
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    ...derivedStatus(row.status),
    source: c.source,
    type: c.type,
    priority: row.priority,
    version: row.version,
    category: row.category,
    class: c.class,
    floor: c.floor,
    teacher: c.teacher,
    absentTeacher: c.absentTeacher,
    startAt: c.startAt,
    estimatedMinutes: c.estimatedMinutes,
    plannedEndAt: c.plannedEndAt,
    requester: row.requester,
    assignee: row.assignee,
    supports: row.supports.map((s) => ({ id: s.id, user: s.user, joinedAt: s.joinedAt })),
    alerts: coverageAlerts(row),
    reliefForId: c.reliefForId,
    mergedIntoId: c.mergedIntoId,
    hasVoice: row.voiceFileId !== null,
    hasNote: Boolean(row.description),
    currentStage: row.currentStage,
    currentDueAt: row.currentDueAt,
    overdueStage: row.overdueStage,
    extensionCount: c.extensionCount,
    durationMinutes: c.durationMinutes,
    timestamps: {
      createdAt: row.createdAt,
      acceptedAt: row.acceptedAt,
      departedAt: c.departedAt,
      presenceAt: c.presenceAt,
      relievedAt: c.relievedAt,
      closedAt: row.closedAt,
      cancelledAt: row.cancelledAt,
    },
  };
}

export type CoverageSummary = ReturnType<typeof toCoverageSummary>;

export interface PresenceView {
  method: 'PHOTO' | 'QR';
  at: Date;
  by: { id: string; displayName: string };
  /** Présent seulement pour les personnes autorisées à voir la photo de preuve. */
  fileId: string | null;
}

export interface HistoryEntry {
  id: string;
  type: string;
  actor: { id: string; displayName: string } | null;
  fromValue: Prisma.JsonValue | null;
  toValue: Prisma.JsonValue | null;
  comment: string | null;
  createdAt: Date;
}

/**
 * Détail selon l'acteur (contracts/rest-api.md `GET /coverage/:id`) : admin complète (dont le motif) ;
 * surveillant affecté ou en renfort sans le motif (FR-023c) ; enseignant auteur : sa demande, sans
 * l'historique des autres acteurs.
 */
export function toCoverageDetail(
  row: CoverageRow,
  extras: {
    view: CoverageView;
    allowedActions: CoverageAction[];
    presences: PresenceView[];
    history: HistoryEntry[] | null;
  },
) {
  const rules = readCoverageRules(row);
  const c = row.coverage!;
  return {
    ...toCoverageSummary(row),
    view: extras.view,
    /** Motif détaillé : admin, super administrateur et enseignant auteur seulement. */
    reason: extras.view === 'SUPERVISOR' ? null : c.reason,
    note: row.description,
    voice: row.voiceFile ? { fileId: row.voiceFile.id, durationSeconds: Number(row.voiceFile.durationSeconds) } : null,
    proofMode: rules.proofMode,
    finalValidation: rules.finalValidation,
    cancelReason: c.cancelReason,
    allowedActions: extras.allowedActions,
    isManager: extras.view === 'ADMIN',
    presences: extras.presences,
    history: extras.history,
  };
}

export type CoverageDetail = ReturnType<typeof toCoverageDetail>;
