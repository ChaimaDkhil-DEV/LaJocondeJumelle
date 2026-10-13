import type { Priority, RequestStatus } from '../../api/types';

export type Circuit = 'A_DIRECT' | 'B_ADMIN_VALIDATION';
export type DeadlineStage = 'VALIDATION' | 'TAKEOVER' | 'COMPLETION';

export interface CategoryOption {
  id: string;
  name: string;
  circuit: Circuit;
  photoRequired: boolean;
}

export interface RecipientOption {
  id: string;
  displayName: string;
  jobTitle: string | null;
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
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type RequestScope = 'mine' | 'assigned' | 'managed' | 'all';
