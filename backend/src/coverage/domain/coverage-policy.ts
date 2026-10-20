import type { CoverageSource, Role } from '@prisma/client';
import { endOfLocalDay } from '../../common/school-time';
import { schoolTimezoneFromEnv } from '../../config/config';
import {
  availableCoverageActions,
  type CoverageAction,
  type CoverageActor,
  type CoverageMachineState,
} from './coverage-state-machine';

/**
 * Politique d'accès du module des affectations (fonctions pures, appliquées côté serveur à chaque
 * route, aux fichiers et aux listes) — matrice « Permissions par rôle » de plan.md (004) :
 * - admin et super administrateur : tout le module, vue complète, gestion ;
 * - surveillant (groupe Surveillants) : ses affectations et ses renforts, sans le motif ;
 * - enseignant (groupe Enseignants) : ses demandes ;
 * - autres employés : rien (404, FR-023b).
 * Les groupes sont repérés par clé système (R7), jamais par nom.
 */

export interface CoverageViewer {
  id: string;
  role: Role;
  active: boolean;
  /** Membre du groupe à clé `TEACHERS`. */
  isTeacher: boolean;
  /** Membre du groupe à clé `SUPERVISORS`. */
  isSupervisor: boolean;
}

export interface CoverageFacts extends CoverageMachineState {
  requesterId: string;
  source: CoverageSource | null;
  /** Surveillants en renfort actif sur l'affectation. */
  supportUserIds: ReadonlySet<string>;
}

/** Vue d'une affectation : complète, surveillant (sans motif) ou enseignant auteur. */
export type CoverageView = 'ADMIN' | 'SUPERVISOR' | 'TEACHER';

export interface ModuleCapabilities {
  view: boolean;
  /** Signaler un retard ou une absence. */
  report: boolean;
  declareEmptyClass: boolean;
  /** Assigner, réassigner, annuler, créer en direct, décider fusions et renforts. */
  manage: boolean;
  stats: boolean;
  /** Étages, rattachement des classes, étage d'un surveillant, réglages. */
  configure: boolean;
  /** Peut recevoir une affectation. */
  assignable: boolean;
}

/** Admin du module : rôle ADMIN ou SUPER_ADMIN, compte actif (R9). */
export function isCoverageAdmin(user: Pick<CoverageViewer, 'role' | 'active'>): boolean {
  return user.active && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN');
}

/** Éligibilité à une affectation : membre actif du groupe Surveillants (R7, FR-004b). */
export function isEligibleAssignee(user: Pick<CoverageViewer, 'active' | 'isSupervisor'>): boolean {
  return user.active && user.isSupervisor;
}

export function moduleCapabilities(user: CoverageViewer): ModuleCapabilities {
  const admin = isCoverageAdmin(user);
  const superAdmin = user.active && user.role === 'SUPER_ADMIN';
  const teacher = user.active && user.isTeacher;
  const supervisor = user.active && user.isSupervisor;
  return {
    view: admin || teacher || supervisor,
    report: superAdmin || teacher,
    declareEmptyClass: superAdmin || supervisor,
    manage: admin,
    stats: admin,
    configure: superAdmin,
    assignable: isEligibleAssignee(user),
  };
}

export function coverageActors(user: CoverageViewer, facts: CoverageFacts): CoverageActor[] {
  if (!user.active) return [];
  const actors: CoverageActor[] = [];
  if (isCoverageAdmin(user)) actors.push('ADMIN');
  if (facts.assigneeId !== null && facts.assigneeId === user.id) actors.push('ASSIGNEE');
  if (facts.supportUserIds.has(user.id)) actors.push('SUPPORT');
  if (facts.source === 'TEACHER_REQUEST' && facts.requesterId === user.id) actors.push('REQUESTER_TEACHER');
  if (user.isSupervisor) actors.push('SUPERVISOR');
  return actors;
}

export function coverageView(user: CoverageViewer, facts: CoverageFacts): CoverageView | null {
  const actors = coverageActors(user, facts);
  if (actors.includes('ADMIN')) return 'ADMIN';
  if (actors.includes('ASSIGNEE') || actors.includes('SUPPORT')) return 'SUPERVISOR';
  if (actors.includes('REQUESTER_TEACHER')) return 'TEACHER';
  return null;
}

/** Motif détaillé : admin, super administrateur et enseignant auteur ; jamais le surveillant (FR-023c). */
export function canSeeReason(user: CoverageViewer, facts: CoverageFacts): boolean {
  const actors = coverageActors(user, facts);
  return actors.includes('ADMIN') || actors.includes('REQUESTER_TEACHER');
}

/** Photo de preuve : l'employé qui l'a prise, l'admin et le super administrateur. */
export function canReadPresenceProof(user: CoverageViewer, facts: CoverageFacts, uploaderId: string): boolean {
  if (!user.active) return false;
  return uploaderId === user.id || coverageActors(user, facts).includes('ADMIN');
}

export function coverageActionsFor(user: CoverageViewer, facts: CoverageFacts): CoverageAction[] {
  if (!coverageView(user, facts)) return [];
  return availableCoverageActions(facts, coverageActors(user, facts));
}

/** Créneau [début, fin) ; fin null = inconnue (jusqu'à l'arrivée de l'enseignant ou la relève). */
export interface Slot {
  startAt: Date;
  plannedEndAt: Date | null;
}

/** Fin d'un créneau ; inconnue : fin de la journée locale de l'école (FR-016a, comme les rappels). */
export function slotEnd(slot: Slot, timeZone = schoolTimezoneFromEnv()): Date {
  return slot.plannedEndAt ?? endOfLocalDay(slot.startAt, timeZone);
}

export function slotsOverlap(a: Slot, b: Slot, timeZone = schoolTimezoneFromEnv()): boolean {
  return a.startAt < slotEnd(b, timeZone) && b.startAt < slotEnd(a, timeZone);
}

/** Instant présent, pour « disponible maintenant » (équipe, tableaux de bord). */
export function nowSlot(now = new Date()): Slot {
  return { startAt: now, plannedEndAt: new Date(now.getTime() + 1) };
}
