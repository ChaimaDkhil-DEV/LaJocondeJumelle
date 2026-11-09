import { useQuery } from '@tanstack/react-query';
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
