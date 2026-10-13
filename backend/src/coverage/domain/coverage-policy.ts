import type { Role } from '@prisma/client';
import {
  availableCoverageActions,
  OPEN_STATUSES,
  type CoverageAction,
  type CoverageActor,
  type CoverageMachineState,
} from './coverage-state-machine';

/**
 * Politique d'accès des couvertures (fonctions pures, appliquées côté serveur à chaque route,
 * aux fichiers et aux listes) :
 * - super administrateur : tout ;
 * - responsables de la catégorie et auteur de la demande : tout, et actions de gestion ;
 * - preneur actuel : sa garde ;
 * - membre d'un groupe ciblé : la demande tant qu'elle est diffusée ou non pourvue ; ensuite
 *   uniquement « Déjà prise par [nom] », sans détail ni pièce jointe ;
 * - les autres : rien.
 */

export interface CoverageViewer {
  id: string;
  role: Role;
  active: boolean;
}

export interface CoverageFacts extends CoverageMachineState {
  requesterId: string;
  managerIds: ReadonlySet<string>;
  /** L'utilisateur appartient à un des groupes ciblés. */
  inTargetGroup: boolean;
}

export type CoverageAccess = 'full' | 'limited' | 'none';

export function coverageActors(user: CoverageViewer, facts: CoverageFacts): CoverageActor[] {
  if (!user.active) return [];
  const actors: CoverageActor[] = [];
  if (user.role === 'SUPER_ADMIN' || facts.managerIds.has(user.id) || facts.requesterId === user.id) {
    actors.push('MANAGER');
  }
  if (facts.assigneeId !== null && facts.assigneeId === user.id) actors.push('ASSIGNEE');
  else if (facts.inTargetGroup) actors.push('CANDIDATE');
  return actors;
}

export function coverageAccess(user: CoverageViewer, facts: CoverageFacts): CoverageAccess {
  const actors = coverageActors(user, facts);
  if (actors.includes('MANAGER') || actors.includes('ASSIGNEE')) return 'full';
  if (actors.includes('CANDIDATE')) return OPEN_STATUSES.includes(facts.status) ? 'full' : 'limited';
  return 'none';
}

/** Gestionnaire de la couverture (voit l'historique complet et les photos de preuve). */
export function isCoverageManager(user: CoverageViewer, facts: CoverageFacts): boolean {
  return coverageActors(user, facts).includes('MANAGER');
}

/**
 * Photo de preuve : l'employé qui l'a prise, les responsables de la catégorie, l'auteur de la
 * demande et le super administrateur — jamais les autres membres du groupe, même si la demande
 * est rediffusée.
 */
export function canReadPresenceProof(user: CoverageViewer, facts: CoverageFacts, uploaderId: string): boolean {
  if (!user.active) return false;
  return uploaderId === user.id || isCoverageManager(user, facts);
}

export function coverageActionsFor(user: CoverageViewer, facts: CoverageFacts): CoverageAction[] {
  if (coverageAccess(user, facts) !== 'full') return [];
  return availableCoverageActions(facts, coverageActors(user, facts));
}

/** Créneau [début, fin) ; fin null = ouverte (jusqu'à l'arrivée de l'enseignant ou la relève). */
export interface Slot {
  startAt: Date;
  plannedEndAt: Date | null;
}

export function slotsOverlap(a: Slot, b: Slot): boolean {
  const aEnd = a.plannedEndAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const bEnd = b.plannedEndAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return a.startAt.getTime() < bEnd && b.startAt.getTime() < aEnd;
}
