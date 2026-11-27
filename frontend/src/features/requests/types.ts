import type { Priority, RequestStatus } from '../../api/types';

export type Circuit = 'A_DIRECT' | 'B_ADMIN_VALIDATION';
/** VIA_ADMIN : validation par l'administration ; DIRECT : vers le service ; PEER : entre enseignants. */
export type RoutingMode = 'VIA_ADMIN' | 'DIRECT' | 'PEER';
export type DeadlineStage = 'VALIDATION' | 'TAKEOVER' | 'COMPLETION';

/** WORK : demande de travail ; COVERAGE : garde, créée dans Gardes › « Nouvelle affectation ». */
export type CategoryKind = 'WORK' | 'COVERAGE';

export interface CategoryOption {
  id: string;
  name: string;
  circuit: Circuit;
  routingMode: RoutingMode;
  photoRequired: boolean;
  kind: CategoryKind;
}

export interface RecipientOption {
  id: string;
  displayName: string;
  jobTitle: string | null;
  /** « ABSENT » : signalé au demandeur, sans bloquer l'envoi. */
  availability: 'AVAILABLE' | 'UNAVAILABLE' | 'ABSENT';
}

export interface PersonRef {
  id: string;
  displayName: string;
}

export interface RequestSummary {
  id: string;
  reference: string;
  title: string;
  category: { id: string; name: string };
  priority: Priority;
  status: RequestStatus;
  requester: PersonRef;
  assignee: PersonRef | null;
  /** Responsable administratif (018) : l'administrateur qui traite la demande ; null : demande libre. */
  adminOwner?: (PersonRef & { jobTitle: string | null }) | null;
  adminOwnedAt?: string | null;
  createdAt: string;
  currentStage: DeadlineStage | null;
  currentDueAt: string | null;
  warnAt: string | null;
  overdueStage: DeadlineStage | null;
  hasVoice: boolean;
  unreadCount: number;
}

export interface RequestDetail extends RequestSummary {
  description: string | null;
  voice: { fileId: string; durationSeconds: number } | null;
  rulesSnapshot: {
    circuit: Circuit;
    photoRequired: boolean;
    closureMode: string;
    finalValidation: boolean;
    assignmentMode?: 'MANUAL' | 'AUTO';
  };
  timestamps: Record<
    | 'createdAt'
    | 'submittedAt'
    | 'approvedAt'
    | 'rejectedAt'
    | 'assignedAt'
    | 'acceptedAt'
    | 'startedAt'
    | 'doneAt'
    | 'finalValidatedAt'
    | 'closedAt'
    | 'cancelledAt',
    string | null
  >;
  proofPhotos: Array<{ fileId: string }>;
  autoCloseAt: string | null;
  version: number;
  rejectionReason: string | null;
  allowedActions: string[];
  canWriteInThread: boolean;
  /** Responsable administratif (018) : ce que l'utilisateur connecté peut faire à ce sujet. */
  ownership?: { canClaim: boolean; canDelegate?: boolean; canAskTakeover?: boolean; pendingTransferId?: string | null };
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type RequestScope = 'mine' | 'drafts' | 'assigned' | 'managed' | 'all';
