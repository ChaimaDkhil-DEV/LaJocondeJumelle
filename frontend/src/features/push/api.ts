import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';

/** Configuration du push donnée par le serveur : jamais la clé privée (spec 014, contracts/http-api.md). */
export interface PushConfig {
  enabled: boolean;
  publicKey: string | null;
}

export const PUSH_CONFIG_KEY = ['push', 'config'] as const;

export function usePushConfig() {
  return useQuery({
    queryKey: PUSH_CONFIG_KEY,
    queryFn: () => apiFetch<PushConfig>('/api/push/config'),
    staleTime: 5 * 60_000,
  });
}

/** Abonnement du navigateur tel que le donne PushSubscription.toJSON(). */
export interface BrowserSubscriptionJson {
  endpoint?: string;
  keys?: Record<string, string>;
}

/** Enregistre l'appareil courant (création, mise à jour ou transfert depuis un autre compte). */
export function savePushSubscription(subscription: BrowserSubscriptionJson) {
  return apiFetch<{ id: string; deviceLabel: string; created: boolean }>('/api/push/subscriptions', {
    method: 'PUT',
    body: { endpoint: subscription.endpoint, keys: subscription.keys },
  });
}

/** Retire l'abonnement de la session courante côté serveur. */
export function removeCurrentPushSubscription() {
  return apiFetch<void>('/api/push/subscriptions/current', { method: 'DELETE' });
}

/** Appareil abonné du compte (GET /api/push/subscriptions) : jamais l'adresse d'envoi ni les clés. */
export interface PushDevice {
  id: string;
  deviceLabel: string;
  createdAt: string;
  lastUsedAt: string;
  /** Appareil de la session courante. */
  current: boolean;
}

export const PUSH_DEVICES_KEY = ['push', 'devices'] as const;

export function usePushDevices() {
  return useQuery({
    queryKey: PUSH_DEVICES_KEY,
    queryFn: () => apiFetch<PushDevice[]>('/api/push/subscriptions'),
  });
}

/** Retire un de ses appareils, puis relit la liste. */
export function useRemovePushDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/push/subscriptions/${id}`, { method: 'DELETE' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: PUSH_DEVICES_KEY }),
  });
}
