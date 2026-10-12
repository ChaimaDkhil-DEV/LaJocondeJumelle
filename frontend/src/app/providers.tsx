import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { ME_QUERY_KEY } from '../features/auth/useCurrentUser';
import { theme } from './theme';

/** Pas de nouvel essai automatique sur les erreurs 4xx (droits, validation, session). */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  // Session expirée pendant l'utilisation : on relit le profil, ce qui renvoie vers la connexion.
  const onUnauthenticated = (error: unknown, key?: readonly unknown[]): void => {
    if (!(error instanceof ApiError) || error.status !== 401) return;
    if (key && key[0] === ME_QUERY_KEY[0]) return;
    void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
  };

  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => onUnauthenticated(error, query.queryKey) }),
    mutationCache: new MutationCache({ onError: (error) => onUnauthenticated(error) }),
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
  return queryClient;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
