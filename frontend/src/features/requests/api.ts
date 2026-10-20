import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ApiError, apiFetch } from '../../api/client';
import type { Priority } from '../../api/types';
import { uploadFile } from '../../api/uploads';
import { extensionFor } from '../voice/recorderFormat';
import type { CategoryOption, Page, RecipientOption, RequestDetail, RequestScope, RequestSummary } from './types';

export const requestKeys = {
  all: ['requests'] as const,
  list: (scope: RequestScope, statuses: readonly string[] = [], filters = '') =>
    ['requests', 'list', scope, ...statuses, filters] as const,
  detail: (id: string) => ['requests', 'detail', id] as const,
};

/** Rechargée à chaque ouverture du formulaire : une catégorie créée ou réactivée par le super administrateur y apparaît aussitôt. */
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<CategoryOption[]>('/api/categories'),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Sans cache prolongé : un destinataire ajouté par le super administrateur apparaît dès la prochaine ouverture. */
export function useRecipients(categoryId: string | null) {
  return useQuery({
    queryKey: ['categories', categoryId, 'recipients'],
    queryFn: () => apiFetch<RecipientOption[]>(`/api/categories/${categoryId}/recipients`),
    enabled: Boolean(categoryId),
  });
}

/** `filters` : paramètres supplémentaires déjà encodés (« &priority=URGENT&q=… »). */
export function useRequestList(scope: RequestScope, statuses: readonly string[] = [], filters = '') {
  const statusQuery = statuses.map((s) => `&status=${s}`).join('') + filters;
  return useInfiniteQuery({
    queryKey: requestKeys.list(scope, statuses, filters),
    queryFn: ({ pageParam }) =>
      apiFetch<Page<RequestSummary>>(
        `/api/requests?scope=${scope}${statusQuery}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Employés affectables (approbation en circuit B, réaffectation) — réservé aux admins. */
export function useAssignees(requestId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['requests', 'detail', requestId, 'assignees'],
    queryFn: () => apiFetch<RecipientOption[]>(`/api/requests/${requestId}/assignees`),
    enabled,
    // Rechargée à chaque ouverture : un employé créé ou rattaché entre-temps doit y figurer.
    staleTime: 0,
    refetchOnMount: 'always',
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
  return (await uploadFile('VOICE', voice.blob, `message-vocal.${extensionFor(voice.mimeType)}`)).id;
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
