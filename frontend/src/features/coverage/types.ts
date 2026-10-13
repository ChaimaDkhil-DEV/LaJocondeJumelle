import type { Priority } from '../../api/types';

/** Statuts d'une couverture de classe (machine à états côté serveur). */
export type CoverageStatus =
  | 'BROADCAST'
  | 'UNFILLED'
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'LATE'
  | 'ON_DUTY'
  | 'RELIEF_PENDING'
  | 'DONE'
  | 'CLOSED'
  | 'CANCELLED';

export type CoverageAction =
  | 'ACCEPT'
  | 'ASSIGN'
  | 'REASSIGN'
  | 'WIDEN'
  | 'DEPART'
  | 'CONFIRM_PRESENCE'
  | 'RELEASE'
  | 'REQUEST_RELIEF'
  | 'RELEASE_BY_MANAGER'
  | 'RELIEVE'
  | 'EXTEND'
  | 'VALIDATE'
  | 'CANCEL';

export type ProofMode = 'PHOTO' | 'QR' | 'BOTH';
export type Availability = 'AVAILABLE' | 'UNAVAILABLE' | 'ABSENT';
export type UnavailableReason = 'INACTIVE' | 'ABSENT' | 'UNAVAILABLE' | 'ON_GUARD';
export type CoverageStage = 'TAKEOVER' | 'ARRIVAL';

export interface Named {
  id: string;
  name: string;
}

export interface Person {
  id: string;
  displayName: string;
}

export interface SchoolClass {
  id: string;
  name: string;
  room: string | null;
}

export interface CoverageSummary {
  id: string;
  reference: string;
  status: CoverageStatus;
  priority: Priority;
  version: number;
  category: Named;
  class: SchoolClass;
  absentTeacher: string | null;
  startAt: string;
  estimatedMinutes: number | null;
  plannedEndAt: string | null;
  groups: Named[];
  requester: Person;
  assignee: Person | null;
  reliefForId: string | null;
  hasVoice: boolean;
  hasNote: boolean;
  currentStage: CoverageStage | null;
  currentDueAt: string | null;
  overdueStage: CoverageStage | null;
  releaseCount: number;
  extensionCount: number;
  durationMinutes: number | null;
  timestamps: {
    createdAt: string;
    broadcastAt: string | null;
    acceptedAt: string | null;
    departedAt: string | null;
    presenceAt: string | null;
    relievedAt: string | null;
    closedAt: string | null;
    cancelledAt: string | null;
  };
}

export interface OpenCoverage extends CoverageSummary {
  canAccept: boolean;
}

export interface PresenceView {
  method: 'PHOTO' | 'QR';
  at: string;
  by: Person;
  fileId: string | null;
}

export interface CoverageHistoryEntry {
  id: string;
  type: string;
  actor: Person | null;
  fromValue: Record<string, unknown> | null;
  toValue: Record<string, unknown> | null;
  comment: string | null;
  createdAt: string;
}

export interface CoverageDetail extends CoverageSummary {
  limited: false;
  note: string | null;
  voice: { fileId: string; durationSeconds: number } | null;
  proofMode: ProofMode;
  finalValidation: boolean;
  cancelReason: string | null;
  allowedActions: CoverageAction[];
  isManager: boolean;
  presences: PresenceView[];
  history: CoverageHistoryEntry[] | null;
}

/** Vue d'un membre du groupe une fois la garde prise : « Déjà prise par [nom] ». */
export interface LimitedCoverage {
  id: string;
  reference: string;
  limited: true;
  takenBy: string | null;
  finished: boolean;
}

export interface CoverageProfile {
  availability: Availability;
  activeGuards: Array<{ requestId: string; startAt: string; plannedEndAt: string | null }>;
  inGroup: boolean;
  canManage: boolean;
}

export interface FormOptions {
  categories: Array<Named & { proofMode: ProofMode }>;
  classes: SchoolClass[];
  groups: Array<Named & { memberCount: number; availableCount: number }>;
}

export interface Candidate {
  id: string;
  displayName: string;
  jobTitle: string | null;
  inTargetGroup: boolean;
  available: boolean;
  reason: UnavailableReason | null;
}

export interface TeamMember {
  id: string;
  displayName: string;
  jobTitle: string | null;
  groups: Named[];
  availability: Availability;
  available: boolean;
  reason: UnavailableReason | null;
  guardRequestId: string | null;
}

export interface PersonalHistory {
  guards: CoverageSummary[];
  releases: Array<{
    id: string;
    requestId: string;
    reference: string;
    class: { name: string; room: string | null } | null;
    at: string;
    reason: string | null;
    byManager: boolean;
  }>;
}

export interface QrResolution {
  class: SchoolClass;
  coverage: CoverageSummary | null;
  otherClassGuard: boolean;
}

export interface ActionInput {
  action: CoverageAction;
  version?: number;
  reason?: string;
  assigneeId?: string;
  force?: boolean;
  groupId?: string;
  minutes?: number;
  photoFileId?: string;
  qrToken?: string;
}
