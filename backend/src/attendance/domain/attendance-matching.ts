import type { AttendanceMethod, AttendanceStatus } from '@prisma/client';

/**
 * Pointage des enseignants : modules purs (aucun accès base), comme coverage/domain. Le service charge
 * les demandes du jour pour la classe scannée et applique le résultat.
 *
 * Il n'existe aucun emploi du temps : l'heure de référence d'un retard ne vient que d'une demande de
 * retard ANNONCÉE par l'enseignant (option b). Sans demande, on enregistre l'arrivée à l'heure du
 * serveur, sans jugement « à l'heure » ni « en retard » : seule une personne peut qualifier.
 * Une absence n'est jamais déduite d'un défaut de scan.
 */

const MINUTE_MS = 60_000;

export type AnnouncedType = 'LATENESS' | 'ABSENCE';

/** Demande d'enseignant (source TEACHER_REQUEST) du jour pour la classe, ni annulée ni fusionnée. */
export interface AnnouncedRequest {
  requestId: string;
  type: AnnouncedType | null;
  /** Enseignant qui a annoncé (titulaire). */
  teacherId: string | null;
  /** Remplaçant autorisé par l'admin pour une absence. */
  substituteTeacherId: string | null;
  startAt: Date;
  /** Fin de la plage annoncée ; null : jusqu'à la fin de la journée. */
  plannedEndAt: Date | null;
}

export type ArrivalMatch =
  | { kind: 'NONE' }
  /** Retard annoncé : minutes écoulées depuis l'heure de début annoncée (jamais négatif). */
  | { kind: 'ANNOUNCED_LATENESS'; requestId: string; lateMinutes: number }
  /** L'enseignant est là alors qu'il a annoncé une absence couvrant ce moment : anomalie pour l'admin. */
  | { kind: 'ANNOUNCED_ABSENCE'; requestId: string }
  /** Remplaçant autorisé : identité du titulaire conservée, présence sous le compte du remplaçant. */
  | { kind: 'SUBSTITUTE'; requestId: string; titularId: string };

/** Demande la plus pertinente : la dernière commencée avant `at`, sinon la première à venir. */
function closest(requests: readonly AnnouncedRequest[], at: Date): AnnouncedRequest | undefined {
  const sorted = [...requests].sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || a.requestId.localeCompare(b.requestId));
  const started = sorted.filter((r) => r.startAt <= at);
  return started.length > 0 ? started[started.length - 1] : sorted[0];
}

/**
 * Rattache une arrivée aux demandes annoncées. `at` : heure serveur du scan (ou heure d'arrivée saisie
 * pour une saisie manuelle). Les demandes concernent déjà la bonne classe et le bon jour.
 */
export function matchArrival(teacherId: string, at: Date, requests: readonly AnnouncedRequest[]): ArrivalMatch {
  // Remplaçant autorisé sur une absence : prioritaire, sa présence n'est pas un retard du titulaire.
  const asSubstitute = closest(
    requests.filter((r) => r.type === 'ABSENCE' && r.substituteTeacherId === teacherId && r.teacherId !== null && r.teacherId !== teacherId),
    at,
  );
  if (asSubstitute) return { kind: 'SUBSTITUTE', requestId: asSubstitute.requestId, titularId: asSubstitute.teacherId! };

  const own = closest(requests.filter((r) => r.teacherId === teacherId && r.type !== null), at);
  if (!own) return { kind: 'NONE' };
  if (own.type === 'LATENESS') {
    return { kind: 'ANNOUNCED_LATENESS', requestId: own.requestId, lateMinutes: Math.max(0, Math.floor((at.getTime() - own.startAt.getTime()) / MINUTE_MS)) };
  }
  // Absence annoncée : contradiction seulement si la plage annoncée n'est pas terminée.
  const stillCovered = own.plannedEndAt === null || at <= own.plannedEndAt;
  return stillCovered ? { kind: 'ANNOUNCED_ABSENCE', requestId: own.requestId } : { kind: 'NONE' };
}

export type ManualStatus = Extract<AttendanceStatus, 'ON_TIME' | 'LATE' | 'ABSENT'>;

export interface CorrectionContext {
  method: AttendanceMethod;
}

/**
 * Règles de correction par la surveillante. Un scan est une preuve de présence : il ne peut pas être
 * contredit par une absence (jamais deux présences contradictoires pour une même journée). L'heure d'une
 * arrivée scannée est celle du serveur : elle ne se modifie pas. Retourne le message de refus, ou null.
 */
export function correctionRefusal(ctx: CorrectionContext, change: { status?: AttendanceStatus; arrivedAtChanged: boolean }): string | null {
  if (change.status === 'ARRIVED') return 'Le statut « arrivée enregistrée » est posé par le scan : choisissez à l’heure, en retard ou absent.';
  if (ctx.method === 'QR' && change.status === 'ABSENT') return 'Un scan valide existe pour cette journée : l’enseignant ne peut pas être marqué absent.';
  if (ctx.method === 'QR' && change.arrivedAtChanged) return 'L’heure d’un scan est celle du serveur : elle ne peut pas être modifiée.';
  return null;
}

export type ClassEventKind = 'EMPTY' | 'ARRIVAL';
export interface ClassEvent {
  at: Date;
  kind: ClassEventKind;
}

/**
 * État courant d'une classe, déduit de sa chronologie : le dernier événement l'emporte. « Classe vide »
 * puis arrivée de l'enseignant donne « occupée » ; les deux événements restent dans l'historique.
 */
export function currentClassState(events: readonly ClassEvent[]): 'EMPTY' | 'OCCUPIED' | null {
  if (events.length === 0) return null;
  const last = [...events].sort((a, b) => a.at.getTime() - b.at.getTime())[events.length - 1];
  return last.kind === 'EMPTY' ? 'EMPTY' : 'OCCUPIED';
}

