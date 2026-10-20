import type { RequestStatus } from '@prisma/client';

/**
 * Rattachement d'une déclaration de classe vide (data-model §6, FR-015d à FR-015g). Pur : le service
 * fournit les affectations de la classe ; la fonction décide de l'issue sans rien modifier.
 */

export type DeclarationOutcome = 'CREATED' | 'ATTACHED' | 'ALREADY_ASSIGNED' | 'SUPPORT' | 'MERGE_PROPOSED';

export type DeclarationResolution = { outcome: 'CREATED' } | { outcome: Exclude<DeclarationOutcome, 'CREATED'>; targetId: string };

export interface ExistingCoverage {
  id: string;
  status: RequestStatus;
  teacherId: string | null;
  startAt: Date;
  /** Fin prévue ; `null` : jusqu'à la clôture. */
  plannedEndAt: Date | null;
}

export interface Declaration {
  /** Enseignant indiqué par le surveillant ; facultatif, jamais bloquant (FR-015a). */
  teacherId: string | null;
  /** `[maintenant, fin de journée)` dans le fuseau de l'école. */
  window: { startAt: Date; plannedEndAt: Date };
}

const ON_SITE: readonly RequestStatus[] = ['ON_DUTY', 'RELIEF_PENDING'];
const ASSIGNED: readonly RequestStatus[] = ['ACCEPTED', 'EN_ROUTE', 'LATE'];
const OPEN: readonly RequestStatus[] = ['PENDING', ...ASSIGNED];

function overlaps(c: ExistingCoverage, window: Declaration['window']): boolean {
  return c.startAt < window.plannedEndAt && (c.plannedEndAt === null || c.plannedEndAt > window.startAt);
}

export function resolveDeclaration(declaration: Declaration, existing: readonly ExistingCoverage[]): DeclarationResolution {
  const candidates = existing
    .filter((c) => overlaps(c, declaration.window))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || a.id.localeCompare(b.id));

  // Un surveillant est déjà sur place : le déclarant vient en renfort (FR-015f).
  const onSite = candidates.find((c) => ON_SITE.includes(c.status));
  if (onSite) return { outcome: 'SUPPORT', targetId: onSite.id };

  const open = candidates.filter((c) => OPEN.includes(c.status));
  if (declaration.teacherId === null) {
    // Sans enseignant, pas de rattachement automatique : proposition à l'admin (FR-015g).
    return open.length > 0 ? { outcome: 'MERGE_PROPOSED', targetId: open[0].id } : { outcome: 'CREATED' };
  }
  const own = open.find((c) => c.teacherId === declaration.teacherId);
  if (!own) return { outcome: 'CREATED' };
  // En attente : la demande passe « en cours » avec le déclarant (FR-015d) ; assignée : inchangée (FR-015e).
  return own.status === 'PENDING' ? { outcome: 'ATTACHED', targetId: own.id } : { outcome: 'ALREADY_ASSIGNED', targetId: own.id };
}
