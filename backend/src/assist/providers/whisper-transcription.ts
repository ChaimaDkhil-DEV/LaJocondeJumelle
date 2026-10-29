import { readFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { AssistConfig } from '../../config/config';
import type { TranscriptionProvider } from './assist-providers';

type WhisperConfig = NonNullable<AssistConfig['whisper']>;

/** Requête préparée pour le serveur de transcription (corps multipart déjà encodé). */
export interface WhisperRequest {
  url: URL;
  headers: Record<string, string>;
  body: Buffer;
  signal: AbortSignal;
  /** Certificat d'autorité supplémentaire (autorité interne de Caddy) ; absent : autorités système. */
  ca?: string;
}

export interface WhisperResponse {
  status: number;
  text: string;
}

export type WhisperTransport = (request: WhisperRequest) => Promise<WhisperResponse>;

/**
 * Transport natif de Node (http/https) : contrairement à `fetch`, il accepte une autorité de
 * certification par requête, sans nouvelle dépendance. La vérification TLS n'est jamais désactivée.
 */
export const nodeTransport: WhisperTransport = ({ url, headers, body, signal, ca }) =>
  new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(url, { method: 'POST', headers, signal, ...(ca ? { ca } : {}) }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(body);
  });

/** Encode le formulaire multipart (même encodage que fetch) : corps et en-tête de type. */
async function encode(form: FormData): Promise<{ body: Buffer; contentType: string }> {
  const encoded = new Request('http://multipart.local', { method: 'POST', body: form });
  return { body: Buffer.from(await encoded.arrayBuffer()), contentType: encoded.headers.get('content-type')! };
}

/**
 * Connecteur de transcription vers le serveur Whisper de l'établissement (spec 010, research R5) :
 * interface compatible OpenAI (`POST /v1/audio/transcriptions`) exposée par les serveurs courants.
 * L'audio ne quitte pas l'infrastructure de l'école. En production, le serveur est joint en HTTPS
 * par Caddy (research R11) : le certificat de son autorité interne est relu à chaque appel, car il
 * n'existe pas encore au premier démarrage de l'API. Les erreurs ne citent ni l'adresse, ni la clé,
 * ni le chemin du certificat, ni la réponse du serveur.
 */
export function whisperTranscriptionProvider(config: WhisperConfig, transport: WhisperTransport = nodeTransport): TranscriptionProvider {
  const url = new URL(`${config.url.replace(/\/+$/, '')}/v1/audio/transcriptions`);
  return {
    name: 'whisper',
    async transcribe(input, signal) {
      let ca: string | undefined;
      if (config.caFile) {
        try {
          ca = await readFile(config.caFile, 'utf8');
        } catch {
          throw new Error('Certificat du serveur de transcription illisible');
        }
      }

      const form = new FormData();
      form.append('file', new Blob([await readFile(input.path)], { type: input.mimeType }), 'message-vocal.m4a');
      form.append('model', config.model);
      form.append('language', 'fr');
      form.append('response_format', 'json');
      const { body, contentType } = await encode(form);

      const headers: Record<string, string> = { 'content-type': contentType, 'content-length': String(body.length) };
      if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

      const response = await transport({ url, headers, body, signal, ...(ca ? { ca } : {}) });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Transcription refusée par le serveur (statut ${response.status})`);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(response.text);
      } catch {
        throw new Error('Réponse de transcription illisible');
      }
      const text = (parsed as { text?: unknown } | null)?.text;
      if (typeof text !== 'string') throw new Error('Réponse de transcription sans texte');
      return text;
    },
  };
}
