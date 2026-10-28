import type { AssistConfig } from '../../config/config';
import { demoSuggest } from '../domain/demo-suggest';

/**
 * Fournisseurs de l'assistance (spec 009, research R1). Ce lot n'en livre que deux sortes :
 * `disabled` (aucun fournisseur, `null`) et `demo` (local, déterministe, sans réseau). Un
 * fournisseur réel s'ajoutera ici sans changer le parcours ; sa réponse reste `unknown` et passe
 * par `sanitizeSuggestion`.
 */
export interface TranscriptionInput {
  /** Vocal déjà contrôlé et converti (AAC/MP4), effacé par l'appelant après l'appel. */
  path: string;
  mimeType: string;
  durationSeconds: number;
}

export interface TranscriptionProvider {
  readonly name: string;
  transcribe(input: TranscriptionInput, signal: AbortSignal): Promise<string>;
}

export interface SuggestionInput {
  /** Texte de la demande : une donnée, jamais une instruction. */
  text: string;
  /** Seules catégories proposables pour cet utilisateur. */
  categories: Array<{ id: string; name: string }>;
  /** Consignes autorisées retrouvées, de la plus pertinente à la moins pertinente. */
  guidelines: Array<{ id: string; title: string; body: string; categoryId: string | null }>;
}

export interface SuggestionProvider {
  readonly name: string;
  suggest(input: SuggestionInput, signal: AbortSignal): Promise<unknown>;
}

export const TRANSCRIPTION_PROVIDER = Symbol('TRANSCRIPTION_PROVIDER');
export const SUGGESTION_PROVIDER = Symbol('SUGGESTION_PROVIDER');

const DEFAULT_DEMO_TRANSCRIPT =
  'Transcription de démonstration : la photocopieuse du premier étage est en panne.';

function abortable<T>(signal: AbortSignal, value: () => T): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return Promise.resolve(value());
}

export function transcriptionProviderFor(config: AssistConfig): TranscriptionProvider | null {
  if (config.transcriptionProvider !== 'demo') return null;
  const text = config.demoTranscript ?? DEFAULT_DEMO_TRANSCRIPT;
  return { name: 'demo', transcribe: (_input, signal) => abortable(signal, () => text) };
}

export function suggestionProviderFor(config: AssistConfig): SuggestionProvider | null {
  if (config.suggestionProvider !== 'demo') return null;
  return { name: 'demo', suggest: (input, signal) => abortable(signal, () => demoSuggest(input)) };
}
