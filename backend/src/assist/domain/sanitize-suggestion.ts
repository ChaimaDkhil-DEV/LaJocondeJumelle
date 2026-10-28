import type { Priority } from '@prisma/client';

/**
 * Contrôle d'une réponse de fournisseur (spec 009, FR-005, FR-012, research R3). La réponse est
 * une donnée non fiable : chaque champ est vérifié séparément, tout champ invalide est écarté,
 * les champs inconnus sont ignorés. Aucune valeur hors des listes autorisées ne peut en sortir.
 */
export interface CleanSuggestion {
  title?: string;
  categoryId?: string;
  priority?: Priority;
  reason?: string;
  missing: string[];
  sourceIds: string[];
}

export interface SanitizeResult {
  /** null : aucune proposition fiable (ni titre, ni catégorie, ni priorité valides). */
  suggestion: CleanSuggestion | null;
  /** Nombre de valeurs écartées, pour le journal applicatif (jamais leur contenu). */
  discarded: number;
}

export const SUGGESTION_LIMITS = { title: 120, reason: 500, missing: 3, missingItem: 200 } as const;
const PRIORITIES: readonly Priority[] = ['NORMAL', 'MEDIUM', 'HIGH', 'URGENT'];

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > 0 && text.length <= max ? text : null;
}

export function sanitizeSuggestion(
  raw: unknown,
  allowed: { categoryIds: readonly string[]; sourceIds: readonly string[] },
): SanitizeResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { suggestion: null, discarded: 0 };
  const input = raw as Record<string, unknown>;
  let discarded = 0;
  const out: CleanSuggestion = { missing: [], sourceIds: [] };

  if (input.title !== undefined) {
    const title = cleanText(input.title, SUGGESTION_LIMITS.title);
    if (title) out.title = title;
    else discarded++;
  }
  if (input.categoryId !== undefined) {
    if (typeof input.categoryId === 'string' && allowed.categoryIds.includes(input.categoryId)) {
      out.categoryId = input.categoryId;
    } else discarded++;
  }
  if (input.priority !== undefined) {
    if (typeof input.priority === 'string' && PRIORITIES.includes(input.priority as Priority)) {
      out.priority = input.priority as Priority;
    } else discarded++;
  }
  if (input.reason !== undefined) {
    const reason = cleanText(input.reason, SUGGESTION_LIMITS.reason);
    if (reason) out.reason = reason;
    else discarded++;
  }
  if (input.missing !== undefined) {
    const items = Array.isArray(input.missing) ? input.missing.map((m) => cleanText(m, SUGGESTION_LIMITS.missingItem)) : null;
    if (items && items.length <= SUGGESTION_LIMITS.missing && items.every((m) => m !== null)) {
      out.missing = items as string[];
    } else discarded++;
  }
  if (Array.isArray(input.sourceIds)) {
    for (const id of input.sourceIds) {
      if (typeof id === 'string' && allowed.sourceIds.includes(id)) {
        if (!out.sourceIds.includes(id)) out.sourceIds.push(id);
      } else discarded++;
    }
  } else if (input.sourceIds !== undefined) discarded++;

  const reliable = out.title !== undefined || out.categoryId !== undefined || out.priority !== undefined;
  return { suggestion: reliable ? out : null, discarded };
}
