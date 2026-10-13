/**
 * Filtres de la liste des demandes, conservés dans l'URL (partage de lien, retour arrière) :
 * q, statut (répété), priorite (répété), categorie, destinataire, du, au, retard=1.
 */
export interface RequestFilters {
  q: string;
  statuses: string[];
  priorities: string[];
  categoryId: string;
  assigneeId: string;
  from: string;
  to: string;
  overdue: boolean;
}

const PARAM = {
  q: 'q',
  statuses: 'statut',
  priorities: 'priorite',
  categoryId: 'categorie',
  assigneeId: 'destinataire',
  from: 'du',
  to: 'au',
  overdue: 'retard',
} as const;

export const FILTER_PARAMS: readonly string[] = Object.values(PARAM);

export function readFilters(params: URLSearchParams): RequestFilters {
  return {
    q: params.get(PARAM.q) ?? '',
    statuses: params.getAll(PARAM.statuses),
    priorities: params.getAll(PARAM.priorities),
    categoryId: params.get(PARAM.categoryId) ?? '',
    assigneeId: params.get(PARAM.assigneeId) ?? '',
    from: params.get(PARAM.from) ?? '',
    to: params.get(PARAM.to) ?? '',
    overdue: params.get(PARAM.overdue) === '1',
  };
}

/** Réécrit les paramètres de filtre dans l'URL, en conservant les autres (onglet). */
export function writeFilters(params: URLSearchParams, filters: RequestFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const name of FILTER_PARAMS) next.delete(name);
  if (filters.q) next.set(PARAM.q, filters.q);
  for (const s of filters.statuses) next.append(PARAM.statuses, s);
  for (const p of filters.priorities) next.append(PARAM.priorities, p);
  if (filters.categoryId) next.set(PARAM.categoryId, filters.categoryId);
  if (filters.assigneeId) next.set(PARAM.assigneeId, filters.assigneeId);
  if (filters.from) next.set(PARAM.from, filters.from);
  if (filters.to) next.set(PARAM.to, filters.to);
  if (filters.overdue) next.set(PARAM.overdue, '1');
  return next;
}

/** Nombre de critères actifs (un critère à plusieurs valeurs compte pour un). */
export function activeFilterCount(f: RequestFilters): number {
  return [f.q, f.statuses.length, f.priorities.length, f.categoryId, f.assigneeId, f.from, f.to, f.overdue].filter(Boolean).length;
}

/** Paramètres de l'API GET /requests correspondant aux filtres. */
export function filtersToQuery(f: RequestFilters): string {
  const parts: string[] = [];
  for (const s of f.statuses) parts.push(`status=${encodeURIComponent(s)}`);
  for (const p of f.priorities) parts.push(`priority=${encodeURIComponent(p)}`);
  if (f.categoryId) parts.push(`categoryId=${encodeURIComponent(f.categoryId)}`);
  if (f.assigneeId) parts.push(`assigneeId=${encodeURIComponent(f.assigneeId)}`);
  if (f.from) parts.push(`from=${encodeURIComponent(f.from)}`);
  if (f.to) parts.push(`to=${encodeURIComponent(f.to)}`);
  if (f.overdue) parts.push('overdue=true');
  if (f.q) parts.push(`q=${encodeURIComponent(f.q)}`);
  return parts.map((p) => `&${p}`).join('');
}
