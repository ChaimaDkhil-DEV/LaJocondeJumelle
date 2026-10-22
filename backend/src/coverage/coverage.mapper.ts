import type { Prisma, RequestStatus } from '@prisma/client';
import { readCoverageRules } from './coverage-access.loader';
import type { ModifiableField } from './domain/coverage-modification';
import type { CoverageView } from './domain/coverage-policy';
import { slotsOverlap } from './domain/coverage-policy';
import { ACTIVE_GUARD_STATUSES, type CoverageAction } from './domain/coverage-state-machine';
import { coverageMainStatus, type DerivedStatus } from './domain/coverage-status';

/** Relations chargées pour les vues des affectations. */
export const COVERAGE_INCLUDE = {
  category: { select: { id: true, name: true } },
  requester: { select: { id: true, displayName: true } },
  assignee: {
    select: {
      id: true,
      displayName: true,
      // Affectations actives et renforts du surveillant : alerte « double affectation » (FR-015j).
      requestsAssigned: {
        where: { kind: 'COVERAGE', status: { in: [...ACTIVE_GUARD_STATUSES] } },
        select: { id: true, coverage: { select: { startAt: true, plannedEndAt: true } } },
      },
      coverageSupports: {
        where: { releasedAt: null, request: { status: { in: [...ACTIVE_GUARD_STATUSES] } } },
        select: { requestId: true, request: { select: { coverage: { select: { startAt: true, plannedEndAt: true } } } } },
      },
    },
  },
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
  // Proposition de rattachement en suspens : « doublon possible » (FR-015h).
  mergeSources: { where: { status: 'PENDING' }, select: { id: true } },
  mergeTargets: { where: { status: 'PENDING' }, select: { id: true } },
} satisfies Prisma.RequestInclude;

export type CoverageRow = Prisma.RequestGetPayload<{ include: typeof COVERAGE_INCLUDE }>;

/** Statut principal et sous-état (R1) ; une garde non migrée (BROADCAST) est présentée « en attente ». */
export function derivedStatus(status: RequestStatus): DerivedStatus {
  return status === 'BROADCAST' ? { mainStatus: 'PENDING', subState: null } : coverageMainStatus(status);
}

/** Le surveillant affecté a une autre affectation active, ou un renfort, sur une plage qui chevauche (FR-015j). */
function doubleAssignment(row: Pick<CoverageRow, 'id' | 'status' | 'assignee' | 'coverage'>): boolean {
  const slot = row.coverage;
  if (!row.assignee || !slot || !ACTIVE_GUARD_STATUSES.includes(row.status as (typeof ACTIVE_GUARD_STATUSES)[number])) return false;
  const guards = row.assignee.requestsAssigned.filter((g) => g.id !== row.id && g.coverage);
  const supports = row.assignee.coverageSupports.filter((s) => s.requestId !== row.id && s.request.coverage);
  return guards.some((g) => slotsOverlap(slot, g.coverage!)) || supports.some((s) => slotsOverlap(slot, s.request.coverage!));
}

/**
 * Alertes affichées en tête de liste : délai de prise en charge expiré sur une demande en attente
 * (FR-011e), surveillant avec deux affectations actives (FR-015j), doublon possible (FR-015h).
 */
export function coverageAlerts(row: Pick<CoverageRow, 'id' | 'status' | 'reminders' | 'assignee' | 'coverage' | 'mergeSources' | 'mergeTargets'>): string[] {
  const alerts: string[] = [];
  if (row.status === 'PENDING' && row.reminders.length > 0) alerts.push('TAKEOVER_EXPIRED');
  if (doubleAssignment(row)) alerts.push('DOUBLE_ASSIGNMENT');
  if (row.mergeSources.length + row.mergeTargets.length > 0) alerts.push('POSSIBLE_DUPLICATE');
  return alerts;
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
    assignee: row.assignee && { id: row.assignee.id, displayName: row.assignee.displayName },
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
    /** Champs modifiables par l'admin (spec 006) ; vide pour les autres vues. */
    modifiableFields: ModifiableField[];
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
    modifiableFields: extras.modifiableFields,
    isManager: extras.view === 'ADMIN',
    presences: extras.presences,
    history: extras.history,
  };
}

export type CoverageDetail = ReturnType<typeof toCoverageDetail>;
