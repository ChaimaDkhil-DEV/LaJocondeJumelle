import { apiFetch } from '../../api/client';
import type { Priority, RequestStatus } from '../../api/types';
import { extensionFor } from '../voice/recorderFormat';
import type { VoiceRecording } from '../voice/VoiceRecorder';

/** Propositions automatiques (spec 009) : chaque champ est facultatif, rien n'est appliqué sans clic. */
export interface Suggestion {
  title?: string;
  categoryId?: string;
  priority?: Priority;
  reason?: string;
  missing: string[];
}

export interface SuggestionResult {
  suggestion: Suggestion | null;
  sources: Array<{ id: string; title: string; excerpt: string }>;
  noGuideline: boolean;
  /** À joindre à l'envoi de la demande (`assistToken`). */
  token: string | null;
  /** Demandes proches que l'utilisateur peut déjà consulter (spec 010), 3 au plus. */
  similar?: SimilarRequest[];
}

export interface SimilarRequest {
  id: string;
  reference: string;
  title: string;
  categoryName: string;
  priority: Priority;
  status: RequestStatus;
}

export function requestSuggestions(text: string): Promise<SuggestionResult> {
  return apiFetch<SuggestionResult>('/api/assist/suggestions', { method: 'POST', body: { text } });
}

/** Transcription du vocal du formulaire (spec 009, US4) : rien n'est conservé côté serveur. */
export function requestTranscription(voice: VoiceRecording): Promise<{ text: string }> {
  const form = new FormData();
  form.append('file', voice.blob, `message-vocal.${extensionFor(voice.mimeType)}`);
  return apiFetch<{ text: string }>('/api/assist/transcriptions', { method: 'POST', body: form });
}
