import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/client';
import { isRetryableError, requestKeys, submitRequest } from '../requests/api';
import { listOutbox, removeFromOutbox, saveToOutbox, type OutboxEntry } from './outbox';

export const OUTBOX_KEY = ['outbox'] as const;

export function useOutbox() {
  const queryClient = useQueryClient();
  const entries = useQuery({ queryKey: OUTBOX_KEY, queryFn: listOutbox, staleTime: Infinity });

  const refresh = () => queryClient.invalidateQueries({ queryKey: OUTBOX_KEY });

  /** Renvoie une demande conservée ; en cas de nouvel échec passager, elle reste dans la boîte. */
  const retry = useMutation({
    mutationFn: async (entry: OutboxEntry) => {
      try {
        const created = await submitRequest(entry.payload);
        await removeFromOutbox(entry.id);
        return created;
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Envoi impossible.';
        if (isRetryableError(error)) {
          await saveToOutbox({ ...entry, lastError: message });
        }
        throw error;
      }
    },
    onSettled: async () => {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: requestKeys.all });
    },
  });

  const abandon = useMutation({
    mutationFn: (entry: OutboxEntry) => removeFromOutbox(entry.id),
    onSettled: refresh,
  });

  return { entries: entries.data ?? [], retry, abandon, refresh };
}
