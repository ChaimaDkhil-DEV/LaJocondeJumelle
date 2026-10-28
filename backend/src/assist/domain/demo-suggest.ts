import type { Priority } from '@prisma/client';
import { SUGGESTION_LIMITS } from './sanitize-suggestion';

/**
 * Propositions de démonstration (spec 009, research R2) : déterministes, locales, sans réseau.
 * Elles prouvent le parcours (consignes citées, catégorie et priorité bornées), pas la qualité
 * d'un modèle. Le texte est lu comme une donnée : aucune instruction qu'il contient n'est suivie,
 * et seules les catégories transmises peuvent être proposées.
 */
export interface DemoSuggestInput {
  text: string;
  categories: ReadonlyArray<{ id: string; name: string }>;
  /** Consignes retrouvées, de la plus pertinente à la moins pertinente. */
  guidelines: ReadonlyArray<{ id: string; title: string; body: string; categoryId: string | null }>;
}

export interface DemoSuggestion {
  title?: string;
  categoryId?: string;
  priority?: Priority;
  reason?: string;
  missing: string[];
  sourceIds: string[];
}

const PRIORITY_WORDS: Record<string, Priority> = { normale: 'NORMAL', moyenne: 'MEDIUM', haute: 'HIGH', urgente: 'URGENT' };
const PRIORITY_LINE = /priorit[ée]\s*:\s*(normale|moyenne|haute|urgente)/i;
const MIN_WORDS = 4;

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function words(text: string): string[] {
  return normalize(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function firstSentence(text: string): string | undefined {
  const sentence = text
    .split(/[.!?\n]/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .find(Boolean);
  if (!sentence) return undefined;
  if (sentence.length <= SUGGESTION_LIMITS.title) return sentence;
  const cut = sentence.slice(0, SUGGESTION_LIMITS.title + 1);
  return cut.slice(0, cut.lastIndexOf(' ')).trim() || sentence.slice(0, SUGGESTION_LIMITS.title);
}

export function demoSuggest({ text, categories, guidelines }: DemoSuggestInput): DemoSuggestion {
  const textWords = words(text);
  const result: DemoSuggestion = {
    missing: textWords.length < MIN_WORDS ? ['Décrivez le besoin en quelques mots.'] : [],
    sourceIds: [],
  };
  if (textWords.length === 0) return result;

  const allowed = new Set(categories.map((c) => c.id));
  const used = (id: string) => {
    if (!result.sourceIds.includes(id)) result.sourceIds.push(id);
  };

  const byGuideline = guidelines.find((g) => g.categoryId !== null && allowed.has(g.categoryId));
  if (byGuideline) {
    result.categoryId = byGuideline.categoryId!;
    result.reason = `D’après la consigne « ${byGuideline.title} ».`;
    used(byGuideline.id);
  } else {
    const present = new Set(textWords);
    const byName = categories.find((c) => words(c.name).some((w) => w.length >= 4 && present.has(w)));
    if (byName) {
      result.categoryId = byName.id;
      result.reason = `D’après le nom de la catégorie « ${byName.name} ».`;
    }
  }

  // Priorité : consignes de la catégorie retenue d'abord, puis consignes générales, dans l'ordre.
  const related = guidelines.filter((g) => g.categoryId === null || g.categoryId === result.categoryId);
  const ordered = [...related.filter((g) => g.categoryId !== null), ...related.filter((g) => g.categoryId === null)];
  const withPriority = ordered.find((g) => PRIORITY_LINE.test(g.body));
  if (withPriority) {
    result.priority = PRIORITY_WORDS[PRIORITY_LINE.exec(withPriority.body)![1].toLowerCase()];
    used(withPriority.id);
  } else if (textWords.some((w) => w.startsWith('urgent'))) {
    result.priority = 'URGENT';
  }

  const title = firstSentence(text);
  if (title) result.title = title;
  return result;
}
