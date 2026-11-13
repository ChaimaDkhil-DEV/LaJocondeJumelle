import type { RequestStatus } from '../../api/types';
import type { RequestSummary } from './types';

/**
 * « Mes demandes » : tri, sections et action principale, communs aux onglets (logique pure, sans réseau).
 * Le serveur pagine par date de création : le tri s'applique aux demandes déjà chargées.
 */

/** Travail terminé ou statut final : la demande n'attend plus rien (≠ « terminée, en attente de validation finale »). */
const FINISHED: readonly RequestStatus[] = ['DONE', 'CLOSED', 'REJECTED', 'CANCELLED'];

export function isFinished(status: RequestStatus): boolean {
  return FINISHED.includes(status);
}

/** En retard : étape signalée par le serveur, ou échéance dépassée (même règle que le compte à rebours). */
export function isLate(r: RequestSummary, now: number): boolean {
  if (isFinished(r.status)) return false;
  if (r.overdueStage) return true;
  return Boolean(r.currentStage && r.currentDueAt && now >= Date.parse(r.currentDueAt));
}

export type RowLevel = 'urgent' | 'late' | 'normal' | 'closed';

const LEVEL_ORDER: Record<RowLevel, number> = { urgent: 0, late: 1, normal: 2, closed: 3 };

export function rowLevel(r: RequestSummary, now: number): RowLevel {
  if (isFinished(r.status)) return 'closed';
  if (r.priority === 'URGENT') return 'urgent';
  return isLate(r, now) ? 'late' : 'normal';
}

/**
 * Urgentes ouvertes, puis en retard, puis normales, puis closes (urgentes d'abord). À niveau égal : les
 * demandes en retard de la plus ancienne à la plus récente, les autres de la plus récente à la plus ancienne ;
 * parmi les urgentes, celles en retard passent avant les autres.
 */
export function sortRequests(requests: readonly RequestSummary[], now: number): RequestSummary[] {
  const keyed = requests.map((r) => ({ r, level: rowLevel(r, now), late: isLate(r, now), at: Date.parse(r.createdAt) }));
  keyed.sort((a, b) => {
    if (a.level !== b.level) return LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
    if (a.level === 'closed' && a.r.priority !== b.r.priority) return a.r.priority === 'URGENT' ? -1 : 1;
    if (a.late !== b.late) return a.late ? -1 : 1;
    return a.late ? a.at - b.at : b.at - a.at;
  });
  return keyed.map((k) => k.r);
}

/** « Prioritaires » : urgentes et en retard (ouvertes). « Autres » : les normales et les closes. */
export function splitSections(sorted: readonly RequestSummary[], now: number) {
  const priority: RequestSummary[] = [];
  const others: RequestSummary[] = [];
  for (const r of sorted) {
    const level = rowLevel(r, now);
    (level === 'urgent' || level === 'late' ? priority : others).push(r);
  }
  return { priority, others };
}

export type PrimaryAction = 'validate' | 'correct' | 'open';

export function primaryAction(tabKey: string, status: RequestStatus): PrimaryAction {
  if (tabKey === 'a-valider') return 'validate';
  if (status === 'TO_CORRECT') return 'correct';
  return 'open';
}

/** Onglet affiché sans choix dans l'adresse : « À valider » s'il contient des demandes, sinon « Reçues ». */
export function defaultTabKey(toValidateCount: number): 'a-valider' | 'recues' {
  return toValidateCount > 0 ? 'a-valider' : 'recues';
}
