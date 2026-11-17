import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import { requestKeys } from '../requests/api';
import type { Page, RequestDetail, RequestSummary } from '../requests/types';
import type { AdminRef, AssignmentView, OwnedScope, QueueItem, Transfer, TransferType, WorkspaceSummary } from './types';

/**
 * Espace de travail des administrateurs (018). Les clés sont rangées sous ['requests', 'list'] : les
 * événements temps réel « request:updated » et « notification:new » invalident déjà ce préfixe, donc
 * la file commune, les listes et les compteurs se relisent seuls quand un collègue prend une demande.
 */
export const workspaceKeys = {
  all: ['requests', 'list', 'workspace'] as const,
  summary: ['requests', 'list', 'workspace', 'summary'] as const,
  queue: ['requests', 'list', 'workspace', 'queue'] as const,
  owned: (scope: OwnedScope) => ['requests', 'list', 'workspace', 'owned', scope] as const,
  history: ['requests', 'list', 'workspace', 'history'] as const,
  transfers: (box: TransferBox) => ['requests', 'list', 'workspace', 'transfers', box] as const,
  transfer: (id: string) => ['requests', 'list', 'workspace', 'transfer', id] as const,
  candidates: (requestId: string) => ['requests', 'list', 'workspace', 'candidates', requestId] as const,
};

/** Propositions reçues en attente, envoyées en attente, ou passées (historique). */
export type TransferBox = 'received' | 'sent' | 'history';

/** Taille de page des listes de l'espace : celle que le serveur accepte au maximum. */
const PAGE = 100;

export function useWorkspaceSummary() {
  return useQuery({
    queryKey: workspaceKeys.summary,
    queryFn: () => apiFetch<WorkspaceSummary>('/api/admin/requests/summary'),
  });
}

/** File commune : demandes libres en attente de validation, urgentes d'abord. */
export function useCommonQueue() {
  return useQuery({
    queryKey: workspaceKeys.queue,
    queryFn: () => apiFetch<Page<QueueItem>>(`/api/admin/requests/available?limit=${PAGE}`),
  });
}

/** Demandes dont l'utilisateur connecté est responsable. Aucun identifiant n'est transmis : le serveur lit la session. */
export function useOwnedRequests(scope: OwnedScope) {
  return useQuery({
    queryKey: workspaceKeys.owned(scope),
    queryFn: () => apiFetch<Page<RequestSummary>>(`/api/admin/requests/mine?scope=${scope}&limit=${PAGE}`),
  });
}

/** « Mon historique » : prises en charge, transferts, réattributions, libérations. */
export function useMyAssignments() {
  return useQuery({
    queryKey: workspaceKeys.history,
    queryFn: () => apiFetch<Page<AssignmentView>>(`/api/admin/assignments/mine?limit=${PAGE}`),
  });
}

/**
 * « Prendre en charge ». Seule la version lue est envoyée. Réussite ou refus (un collègue a été plus
 * rapide), les listes et la demande sont relues : l'écran montre toujours l'état du serveur.
 */
export function useClaimRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      apiFetch<RequestDetail>(`/api/admin/requests/${id}/claim`, { method: 'POST', body: { version } }),
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['requests', 'list'] });
      void queryClient.invalidateQueries({ queryKey: requestKeys.detail(id) });
    },
  });
}

/** Propositions de transfert de l'utilisateur connecté : reçues ou envoyées (en attente), ou passées. */
export function useTransfers(box: TransferBox) {
  return useQuery({
    queryKey: workspaceKeys.transfers(box),
    queryFn: () => apiFetch<Page<Transfer>>(`/api/admin/transfers/${box}?limit=${PAGE}`),
  });
}

/** Une proposition (bandeau du détail d'une demande). */
export function useTransfer(id: string | null | undefined) {
  return useQuery({
    queryKey: workspaceKeys.transfer(id ?? ''),
    queryFn: () => apiFetch<Transfer>(`/api/admin/transfers/${id}`),
    enabled: Boolean(id),
  });
}

/** Collègues à qui confier la demande ; rechargés à chaque ouverture du dialogue. */
export function useTransferCandidates(requestId: string, enabled: boolean) {
  return useQuery({
    queryKey: workspaceKeys.candidates(requestId),
    queryFn: () => apiFetch<AdminRef[]>(`/api/admin/requests/${requestId}/transfer-candidates`),
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

function useRefreshAfterTransfer() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['requests', 'list'] });
    void queryClient.invalidateQueries({ queryKey: ['requests', 'detail'] });
  };
}

export interface ProposeTransferInput {
  type: TransferType;
  reason: string;
  /** Délégation seulement : le collègue choisi. Une demande de reprise n'en transmet jamais. */
  recipientId?: string;
}

/** Délégation ou demande de reprise sur une demande. */
export function useProposeTransfer(requestId: string) {
  const refresh = useRefreshAfterTransfer();
  return useMutation({
    mutationFn: (input: ProposeTransferInput) => apiFetch<Transfer>(`/api/admin/requests/${requestId}/transfers`, { method: 'POST', body: input }),
    onSettled: refresh,
  });
}

export type TransferAnswer = { id: string; action: 'accept' | 'cancel' } | { id: string; action: 'reject'; responseReason?: string };

/**
 * Accepter, refuser ou annuler une proposition. Réussite ou refus du serveur (réponse arrivée trop tard),
 * listes et demande sont relues : l'écran montre toujours l'état du serveur.
 */
export function useAnswerTransfer() {
  const refresh = useRefreshAfterTransfer();
  return useMutation({
    mutationFn: (answer: TransferAnswer) =>
      apiFetch<Transfer>(`/api/admin/transfers/${answer.id}/${answer.action}`, {
        method: 'POST',
        ...(answer.action === 'reject' ? { body: answer.responseReason ? { responseReason: answer.responseReason } : {} } : {}),
      }),
    onSettled: refresh,
  });
}
