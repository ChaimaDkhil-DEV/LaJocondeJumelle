import { readFile } from 'node:fs/promises';
import type { AssistConfig } from '../../config/config';
import type { TranscriptionProvider } from './assist-providers';

type WhisperConfig = NonNullable<AssistConfig['whisper']>;

/**
 * Connecteur de transcription vers le serveur Whisper de l'établissement (spec 010, research R5) :
 * interface compatible OpenAI (`POST /v1/audio/transcriptions`) exposée par les serveurs courants.
 * L'audio ne quitte pas l'infrastructure de l'école. Les erreurs ne citent ni l'adresse, ni la clé,
 * ni la réponse du serveur : elles deviennent « indisponible » côté utilisateur.
 */
export function whisperTranscriptionProvider(config: WhisperConfig, fetchImpl: typeof fetch = fetch): TranscriptionProvider {
  const endpoint = `${config.url.replace(/\/+$/, '')}/v1/audio/transcriptions`;
  return {
    name: 'whisper',
    async transcribe(input, signal) {
      const form = new FormData();
      form.append('file', new Blob([await readFile(input.path)], { type: input.mimeType }), 'message-vocal.m4a');
      form.append('model', config.model);
      form.append('language', 'fr');
      form.append('response_format', 'json');

      const headers = new Headers();
      if (config.apiKey) headers.set('Authorization', `Bearer ${config.apiKey}`);

      const response = await fetchImpl(endpoint, { method: 'POST', body: form, headers, signal });
      if (!response.ok) throw new Error(`Transcription refusée par le serveur (statut ${response.status})`);
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new Error('Réponse de transcription illisible');
      }
      const text = (body as { text?: unknown } | null)?.text;
      if (typeof text !== 'string') throw new Error('Réponse de transcription sans texte');
      return text;
    },
  };
}
