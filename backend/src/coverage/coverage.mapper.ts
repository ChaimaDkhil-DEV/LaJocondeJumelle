import type { Prisma } from '@prisma/client';
import { readCoverageRules } from './coverage-access.loader';
import type { CoverageAction } from './domain/coverage-state-machine';

/** Relations chargées pour les vues des couvertures. */
export const COVERAGE_INCLUDE = {
  category: { select: { id: true, name: true } },
  requester: { select: { id: true, displayName: true } },
  assignee: { select: { id: true, displayName: true } },
  voiceFile: { select: { id: true, durationSeconds: true } },
  coverage: {
    include: {
      class: { select: { id: true, name: true, room: true } },
      targets: { include: { group: { select: { id: true, name: true } } }, orderBy: { addedAt: 'asc' } },
    },
  },
} satisfies Prisma.RequestInclude;

export type CoverageRow = Prisma.RequestGetPayload<{ include: typeof COVERAGE_INCLUDE }>;

export function toCoverageSummary(row: CoverageRow) {
  const c = row.coverage!;
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    priority: row.priority,
    version: row.version,
    category: row.category,
    class: c.class,
    absentTeacher: c.absentTeacher,
    startAt: c.startAt,
    estimatedMinutes: c.estimatedMinutes,
    plannedEndAt: c.plannedEndAt,
    groups: c.targets.map((t) => t.group),
    requester: row.requester,
    assignee: row.assignee,
    reliefForId: c.reliefForId,
    hasVoice: row.voiceFileId !== null,
    hasNote: Boolean(row.description),
    currentStage: row.currentStage,
    currentDueAt: row.currentDueAt,
    overdueStage: row.overdueStage,
    releaseCount: c.releaseCount,
    extensionCount: c.extensionCount,
    durationMinutes: c.durationMinutes,
    timestamps: {
      createdAt: row.createdAt,
      broadcastAt: c.broadcastAt,
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

export function toCoverageDetail(
  row: CoverageRow,
  extras: {
    allowedActions: CoverageAction[];
    isManager: boolean;
    presences: PresenceView[];
    history: HistoryEntry[] | null;
  },
) {
  const rules = readCoverageRules(row);
  return {
    ...toCoverageSummary(row),
    limited: false as const,
    note: row.description,
    voice: row.voiceFile
      ? { fileId: row.voiceFile.id, durationSeconds: Number(row.voiceFile.durationSeconds) }
      : null,
    proofMode: rules.proofMode,
    finalValidation: rules.finalValidation,
    cancelReason: row.coverage!.cancelReason,
    allowedActions: extras.allowedActions,
    isManager: extras.isManager,
    presences: extras.presences,
    history: extras.history,
  };
}

export type CoverageDetail = ReturnType<typeof toCoverageDetail>;

/** Vue réduite pour un membre du groupe une fois la garde prise : « Déjà prise par [nom] », sans détail. */
export function toLimitedCoverage(row: Pick<CoverageRow, 'id' | 'reference' | 'status' | 'assignee'>) {
  return {
    id: row.id,
    reference: row.reference,
    limited: true as const,
    takenBy: row.assignee?.displayName ?? null,
    finished: row.status === 'CLOSED' || row.status === 'CANCELLED' || row.status === 'DONE',
  };
}

export type LimitedCoverage = ReturnType<typeof toLimitedCoverage>;
