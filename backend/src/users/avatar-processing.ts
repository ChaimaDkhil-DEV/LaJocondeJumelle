import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { AppException } from '../common/errors';
import { detectFileType, type DetectedMime } from '../files/file-signature';

/** Poids maximal d'une photo envoyée (avant redimensionnement). */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
/** Côté de l'image enregistrée, en pixels (carrée). */
export const AVATAR_SIZE = 256;
/** Types réels acceptés, vérifiés par les octets du fichier (jamais par l'extension). */
export const AVATAR_TYPES: readonly DetectedMime[] = ['image/jpeg', 'image/png', 'image/webp'];

const WEBP_QUALITY = 85;

/**
 * Photo de profil : taille et type réel vérifiés, orientation EXIF appliquée, recadrage carré
 * centré à 256 × 256, ré-encodage WebP sans aucune métadonnée (dont la position GPS). Le contenu
 * envoyé n'est jamais servi tel quel.
 */
export async function processAvatar(inputPath: string, sizeBytes: number): Promise<Buffer> {
  if (sizeBytes > AVATAR_MAX_BYTES) {
    throw new AppException('FILE_TOO_LARGE', { maxBytes: AVATAR_MAX_BYTES }, 'La photo ne doit pas dépasser 2 Mo.');
  }
  const input = await readFile(inputPath);
  const detected = detectFileType(input.subarray(0, 64));
  if (detected === 'image/heic') {
    throw new AppException(
      'FILE_TYPE_NOT_ALLOWED',
      { detected },
      'Le format HEIC n’est pas accepté. Choisissez une photo JPG, PNG ou WebP.',
    );
  }
  if (!detected || !AVATAR_TYPES.includes(detected)) {
    throw new AppException('FILE_TYPE_NOT_ALLOWED', { allowed: AVATAR_TYPES }, 'Formats acceptés : JPG, PNG ou WebP.');
  }
  try {
    // Sans withMetadata()/keepExif(), sharp n'écrit aucune métadonnée dans l'image produite.
    return await sharp(input)
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    throw new AppException('FILE_TYPE_NOT_ALLOWED', { detected }, 'Cette image est illisible ou endommagée. Choisissez une autre photo.');
  }
}
