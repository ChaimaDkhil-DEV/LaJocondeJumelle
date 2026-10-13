import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';

export interface ClientSettings {
  voiceMaxSeconds: number;
  attachmentMaxBytes: number;
  attachmentMaxPerMessage: number;
  draftsEnabled: boolean;
}

/** Valeurs par défaut provisoires, utilisées tant que les réglages ne sont pas chargés. */
export const DEFAULT_CLIENT_SETTINGS: ClientSettings = {
  voiceMaxSeconds: 180,
  attachmentMaxBytes: 10 * 1024 * 1024,
  attachmentMaxPerMessage: 5,
  draftsEnabled: true,
};

/** Réglages modifiables par le super administrateur et utiles à l'interface (GET /settings/client). */
export function useClientSettings(): ClientSettings {
  const query = useQuery({
    queryKey: ['settings', 'client'],
    queryFn: () => apiFetch<ClientSettings>('/api/settings/client'),
    staleTime: 5 * 60_000,
  });
  return query.data ?? DEFAULT_CLIENT_SETTINGS;
}
