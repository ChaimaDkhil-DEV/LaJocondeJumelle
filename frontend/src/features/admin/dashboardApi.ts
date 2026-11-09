import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import type { Priority, RequestStatus, Role } from '../../api/types';
import { t } from '../../i18n';
import type { DeadlineStage } from '../requests/types';

/** Les chiffres sont relus régulièrement : le super administrateur ne reçoit pas tous les événements temps réel. */
export const DASHBOARD_REFRESH_MS = 60_000;

export const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: (qs: string) => ['dashboard', 'summary', qs] as const,
  performance: (qs: string) => ['dashboard', 'performance', qs] as const,
  employees: (qs: string) => ['dashboard', 'employees', qs] as const,
  activity: (qs: string) => ['dashboard', 'activity', qs] as const,
  requests: (qs: string, indicator: DashboardIndicator) => ['dashboard', 'requests', indicator, qs] as const,
};

export type PeriodPreset = '7' | '30' | '90' | 'custom';

export interface DashboardFilters {
  preset: PeriodPreset;
  /** Dates locales AAAA-MM-JJ (période personnalisée). */
  from: string;
  to: string;
  categoryId: string;
  priority: string;
  employeeId: string;
}

export const DEFAULT_FILTERS: DashboardFilters = { preset: '30', from: '', to: '', categoryId: '', priority: '', employeeId: '' };

function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Bornes locales de la période (jours entiers, aujourd'hui compris pour les préréglages). */
export function periodOf(f: DashboardFilters, today = new Date()): { from: string; to: string } {
  if (f.preset === 'custom') return { from: f.from, to: f.to };
  const start = new Date(today);
  start.setDate(start.getDate() - (Number(f.preset) - 1));
  return { from: localDay(start), to: localDay(today) };
}

/**
 * Paramètres de l'API : bornes converties en instants (début et fin de journée locale) et fuseau
 * du navigateur pour la série quotidienne.
 */
export function toDashboardQuery(f: DashboardFilters, today = new Date()): string {
  const params = new URLSearchParams();
  const { from, to } = periodOf(f, today);
  if (from) params.set('from', new Date(`${from}T00:00:00`).toISOString());
  if (to) params.set('to', new Date(`${to}T23:59:59.999`).toISOString());
  params.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone);
  if (f.categoryId) params.set('categoryId', f.categoryId);
  if (f.priority) params.set('priority', f.priority);
  if (f.employeeId) params.set('employeeId', f.employeeId);
  return params.toString();
}

/** Paramètres équivalents pour la liste des demandes (GET /requests), qui filtre l'employé affecté. */
export function toRequestListFilters(f: DashboardFilters, today = new Date()): string {
  const params = new URLSearchParams();
  const { from, to } = periodOf(f, today);
  if (from) params.set('from', new Date(`${from}T00:00:00`).toISOString());
  if (to) params.set('to', new Date(`${to}T23:59:59.999`).toISOString());
  if (f.categoryId) params.set('categoryId', f.categoryId);
  if (f.priority) params.set('priority', f.priority);
  if (f.employeeId) params.set('assigneeId', f.employeeId);
  const qs = params.toString();
  return qs ? `&${qs}` : '';
}

export type StatusGroup = 'pendingValidation' | 'pendingTakeover' | 'inProgress' | 'done' | 'rejected' | 'cancelled';

/**
 * Chiffres qui ouvrent la liste de leurs demandes (GET /admin/dashboard/requests) : ceux de la période
 * et ceux de la situation actuelle, toutes périodes confondues.
 */
export type DashboardIndicator = 'total' | StatusGroup | 'overdueInPeriod' | 'overdueNow' | 'urgentActive' | 'unassigned';
export const CURRENT_INDICATORS: readonly DashboardIndicator[] = ['overdueNow', 'urgentActive', 'unassigned'];
const INDICATORS: readonly DashboardIndicator[] = [
  'total',
  'pendingValidation',
  'pendingTakeover',
  'inProgress',
  'done',
  'rejected',
  'cancelled',
  'overdueInPeriod',
  ...CURRENT_INDICATORS,
];

/** Filtres et indicateur dans l'adresse de la page, pour qu'un lien vers une liste filtrée se garde et se partage. */
const PARAMS = { preset: 'periode', from: 'du', to: 'au', categoryId: 'categorie', priority: 'priorite', employeeId: 'employe' } as const;
const INDICATOR_PARAM = 'indicateur';
const PRESETS: Record<string, PeriodPreset> = { '7': '7', '30': '30', '90': '90', perso: 'custom' };
const PRIORITIES: readonly string[] = ['URGENT', 'HIGH', 'MEDIUM', 'NORMAL'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Filtres lus dans l'adresse ; une valeur inconnue est ignorée (valeur par défaut). */
export function filtersFromParams(params: URLSearchParams): DashboardFilters {
  const preset = PRESETS[params.get(PARAMS.preset) ?? ''] ?? DEFAULT_FILTERS.preset;
  const day = (key: string) => (DAY.test(params.get(key) ?? '') ? params.get(key)! : '');
  const priority = params.get(PARAMS.priority) ?? '';
  return {
    preset,
    from: preset === 'custom' ? day(PARAMS.from) : '',
    to: preset === 'custom' ? day(PARAMS.to) : '',
    categoryId: params.get(PARAMS.categoryId) ?? '',
    priority: PRIORITIES.includes(priority) ? priority : '',
    employeeId: params.get(PARAMS.employeeId) ?? '',
  };
}

/** Adresse avec ces filtres (sans les valeurs par défaut) ; les autres paramètres (vue…) sont gardés. */
export function withFilters(params: URLSearchParams, f: DashboardFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  const presetParam = Object.keys(PRESETS).find((key) => PRESETS[key] === f.preset)!;
  const values: Record<keyof typeof PARAMS, string> = {
    preset: f.preset === DEFAULT_FILTERS.preset ? '' : presetParam,
    from: f.preset === 'custom' ? f.from : '',
    to: f.preset === 'custom' ? f.to : '',
    categoryId: f.categoryId,
    priority: f.priority,
    employeeId: f.employeeId,
  };
  for (const key of Object.keys(PARAMS) as Array<keyof typeof PARAMS>) {
    if (values[key]) next.set(PARAMS[key], values[key]);
    else next.delete(PARAMS[key]);
  }
  return next;
}

export function indicatorFromParams(params: URLSearchParams): DashboardIndicator | null {
  const value = params.get(INDICATOR_PARAM);
  return INDICATORS.find((i) => i === value) ?? null;
}

/** Sans indicateur : la liste habituelle de l'onglet Demandes. */
export function withoutIndicator(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(INDICATOR_PARAM);
  return next;
}

/** Lien d'un chiffre : onglet Demandes, sur les demandes de ce chiffre, avec les filtres en cours. */
export function indicatorLink(params: URLSearchParams, indicator: DashboardIndicator): string {
  const next = new URLSearchParams(params);
  next.set('vue', 'demandes');
  next.set(INDICATOR_PARAM, indicator);
  return `?${next.toString()}`;
}

/** Ligne de la liste des demandes d'un chiffre : les champs affichés, sans contenu de demande. */
export interface DashboardRequestRow {
  id: string;
  reference: string;
  title: string;
  priority: Priority;
  status: RequestStatus;
  overdueStage: DeadlineStage | null;
  currentDueAt: string | null;
  createdAt: string;
  category: { id: string; name: string };
  requester: { id: string; displayName: string };
  assignee: { id: string; displayName: string } | null;
}

export interface DurationStats {
  avgMs: number | null;
  count: number;
}

export interface Compliance {
  evaluated: number;
  onTime: number;
  rate: number | null;
}

export interface PerformanceStats {
  validation: DurationStats;
  firstReply: DurationStats;
  takeover: DurationStats;
  resolution: DurationStats;
  grossResolution: DurationStats;
  compliance: Compliance;
}

export interface DashboardAlert {
  id: string;
  reference: string;
  title: string;
  priority: Priority;
  status: RequestStatus;
  createdAt: string;
  currentStage: DeadlineStage | null;
  currentDueAt: string | null;
  overdueStage: DeadlineStage | null;
  category: { id: string; name: string };
  assignee: { id: string; displayName: string } | null;
}

export interface DashboardSummary {
  period: { from: string; to: string };
  counts: Record<StatusGroup, number> & { total: number; overdueInPeriod: number };
  byStatus: Array<{ status: RequestStatus; count: number }>;
  current: { overdueNow: number; urgentActive: number; unassigned: number };
  byCategory: Array<{ category: { id: string; name: string }; total: number; active: number; done: number; overdue: number }>;
  messages: { text: number; voice: number };
  daily: Array<{ day: string; created: number; completed: number }>;
  alerts: DashboardAlert[];
}

export interface DashboardPerformance {
  period: { from: string; to: string };
  overall: PerformanceStats;
  byPriority: Array<PerformanceStats & { priority: Priority; total: number }>;
}

export interface EmployeeStats {
  user: { id: string; displayName: string; jobTitle: string | null; role: Role; active: boolean };
  created: number;
  assigned: number;
  pendingTakeover: number;
  inProgress: number;
  done: number;
  overdueNow: number;
  overdueInPeriod: number;
  takeover: DurationStats;
  resolution: DurationStats;
  lastActionAt: string | null;
}

export interface ActivityItem {
  id: string;
  type: string;
  createdAt: string;
  actor: { id: string; displayName: string } | null;
  request: { id: string; reference: string; title: string };
  details: Record<string, unknown>;
}

const common = { refetchInterval: DASHBOARD_REFRESH_MS, placeholderData: keepPreviousData };

export function useDashboardSummary(qs: string) {
  return useQuery({ queryKey: dashboardKeys.summary(qs), queryFn: () => apiFetch<DashboardSummary>(`/api/admin/dashboard/summary?${qs}`), ...common });
}

export function useDashboardPerformance(qs: string, enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.performance(qs),
    queryFn: () => apiFetch<DashboardPerformance>(`/api/admin/dashboard/performance?${qs}`),
    enabled,
    ...common,
  });
}

export function useDashboardEmployees(qs: string, enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.employees(qs),
    queryFn: () => apiFetch<{ items: EmployeeStats[] }>(`/api/admin/dashboard/employees?${qs}`),
    enabled,
    ...common,
  });
}

export function useDashboardActivity(qs: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: dashboardKeys.activity(qs),
    queryFn: ({ pageParam }) =>
      apiFetch<{ items: ActivityItem[]; nextCursor: string | null }>(
        `/api/admin/dashboard/activity?${qs}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    refetchInterval: DASHBOARD_REFRESH_MS,
  });
}

/** Demandes comptées par un chiffre de la synthèse : mêmes filtres, même définition côté serveur. */
export function useDashboardRequests(qs: string, indicator: DashboardIndicator) {
  return useInfiniteQuery({
    queryKey: dashboardKeys.requests(qs, indicator),
    queryFn: ({ pageParam }) =>
      apiFetch<{ items: DashboardRequestRow[]; nextCursor: string | null }>(
        `/api/admin/dashboard/requests?${qs}&indicator=${indicator}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: DASHBOARD_REFRESH_MS,
  });
}

/** Durée lisible : « 45 s », « 12 min », « 3 h 05 », « 2 j 4 h ». */
export function formatDurationMs(ms: number | null): string {
  if (ms === null) return '—';
  const minutes = Math.round(ms / 60_000);
  if (ms < 60_000) return t('{seconds} s', { seconds: Math.round(ms / 1000) });
  if (minutes < 60) return t('{minutes} min', { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('{hours} h {minutes}', { hours, minutes: String(minutes % 60).padStart(2, '0') });
  return t('{days} j {hours} h', { days: Math.floor(hours / 24), hours: hours % 24 });
}

export function formatRate(rate: number | null): string {
  return rate === null ? '—' : t('{percent} %', { percent: Math.round(rate * 100) });
}
