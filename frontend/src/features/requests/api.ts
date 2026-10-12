import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ApiError, apiFetch } from '../../api/client';
import type { Priority } from '../../api/types';
import { extensionFor } from '../voice/recorderFormat';
import type { CategoryOption, Page, RecipientOption, RequestDetail, RequestScope, RequestSummary } from './types';

export const requestKeys = {
  all: ['requests'] as const,
  list: (scope: RequestScope) => ['requests', 'list', scope] as const,
  detail: (id: string) => ['requests', 'detail', id] as const,
};

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<CategoryOption[]>('/api/categories'),
    staleTime: 5 * 60_000,
  });
}

export function useRecipients(categoryId: string | null) {
  return useQuery({
    queryKey: ['categories', categoryId, 'recipients'],
    queryFn: () => apiFetch<RecipientOption[]>(`/api/categories/${categoryId}/recipients`),
    enabled: Boolean(categoryId),
    staleTime: 5 * 60_000,
  });
}

export function useRequestList(scope: RequestScope) {
  return useInfiniteQuery({
    queryKey: requestKeys.list(scope),
    queryFn: ({ pageParam }) =>
      apiFetch<Page<RequestSummary>>(
        `/api/requests?scope=${scope}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useRequest(id: string) {
  return useQuery({
    queryKey: requestKeys.detail(id),
    queryFn: () => apiFetch<RequestDetail>(`/api/requests/${id}`),
  });
}

export interface VoiceInput {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
}

/** Données d'une nouvelle demande ; `clientId` rend l'envoi idempotent (research R10). */
export interface NewRequestInput {
  clientId: string;
  title: string;
  description?: string;
  categoryId: string;
  recipientId?: string;
  priority: Priority;
  voice?: VoiceInput;
}

async function uploadVoice(voice: VoiceInput): Promise<string> {
  const form = new FormData();
  form.append('kind', 'VOICE');
  form.append('file', voice.blob, `message-vocal.${extensionFor(voice.mimeType)}`);
  const file = await apiFetch<{ id: string }>('/api/files', { method: 'POST', body: form });
  return file.id;
}

/** Téléverse le vocal éventuel puis crée la demande. Réutilisé par la boîte d'envoi. */
export async function submitRequest(input: NewRequestInput): Promise<RequestDetail> {
  const voiceFileId = input.voice ? await uploadVoice(input.voice) : undefined;
  const body: Record<string, unknown> = {
    clientId: input.clientId,
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    categoryId: input.categoryId,
    ...(input.recipientId ? { recipientId: input.recipientId } : {}),
    priority: input.priority,
    ...(voiceFileId ? { voiceFileId } : {}),
  };
  return apiFetch<RequestDetail>('/api/requests', { method: 'POST', body });
}

/** Erreur passagère (réseau, serveur) : l'envoi peut être conservé puis relancé. */
export function isRetryableError(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'NETWORK_ERROR' || error.status === 0 || error.status >= 500);
}
