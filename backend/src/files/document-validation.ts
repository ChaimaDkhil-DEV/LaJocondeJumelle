import { open } from 'node:fs/promises';
import { AppException } from '../common/errors';
import { detectFileType } from './file-signature';

export interface DocumentValidationOptions {
  /** Types MIME acceptés (réglage allowedDocumentTypes). */
  allowedTypes: readonly string[];
}

const MAX_NAME_LENGTH = 255;

/**
 * Vérifie le type réel d'un document joint (octets magiques, liste blanche). Contrairement aux
 * vocaux et aux photos, le fichier est conservé tel quel.
 */
export async function validateDocument(
  path: string,
  options: DocumentValidationOptions,
): Promise<{ mimeType: string }> {
  const handle = await open(path, 'r');
  let head: Buffer;
  try {
    const buffer = Buffer.alloc(64);
    const { bytesRead } = await handle.read(buffer, 0, 64, 0);
    head = buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
  const detected = detectFileType(head);
  if (!detected || !options.allowedTypes.includes(detected)) {
    throw new AppException('FILE_TYPE_NOT_ALLOWED', { allowed: options.allowedTypes });
  }
  return { mimeType: detected };
}

/** Nom d'origine nettoyé : sans chemin ni caractères de contrôle ou guillemets, 255 caractères au plus. */
export function documentName(originalName: string): string {
  const cleaned = (originalName.split(/[\\/]/).pop() ?? '')
    .replace(/[\p{Cc}"]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'document';
  if (cleaned.length <= MAX_NAME_LENGTH) return cleaned;
  const dot = cleaned.lastIndexOf('.');
  const extension = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : '';
  return cleaned.slice(0, MAX_NAME_LENGTH - extension.length) + extension;
}
