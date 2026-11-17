import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import type { Priority, RequestStatus } from '../../api/types';
import type { AdminRef, Transfer, TransferStatus } from '../admin-workspace/types';
import type { Page, RequestDetail, RequestSummary } from '../requests/types';

/** Demande vue par le super administrateur : le résumé habituel et l'état de la personne qui l'a prise en charge. */
export interface SupervisedRequest extends RequestSummary {
  /** Vrai si le compte qui a la demande à sa charge est désactivé ou n'est plus admin de la catégorie. */
  adminOwnerUnavailable: boolean;
}

/** Administrateur et sa charge (GET /api/super-admin/administrators). */
export interface AdministratorLoad extends AdminRef {
  active: boolean;
  ownedActive: number;
  ownedFinished: number;
  transfersPending: number;
  lastOperationAt: string | null;
}

export interface SupervisionFilters {
  ownership: '' | 'free' | 'owned';
  state: '' | 'active' | 'finished';
  adminId: string;
  priority: '' | Priority;
  status: '' | RequestStatus;
  from: string;
  to: string;
}

export const NO_FILTERS: SupervisionFilters = { ownership: '', state: '', adminId: '', priority: '', status: '', from: '', to: '' };

/** Taille d'une page de la supervision ; la suite se charge à la demande (« Afficher plus »). */
const PAGE_SIZE = 25;

/** Rangées sous ['requests', 'list'] : relues à chaque événement temps réel sur une demande ou un transfert. */
export const supervisionKeys = {
  requests: (filters: SupervisionFilters) => ['requests', 'list', 'supervision', 'requests', filters] as const,
  administrators: ['requests', 'list', 'supervision', 'administrators'] as const,
  transfers: (status: TransferStatus | 'all') => ['requests', 'list', 'supervision', 'transfers', status] as const,
  candidates: (requestId: string) => ['requests', 'list', 'supervision', 'candidates', requestId] as const,
};

function query(filters: SupervisionFilters, cursor: string): string {
  const dateOk = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (filters.ownership) params.set('ownership', filters.ownership);
  if (filters.state) params.set('state', filters.state);
  if (filters.adminId) params.set('adminId', filters.adminId);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.status) params.set('status', filters.status);
  // Une date en cours de saisie n'est pas envoyée : le serveur la refuserait.
  if (dateOk(filters.from)) params.set('from', filters.from);
  if (dateOk(filters.to)) params.set('to', filters.to);
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

/** Toutes les demandes « via l'administration », filtrées, page par page (curseur du serveur). */
export function useSupervisedRequests(filters: SupervisionFilters) {
  return useInfiniteQuery({
    queryKey: supervisionKeys.requests(filters),
    queryFn: ({ pageParam }) => apiFetch<Page<SupervisedRequest>>(`/api/super-admin/requests?${query(filters, pageParam)}`),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useAdministrators() {
  return useQuery({
    queryKey: supervisionKeys.administrators,
    queryFn: () => apiFetch<AdministratorLoad[]>('/api/super-admin/administrators'),
  });
}

/** Toutes les propositions de transfert, par statut, page par page. */
export function useAllTransfers(status: TransferStatus | 'all') {
  return useInfiniteQuery({
    queryKey: supervisionKeys.transfers(status),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (status !== 'all') params.set('status', status);
      if (pageParam) params.set('cursor', pageParam);
      return apiFetch<Page<Transfer>>(`/api/super-admin/transfers?${params.toString()}`);
    },
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/**
 * Administrateurs à qui la demande peut être réattribuée : la liste est celle du serveur (comptes actifs,
 * admins de la catégorie de la demande, sans celui qui l'a déjà), rechargée à chaque ouverture du dialogue.
 */
export function useReassignCandidates(requestId: string) {
  return useQuery({
    queryKey: supervisionKeys.candidates(requestId),
    queryFn: () => apiFetch<AdminRef[]>(`/api/super-admin/requests/${requestId}/reassign-candidates`),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Réattribution administrative : `adminId` null remet la demande dans la file commune. Motif obligatoire. */
export function useReassignOwner(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { adminId: string | null; reason: string }) =>
      apiFetch<RequestDetail>(`/api/super-admin/requests/${requestId}/reassign`, { method: 'POST', body: input }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['requests', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['requests', 'detail'] });
    },
  });
}
