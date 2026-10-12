import { apiFetch } from './client';

export type FileKind = 'VOICE' | 'PHOTO' | 'DOCUMENT';

export interface UploadedFile {
  id: string;
  kind: FileKind;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;
}

/**
 * Téléverse un fichier (POST /api/files). Avec `requestId`, il est rattaché directement à la demande ;
 * sinon il reste provisoire jusqu'à l'envoi de la demande ou du message.
 */
export function uploadFile(kind: FileKind, file: Blob, filename: string, requestId?: string): Promise<UploadedFile> {
  const form = new FormData();
  form.append('kind', kind);
  if (requestId) form.append('requestId', requestId);
  form.append('file', file, filename);
  return apiFetch<UploadedFile>('/api/files', { method: 'POST', body: form });
}
