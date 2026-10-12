import { useInfiniteQuery } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import { uploadFile, type FileKind } from '../../api/uploads';
import type { VoiceInput } from '../requests/api';
import type { Page } from '../requests/types';
import { extensionFor } from '../voice/recorderFormat';

export interface Attachment {
  fileId: string;
  kind: FileKind;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
}

export interface ThreadMessage {
  id: string;
  kind: 'TEXT' | 'VOICE' | 'SYSTEM';
  author: { id: string; displayName: string } | null;
  text: string | null;
  voice: { fileId: string; durationSeconds: number } | null;
  attachments: Attachment[];
  createdAt: string;
}

export const messageKeys = {
  thread: (requestId: string) => ['requests', 'detail', requestId, 'messages'] as const,
};

/** Messages du plus récent au plus ancien (l'affichage les remet dans l'ordre chronologique). */
export function useMessages(requestId: string) {
  return useInfiniteQuery({
    queryKey: messageKeys.thread(requestId),
    queryFn: ({ pageParam }) =>
      apiFetch<Page<ThreadMessage>>(
        `/api/requests/${requestId}/messages${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Message à envoyer ; `clientId` rend l'envoi idempotent. Les pièces jointes sont déjà téléversées. */
export interface NewMessageInput {
  clientId: string;
  requestId: string;
  text?: string;
  voice?: VoiceInput;
  attachmentFileIds: string[];
}

export async function submitMessage(input: NewMessageInput): Promise<ThreadMessage> {
  const voiceFileId = input.voice
    ? (await uploadFile('VOICE', input.voice.blob, `message-vocal.${extensionFor(input.voice.mimeType)}`, input.requestId)).id
    : undefined;
  const body: Record<string, unknown> = {
    clientId: input.clientId,
    ...(input.text ? { text: input.text } : {}),
    ...(voiceFileId ? { voiceFileId } : {}),
    ...(input.attachmentFileIds.length > 0 ? { attachmentFileIds: input.attachmentFileIds } : {}),
  };
  return apiFetch<ThreadMessage>(`/api/requests/${input.requestId}/messages`, { method: 'POST', body });
}
