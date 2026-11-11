import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import { uploadFile } from '../../api/uploads';
import { t } from '../../i18n';
import type { VoiceRecording } from '../voice/VoiceRecorder';

/**
 * Communications (017) : conversations INTERNAL (enseignant ↔ administration) et PARENT (administration ↔
 * représentant), archives 015 ; types et appels de l'API (contracts/api.md).
 */

export type CommunicationStatus =
  | 'DRAFT'
  | 'PENDING_ADMIN_VALIDATION'
  | 'RETURNED_FOR_CORRECTION'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'SENT';
export type CommunicationEventType =
  | 'CREATED'
  | 'UPDATED'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'RETURNED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'READ'
  | 'SENT';
export type DeliveryStatus =
  'PENDING' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'RETRYING';
export type Decision = 'APPROVE' | 'RETURN' | 'REJECT';
export type AuthorKind = 'TEACHER' | 'PARENT' | 'ADMIN';
export type ConversationType = 'INTERNAL' | 'PARENT' | 'LEGACY_TEACHER_PARENT';
export type ConversationStatus = 'OPEN' | 'CLOSED';
export type SendMode = 'DIRECT' | 'SUBMIT' | 'FORBIDDEN';

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

export interface Message {
  id: string;
  authorKind: AuthorKind;
  /** D7 : « Administration (Prénom Nom) » pour l'enseignant, « L'école » pour le parent. */
  authorLabel: string;
  mine: boolean;
  status: CommunicationStatus;
  text: string | null;
  voice: { fileId: string; durationSeconds: number | null } | null;
  createdAt: string;
  readAt: string | null;
  /** Administration seulement. */
  validation?: {
    revision: number;
    version: number;
    decisionReason: string | null;
    decidedAt: string | null;
  };
}

export interface ConversationSummary {
  id: string;
  type: ConversationType;
  status: ConversationStatus;
  student: StudentRef;
  teacher?: Person;
  guardian?: GuardianRef;
  responsibleAdmin?: Person | null;
  linkedInternalId?: string | null;
  lastMessage: {
    at: string;
    authorKind: AuthorKind;
    authorLabel: string;
    hasVoice: boolean;
    excerpt: string | null;
  } | null;
  unread: number;
  createdAt: string;
  lastMessageAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: Message[];
  canPost: boolean;
}

export interface Recipients {
  student: StudentRef;
  teachers: Person[];
  guardians: Array<GuardianRef & { hasActiveAccount: boolean }>;
}

export interface ValidationItem {
  id: string;
  status: CommunicationStatus;
  author: Person | null;
  mine: boolean;
  decidable: boolean;
  conversation: {
    id: string;
    type: ConversationType;
    status: ConversationStatus;
    student: StudentRef;
    guardian: GuardianRef | null;
    teacher: Person | null;
  };
  submittedAt: string | null;
  validation: {
    revision: number;
    version: number;
    decisionReason: string | null;
    decidedAt: string | null;
  };
  hasVoice: boolean;
  excerpt: string | null;
}

export interface ValidationDetail extends Omit<ValidationItem, 'hasVoice' | 'excerpt'> {
  authorKind: AuthorKind;
  text: string | null;
  voice: Message['voice'];
  revisions: Array<{
    number: number;
    text: string | null;
    voiceFileId: string | null;
    durationSeconds: number | null;
    createdAt: string;
  }>;
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
  RETURNED_FOR_CORRECTION: t('Renvoyé pour correction'),
  APPROVED: t('Validé et transmis'),
  REJECTED: t('Rejeté'),
  CANCELLED: t('Annulé'),
  SENT: t('Envoyé'),
};

export const EVENT_LABELS: Record<CommunicationEventType, string> = {
  CREATED: t('Brouillon créé'),
  UPDATED: t('Message corrigé'),
  SUBMITTED: t('Soumis à la validation'),
  APPROVED: t('Validé et transmis'),
  RETURNED: t('Renvoyé pour correction'),
  REJECTED: t('Rejeté'),
  CANCELLED: t('Annulé'),
  READ: t('Lu'),
  SENT: t('Envoyé'),
};

export const TYPE_LABELS: Record<ConversationType, string> = {
  INTERNAL: t('Interne'),
  PARENT: t('Famille'),
  LEGACY_TEACHER_PARENT: t('Archive'),
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
  all: ['communications'] as const,
  teacherStudents: ['communications', 'teacher-students'] as const,
  list: (scope: 'teacher' | 'parent' | 'inbox' | 'admin', filters: object = {}) =>
    ['communications', 'list', scope, filters] as const,
  conversation: (scope: string, id: string) =>
    ['communications', 'conversation', scope, id] as const,
  parentChildren: ['communications', 'parent-children'] as const,
  recipients: (studentId: string) => ['communications', 'recipients', studentId] as const,
  sendMode: ['communications', 'send-mode'] as const,
  toValidate: ['communications', 'to-validate'] as const,
  validation: (id: string) => ['communications', 'validation', id] as const,
  guardians: ['communications', 'guardians'] as const,
  teacherClasses: ['communications', 'teacher-classes'] as const,
};

/** Espace de l'utilisateur : chaque espace a ses routes, le serveur vérifie chaque accès. */
export type Space = 'teacher' | 'parent' | 'admin';
const BASE: Record<Space, string> = {
  teacher: '/api/communications/teacher',
  parent: '/api/parent/messages',
  admin: '/api/admin/communications',
};

/** Contenu d'un message : le vocal enregistré est d'abord téléversé. */
export interface MessageInput {
  text: string;
  recording: VoiceRecording | null;
}

async function toBody(
  input: MessageInput,
): Promise<{ text: string | null; voiceFileId: string | null }> {
  const extension = input.recording?.mimeType.includes('mp4') ? 'm4a' : 'webm';
  const voice = input.recording
    ? await uploadFile('VOICE', input.recording.blob, `vocal.${extension}`)
    : null;
  return { text: input.text.trim() || null, voiceFileId: voice?.id ?? null };
}

// ------------------------------------------------------------------ Lecture

export function useConversations(space: Space, filters: Record<string, string | undefined> = {}) {
  const entries = Object.entries(filters).filter((e): e is [string, string] => Boolean(e[1]));
  const qs = new URLSearchParams(entries).toString();
  return useQuery({
    queryKey: commKeys.list(space, filters),
    queryFn: async () => {
      if (space !== 'admin') return apiFetch<ConversationSummary[]>(`${BASE[space]}/conversations`);
      const page = await apiFetch<{ items: ConversationSummary[]; nextCursor: string | null }>(
        `${BASE.admin}/conversations${qs ? `?${qs}` : ''}`,
      );
      return page.items;
    },
    placeholderData: keepPreviousData,
  });
}

export function useInbox(enabled = true) {
  return useQuery({
    queryKey: commKeys.list('inbox'),
    enabled,
    queryFn: () => apiFetch<ConversationSummary[]>(`${BASE.admin}/inbox`),
  });
}

export function useConversation(space: Space, id: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: commKeys.conversation(space, id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const detail = await apiFetch<ConversationDetail>(`${BASE[space]}/conversations/${id}`);
      // L'ouverture marque les messages lus : les listes et la cloche se mettent à jour.
      void queryClient.invalidateQueries({ queryKey: ['communications', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      return detail;
    },
  });
}

export function useTeacherStudents() {
  return useQuery({
    queryKey: commKeys.teacherStudents,
    queryFn: () => apiFetch<StudentRef[]>(`${BASE.teacher}/students`),
  });
}

export function useParentChildren() {
  return useQuery({
    queryKey: commKeys.parentChildren,
    queryFn: () => apiFetch<StudentRef[]>(`${BASE.parent}/children`),
  });
}

export function useRecipients(studentId: string | undefined) {
  return useQuery({
    queryKey: commKeys.recipients(studentId ?? ''),
    enabled: Boolean(studentId),
    queryFn: () => apiFetch<Recipients>(`${BASE.admin}/recipients?studentId=${studentId}`),
  });
}

/** Mode d'envoi aux parents et droit de valider (administration seulement). */
export function useSendMode(enabled = true) {
  return useQuery({
    queryKey: commKeys.sendMode,
    enabled,
    queryFn: () =>
      apiFetch<{ toParents: SendMode; canValidate: boolean }>(`${BASE.admin}/send-mode`),
    staleTime: 60_000,
  });
}

// ------------------------------------------------------------------ Envoi

export interface StartInput extends MessageInput {
  studentId: string;
  type?: 'INTERNAL' | 'PARENT';
  teacherId?: string;
  guardianId?: string;
  linkedInternalId?: string;
}

export function useStartConversation(space: Space) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      recording,
      text,
      studentId,
      type,
      teacherId,
      guardianId,
      linkedInternalId,
    }: StartInput) => {
      const content = await toBody({ text, recording });
      const body =
        space === 'admin'
          ? {
              type,
              studentId,
              ...(type === 'INTERNAL' ? { teacherId } : { guardianId }),
              ...(linkedInternalId ? { linkedInternalId } : {}),
              ...content,
            }
          : { studentId, ...content };
      return apiFetch<ConversationDetail>(`${BASE[space]}/conversations`, { method: 'POST', body });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commKeys.all }),
  });
}

export function usePostMessage(space: Space, conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MessageInput) =>
      apiFetch<Message>(`${BASE[space]}/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: await toBody(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commKeys.all }),
  });
}

/** Clôture, réouverture, prise en charge (administration). */
export function useConversationActions(conversationId: string) {
  const queryClient = useQueryClient();
  const done = () => queryClient.invalidateQueries({ queryKey: commKeys.all });
  const post = (action: 'close' | 'reopen') =>
    apiFetch<ConversationDetail>(`${BASE.admin}/conversations/${conversationId}/${action}`, {
      method: 'POST',
      body: {},
    });
  return {
    close: useMutation({ mutationFn: () => post('close'), onSuccess: done }),
    reopen: useMutation({ mutationFn: () => post('reopen'), onSuccess: done }),
    responsible: useMutation({
      mutationFn: (adminId: string | null) =>
        apiFetch<ConversationDetail>(`${BASE.admin}/conversations/${conversationId}/responsible`, {
          method: 'PUT',
          body: { adminId },
        }),
      onSuccess: done,
    }),
  };
}

// ------------------------------------------------------------------ « À valider »

export function useToValidate(enabled = true) {
  return useQuery({
    queryKey: commKeys.toValidate,
    enabled,
    queryFn: () => apiFetch<ValidationItem[]>(`${BASE.admin}/to-validate`),
  });
}

export function useValidationDetail(id: string | undefined) {
  return useQuery({
    queryKey: commKeys.validation(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => apiFetch<ValidationDetail>(`${BASE.admin}/messages/${id}`),
  });
}

export function useDecision(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { action: Decision; revision: number; version: number; reason?: string }) =>
      apiFetch<ValidationDetail>(`${BASE.admin}/messages/${id}/decision`, { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commKeys.all }),
  });
}

/** Correction, nouvelle soumission ou annulation d'un message renvoyé, par son auteur. */
export function useOwnMessageActions(id: string) {
  const queryClient = useQueryClient();
  const done = () => queryClient.invalidateQueries({ queryKey: commKeys.all });
  return {
    edit: useMutation({
      mutationFn: async ({ version, ...input }: MessageInput & { version: number }) =>
        apiFetch<ValidationDetail>(`${BASE.admin}/messages/${id}`, {
          method: 'PATCH',
          body: { version, ...(await toBody(input)) },
        }),
      onSuccess: done,
    }),
    submit: useMutation({
      mutationFn: (version: number) =>
        apiFetch<ValidationDetail>(`${BASE.admin}/messages/${id}/submit`, {
          method: 'POST',
          body: { version },
        }),
      onSuccess: done,
    }),
    cancel: useMutation({
      mutationFn: (version: number) =>
        apiFetch<ValidationDetail>(`${BASE.admin}/messages/${id}/cancel`, {
          method: 'POST',
          body: { version },
        }),
      onSuccess: done,
    }),
  };
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
