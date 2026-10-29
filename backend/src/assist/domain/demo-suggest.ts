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

/** Formules d'appel et d'introduction d'un message vocal : elles ne disent rien du besoin. */
const OPENERS =
  /^(?:(?:bonjour|bonsoir|salut|all[oô]|oui|alors|euh|bon|voil[aà]|donc|madame|monsieur|mesdames|messieurs)(?=[\s,;:!.-]|$)[\s,;:!.-]*)+/i;
const INTRO =
  /^(?:je vous (?:appelle|contacte|[ée]cris|laisse (?:un|ce) message)\s*(?:parce que|car|pour (?:vous )?(?:signaler|dire|indiquer|pr[ée]venir) que|pour)?|je (?:voulais|voudrais|souhaite|souhaitais) (?:vous )?(?:signaler|dire|indiquer|pr[ée]venir) que|c[’']est pour (?:vous )?(?:signaler|dire) que)\s*/i;

function cleanSentence(sentence: string): string {
  const text = sentence.replace(/\s+/g, ' ').trim().replace(OPENERS, '').replace(INTRO, '').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Titre : première phrase qui exprime le besoin, sans formule d'appel ni d'introduction, coupée sur
 * un mot. Rien n'est ajouté au texte : le titre ne reprend que des mots prononcés ou écrits.
 */
function firstSentence(text: string): string | undefined {
  const sentence = text
    .split(/[.!?\n]/)
    .map(cleanSentence)
    .find((s) => words(s).length >= 2);
  if (!sentence) return undefined;
  if (sentence.length <= SUGGESTION_LIMITS.title) return sentence;
  const cut = sentence.slice(0, SUGGESTION_LIMITS.title + 1);
  return cut.slice(0, cut.lastIndexOf(' ')).trim() || sentence.slice(0, SUGGESTION_LIMITS.title);
}

/**
 * Priorité d'après les faits exprimés, jamais d'après le ton : un danger rend la demande urgente ;
 * une échéance immédiate qui touche les cours ou le fonctionnement la rend haute (urgente si la
 * personne la dit urgente) ; « urgent » seul ou un impact sans échéance donnent « Moyenne ». Le
 * mécontentement (« inadmissible », « encore ») ne change rien.
 */
const DANGER = {
  words: ['feu', 'gaz', 'fumee', 'danger', 'dangereux', 'dangereuse'],
  stems: ['fuite', 'inond', 'incendi', 'electrocut', 'etincel', 'bless', 'evacu'],
};
const IMPACT = {
  words: ['cours', 'classe', 'classes', 'examen', 'examens', 'controle', 'controles', 'reunion', 'impossible', 'panne', 'coupure'],
  stems: ['eleve', 'evaluation', 'bloqu', 'empech'],
};
/** Expressions comparées au texte normalisé, mots entourés d'espaces. */
const SOON = ['aujourd hui', 'ce matin', 'cet apres midi', 'ce soir', 'maintenant', 'immediatement', 'tout de suite', 'demain', 'des que possible'];
const STOPPED = ['ne fonctionne plus', 'ne marche plus', 'ne fonctionne pas', 'ne marche pas', 'hors service', 'plus de connexion', 'plus d internet'];

function factualPriority(textWords: string[]): { priority: Priority; reason: string; danger: boolean } | null {
  const flat = ` ${textWords.join(' ')} `;
  const has = ({ words: exact, stems }: { words: string[]; stems: string[] }) =>
    textWords.some((w) => exact.includes(w) || stems.some((s) => w.startsWith(s)));
  const says = (phrases: string[]) => phrases.some((p) => flat.includes(` ${p} `));
  if (has(DANGER)) return { priority: 'URGENT', reason: 'Priorité Urgente : un risque pour la sécurité est signalé.', danger: true };
  const soon = says(SOON);
  const impact = has(IMPACT) || says(STOPPED);
  const saidUrgent = textWords.some((w) => w.startsWith('urgen'));
  if (soon && impact) {
    return saidUrgent
      ? { priority: 'URGENT', reason: 'Priorité Urgente : besoin immédiat qui bloque l’activité.', danger: false }
      : { priority: 'HIGH', reason: 'Priorité Haute : échéance proche et impact sur l’activité.', danger: false };
  }
  if (impact || saidUrgent) {
    return { priority: 'MEDIUM', reason: 'Priorité Moyenne : gêne signalée, sans échéance immédiate.', danger: false };
  }
  return null;
}

function appendReason(current: string | undefined, sentence: string): string {
  return current ? `${current} ${sentence}` : sentence;
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
    const byName = categories.filter((c) => words(c.name).some((w) => w.length >= 4 && present.has(w)));
    if (byName.length === 1) {
      result.categoryId = byName[0].id;
      result.reason = `D’après le nom de la catégorie « ${byName[0].name} ».`;
    } else if (byName.length > 1) {
      // Plusieurs catégories plausibles : aucune n'est choisie arbitrairement.
      const names = byName
        .slice(0, 3)
        .map((c) => `« ${c.name} »`)
        .join(', ');
      const ask = `Plusieurs catégories sont possibles (${names}) : choisissez-la.`;
      result.missing.push(ask.length <= SUGGESTION_LIMITS.missingItem ? ask : 'Plusieurs catégories sont possibles : choisissez-la.');
    }
  }

  // Priorité : consignes de la catégorie retenue d'abord, puis consignes générales, dans l'ordre.
  const related = guidelines.filter((g) => g.categoryId === null || g.categoryId === result.categoryId);
  const ordered = [...related.filter((g) => g.categoryId !== null), ...related.filter((g) => g.categoryId === null)];
  const withPriority = ordered.find((g) => PRIORITY_LINE.test(g.body));
  const facts = factualPriority(textWords);
  if (withPriority) {
    result.priority = PRIORITY_WORDS[PRIORITY_LINE.exec(withPriority.body)![1].toLowerCase()];
    used(withPriority.id);
    // La consigne fixe la priorité ; seul un danger signalé la relève.
    if (facts?.danger && result.priority !== 'URGENT') {
      result.priority = 'URGENT';
      result.reason = appendReason(result.reason, facts.reason);
    }
  } else if (facts) {
    result.priority = facts.priority;
    result.reason = appendReason(result.reason, facts.reason);
  }

  const title = firstSentence(text);
  if (title) result.title = title;
  return result;
}
