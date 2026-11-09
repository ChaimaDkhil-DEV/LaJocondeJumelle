import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import { t } from '../../i18n';

/** Communication enseignant / parents (015) : types et appels de l'API. */

export type CommunicationStatus =
  | 'DRAFT'
  | 'PENDING_ADMIN_VALIDATION'
  | 'RETURNED_FOR_CORRECTION'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';
export type CommunicationEventType =
  'CREATED' | 'UPDATED' | 'SUBMITTED' | 'APPROVED' | 'RETURNED' | 'REJECTED' | 'CANCELLED' | 'READ';
export type DeliveryStatus =
  'PENDING' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'RETRYING';
export type Decision = 'APPROVE' | 'RETURN' | 'REJECT';

interface Person {
  id: string;
  displayName: string;
}
export interface GuardianRef {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string | null;
}
export interface StudentRef {
  id: string;
  firstName: string;
  lastName: string;
  class: { id: string; name: string };
}

export interface CommunicationSummary {
  id: string;
  status: CommunicationStatus;
  version: number;
  currentRevision: number;
  approvedRevision: number | null;
  decisionReason: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  updatedAt: string;
  teacher: Person;
  student: StudentRef;
  guardian: GuardianRef;
}

export interface Revision {
  number: number;
  text: string;
  voiceFileId: string;
  durationSeconds: number | null;
  createdAt: string;
}

export interface CommunicationDetail extends CommunicationSummary {
  readAt: string | null;
  createdAt: string;
  decidedBy: Person | null;
  /** Vue enseignant seulement : copie de travail. */
  draft: {
    text: string | null;
    voice: { id: string; durationSeconds: number | null } | null;
  } | null;
  revisions: Revision[];
  events: Array<{
    type: CommunicationEventType;
    actor: Person | null;
    revision: number | null;
    reason: string | null;
    createdAt: string;
  }>;
  deliveries: Array<{
    channel: 'EMAIL' | 'WHATSAPP';
    status: DeliveryStatus;
    attempts: number;
    updatedAt: string;
  }>;
}

export interface TeacherStudent extends StudentRef {
  guardians: GuardianRef[];
}

export interface ParentMessage {
  id: string;
  teacher: { displayName: string };
  student: { firstName: string; lastName: string };
  approvedAt: string;
  read: boolean;
}

export interface ParentMessageDetail {
  id: string;
  teacher: { displayName: string };
  student: { firstName: string; lastName: string };
  text: string;
  voiceFileId: string;
  durationSeconds: number | null;
  approvedAt: string;
  readAt: string | null;
}

export interface Guardian {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  account: { id: string; username: string; active: boolean } | null;
  students: Array<{
    id: string;
    firstName: string;
    lastName: string;
    active: boolean;
    class: { id: string; name: string };
  }>;
}

export interface GuardianInput {
  firstName: string;
  lastName: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  studentIds: string[];
}

export const STATUS_LABELS: Record<CommunicationStatus, string> = {
  DRAFT: t('Brouillon'),
  PENDING_ADMIN_VALIDATION: t('En attente de validation'),
  RETURNED_FOR_CORRECTION: t('Retournée pour correction'),
  APPROVED: t('Approuvée et publiée'),
  REJECTED: t('Rejetée'),
  CANCELLED: t('Annulée'),
};

export const EVENT_LABELS: Record<CommunicationEventType, string> = {
  CREATED: t('Brouillon créé'),
  UPDATED: t('Brouillon modifié'),
  SUBMITTED: t('Soumise à l’administration'),
  APPROVED: t('Approuvée et publiée'),
  RETURNED: t('Retournée pour correction'),
  REJECTED: t('Rejetée'),
  CANCELLED: t('Annulée'),
  READ: t('Lue par le parent'),
};

export const DELIVERY_LABELS: Record<DeliveryStatus, string> = {
  PENDING: t('En attente'),
  PROCESSING: t('En cours d’envoi'),
  SENT: t('Envoyé'),
  DELIVERED: t('Remis'),
  FAILED: t('Échec'),
  RETRYING: t('Nouvel essai'),
};

export const CHANNEL_LABELS = { EMAIL: t('E-mail'), WHATSAPP: t('WhatsApp') } as const;

export const fullName = (p: { firstName: string; lastName: string }) =>
  `${p.firstName} ${p.lastName}`;

export const commKeys = {
  all: ['parent-communications'] as const,
  students: ['parent-communications', 'students'] as const,
  mine: ['parent-communications', 'mine'] as const,
  one: (id: string) => ['parent-communications', 'one', id] as const,
  validation: (qs: string) => ['parent-communications', 'validation', qs] as const,
  validationOne: (id: string) => ['parent-communications', 'validation-one', id] as const,
  parent: ['parent-communications', 'parent'] as const,
  parentOne: (id: string) => ['parent-communications', 'parent', id] as const,
  guardians: ['parent-communications', 'guardians'] as const,
  teacherClasses: ['parent-communications', 'teacher-classes'] as const,
};

// ------------------------------------------------------------------ Enseignant

export function useTeacherStudents() {
  return useQuery({
    queryKey: commKeys.students,
    queryFn: () => apiFetch<TeacherStudent[]>('/api/parent-communications/students'),
  });
}

export function useMyCommunications() {
  return useQuery({
    queryKey: commKeys.mine,
    queryFn: () => apiFetch<CommunicationSummary[]>('/api/parent-communications'),
  });
}

export function useMyCommunication(id: string | undefined) {
  return useQuery({
    queryKey: commKeys.one(id ?? ''),
    queryFn: () => apiFetch<CommunicationDetail>(`/api/parent-communications/${id}`),
    enabled: Boolean(id),
  });
}

export function useCommunicationMutations() {
  const queryClient = useQueryClient();
  const settle = (detail: CommunicationDetail) => {
    queryClient.setQueryData(commKeys.one(detail.id), detail);
    void queryClient.invalidateQueries({ queryKey: commKeys.mine });
  };
  return {
    create: useMutation({
      mutationFn: (body: {
        studentId: string;
        guardianId: string;
        text: string | null;
        voiceFileId: string | null;
      }) => apiFetch<CommunicationDetail>('/api/parent-communications', { method: 'POST', body }),
      onSuccess: settle,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        ...body
      }: {
        id: string;
        version: number;
        text?: string | null;
        voiceFileId?: string | null;
        guardianId?: string;
      }) =>
        apiFetch<CommunicationDetail>(`/api/parent-communications/${id}`, {
          method: 'PATCH',
          body,
        }),
      onSuccess: settle,
    }),
    submit: useMutation({
      mutationFn: ({ id, version }: { id: string; version: number }) =>
        apiFetch<CommunicationDetail>(`/api/parent-communications/${id}/submit`, {
          method: 'POST',
          body: { version },
        }),
      onSuccess: settle,
    }),
    cancel: useMutation({
      mutationFn: ({ id, version }: { id: string; version: number }) =>
        apiFetch<CommunicationDetail>(`/api/parent-communications/${id}/cancel`, {
          method: 'POST',
          body: { version },
        }),
      onSuccess: settle,
    }),
  };
}

// ------------------------------------------------------------------ Validation

export function useValidationList(qs: string) {
  return useQuery({
    queryKey: commKeys.validation(qs),
    queryFn: () => apiFetch<CommunicationSummary[]>(`/api/admin/parent-communications?${qs}`),
  });
}

export function useValidationDetail(id: string) {
  return useQuery({
    queryKey: commKeys.validationOne(id),
    queryFn: () => apiFetch<CommunicationDetail>(`/api/admin/parent-communications/${id}`),
  });
}

export function useDecision(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { action: Decision; revision: number; version: number; reason?: string }) =>
      apiFetch<CommunicationDetail>(`/api/admin/parent-communications/${id}/decision`, {
        method: 'POST',
        body,
      }),
    onSuccess: (detail) => {
      queryClient.setQueryData(commKeys.validationOne(id), detail);
      void queryClient.invalidateQueries({ queryKey: ['parent-communications', 'validation'] });
    },
  });
}

// ------------------------------------------------------------------ Parent

export function useParentMessages() {
  return useQuery({
    queryKey: commKeys.parent,
    queryFn: () => apiFetch<ParentMessage[]>('/api/parent/messages'),
  });
}

export function useParentMessage(id: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: commKeys.parentOne(id),
    queryFn: async () => {
      const message = await apiFetch<ParentMessageDetail>(`/api/parent/messages/${id}`);
      // La lecture est notée par le serveur : la liste affichera « Lu ».
      void queryClient.invalidateQueries({ queryKey: commKeys.parent, exact: true });
      return message;
    },
  });
}

// ------------------------------------------------------------------ Administration

export function useGuardians() {
  return useQuery({
    queryKey: commKeys.guardians,
    queryFn: () => apiFetch<Guardian[]>('/api/admin/guardians'),
  });
}

export function useGuardianMutations() {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: commKeys.guardians });
  return {
    save: useMutation({
      mutationFn: ({ id, ...body }: GuardianInput & { id?: string; active?: boolean }) =>
        apiFetch<Guardian>(id ? `/api/admin/guardians/${id}` : '/api/admin/guardians', {
          method: id ? 'PATCH' : 'POST',
          body,
        }),
      onSuccess: refresh,
    }),
    account: useMutation({
      mutationFn: ({ id, username }: { id: string; username: string }) =>
        apiFetch<{ guardian: Guardian; temporaryPassword: string }>(
          `/api/admin/guardians/${id}/account`,
          { method: 'POST', body: { username } },
        ),
      onSuccess: refresh,
    }),
  };
}

export function useTeacherClasses() {
  return useQuery({
    queryKey: commKeys.teacherClasses,
    queryFn: () =>
      apiFetch<Array<{ teacher: Person; classIds: string[] }>>('/api/admin/teacher-classes'),
  });
}

export function useSetTeacherClasses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teacherId, classIds }: { teacherId: string; classIds: string[] }) =>
      apiFetch<{ teacherId: string; classIds: string[] }>(
        `/api/admin/teacher-classes/${teacherId}`,
        { method: 'PUT', body: { classIds } },
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: commKeys.teacherClasses }),
  });
}
