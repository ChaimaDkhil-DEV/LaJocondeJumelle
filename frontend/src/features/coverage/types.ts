import type { Priority } from '../../api/types';

/**
 * Statuts techniques d'une affectation (machine à états côté serveur). BROADCAST n'est plus posé
 * depuis 004 (migré vers PENDING) mais reste dans l'énumération du serveur.
 */
export type CoverageStatus =
  | 'PENDING'
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

/** Statut principal (R1, FR-008) : filtres, statistiques et alertes s'y fondent. */
export type MainStatus = 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED' | 'UNFILLED';
/** Sous-état affiché en badge (FR-008c). */
export type SubState = 'EN_ROUTE' | 'LATE' | 'RELIEF_PENDING' | 'CLOSED';

export type CoverageSource = 'TEACHER_REQUEST' | 'SUPERVISOR_REPORT' | 'ADMIN_DIRECT';
export type CoverageType = 'LATENESS' | 'ABSENCE' | 'EMPTY_CLASS';

/** Actions proposées par le serveur (`allowedActions`) ; la diffusion et le désistement n'existent plus. */
export type CoverageAction =
  | 'ASSIGN'
  | 'REASSIGN'
  | 'UPDATE'
  | 'WITHDRAW'
  | 'DEPART'
  | 'CONFIRM_PRESENCE'
  | 'REQUEST_RELIEF'
  | 'RELEASE_BY_MANAGER'
  | 'RELIEVE'
  | 'EXTEND'
  | 'VALIDATE'
  | 'CANCEL'
  | 'SET_TEACHER'
  | 'RELEASE_SUPPORT';

export type ProofMode = 'PHOTO' | 'QR' | 'BOTH';
export type Availability = 'AVAILABLE' | 'UNAVAILABLE' | 'ABSENT';
export type UnavailableReason = 'INACTIVE' | 'ABSENT' | 'UNAVAILABLE' | 'ON_GUARD' | 'SUPPORT';
export type CoverageStage = 'TAKEOVER' | 'ARRIVAL';
/** Vue de l'affectation selon l'acteur : admin (complète), surveillant (sans motif), enseignant auteur. */
export type CoverageView = 'ADMIN' | 'SUPERVISOR' | 'TEACHER';

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

export interface CoverageSupport {
  id: string;
  user: Person;
  joinedAt: string;
}

export interface CoverageSummary {
  id: string;
  reference: string;
  status: CoverageStatus;
  mainStatus: MainStatus;
  subState: SubState | null;
  source: CoverageSource | null;
  type: CoverageType | null;
  priority: Priority;
  version: number;
  category: Named;
  class: SchoolClass;
  floor: Named | null;
  teacher: Person | null;
  /** Texte libre des gardes antérieures à 004. */
  absentTeacher: string | null;
  startAt: string;
  estimatedMinutes: number | null;
  plannedEndAt: string | null;
  requester: Person;
  assignee: Person | null;
  supports: CoverageSupport[];
  /** `TAKEOVER_EXPIRED` : demande en attente dont le délai de prise en charge a expiré (FR-011e). */
  alerts: string[];
  reliefForId: string | null;
  mergedIntoId: string | null;
  hasVoice: boolean;
  hasNote: boolean;
  currentStage: CoverageStage | null;
  currentDueAt: string | null;
  overdueStage: CoverageStage | null;
  extensionCount: number;
  durationMinutes: number | null;
  timestamps: {
    createdAt: string;
    acceptedAt: string | null;
    departedAt: string | null;
    presenceAt: string | null;
    relievedAt: string | null;
    closedAt: string | null;
    cancelledAt: string | null;
  };
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
  view: CoverageView;
  /** Motif détaillé : admin et enseignant auteur seulement (null pour le surveillant). */
  reason: string | null;
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

export interface CoverageProfile {
  availability: Availability;
  activeGuards: Array<{ requestId: string; startAt: string; plannedEndAt: string | null }>;
  isTeacher: boolean;
  isSupervisor: boolean;
  /** Membre du groupe Surveillants. */
  inGroup: boolean;
  /** Admin ou super administrateur. */
  canManage: boolean;
}

export interface Candidate {
  id: string;
  displayName: string;
  jobTitle: string | null;
  floor: Named | null;
  /** Rattaché à l'étage de la classe. */
  sameFloor: boolean;
  available: boolean;
  reason: UnavailableReason | null;
}

export interface TeamMember {
  id: string;
  displayName: string;
  jobTitle: string | null;
  floor: Named | null;
  availability: Availability;
  available: boolean;
  reason: UnavailableReason | null;
  guardRequestId: string | null;
}

export interface PersonalHistory {
  guards: CoverageSummary[];
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
  teacherId?: string | null;
  supportId?: string;
  minutes?: number;
  photoFileId?: string;
  qrToken?: string;
}
