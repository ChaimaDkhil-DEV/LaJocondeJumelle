import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

/** Rangées sous ['requests', 'list'] : relues à chaque événement temps réel sur une demande ou un transfert. */
export const supervisionKeys = {
  requests: (filters: SupervisionFilters) => ['requests', 'list', 'supervision', 'requests', filters] as const,
  administrators: ['requests', 'list', 'supervision', 'administrators'] as const,
  transfers: (status: TransferStatus | 'all') => ['requests', 'list', 'supervision', 'transfers', status] as const,
};

function query(filters: SupervisionFilters): string {
  const dateOk = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  const params = new URLSearchParams({ limit: '100' });
  if (filters.ownership) params.set('ownership', filters.ownership);
  if (filters.state) params.set('state', filters.state);
  if (filters.adminId) params.set('adminId', filters.adminId);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.status) params.set('status', filters.status);
  // Une date en cours de saisie n'est pas envoyée : le serveur la refuserait.
  if (dateOk(filters.from)) params.set('from', filters.from);
  if (dateOk(filters.to)) params.set('to', filters.to);
  return params.toString();
}

/** Toutes les demandes « via l'administration », filtrées. */
export function useSupervisedRequests(filters: SupervisionFilters) {
  return useQuery({
    queryKey: supervisionKeys.requests(filters),
    queryFn: () => apiFetch<Page<SupervisedRequest>>(`/api/super-admin/requests?${query(filters)}`),
  });
}

export function useAdministrators() {
  return useQuery({
    queryKey: supervisionKeys.administrators,
    queryFn: () => apiFetch<AdministratorLoad[]>('/api/super-admin/administrators'),
  });
}

/** Toutes les propositions de transfert, par statut. */
export function useAllTransfers(status: TransferStatus | 'all') {
  return useQuery({
    queryKey: supervisionKeys.transfers(status),
    queryFn: () => apiFetch<Page<Transfer>>(`/api/super-admin/transfers?limit=100${status === 'all' ? '' : `&status=${status}`}`),
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
