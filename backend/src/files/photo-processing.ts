import { open, readFile, rm, stat } from 'node:fs/promises';
import sharp from 'sharp';
import { AppException } from '../common/errors';
import { detectFileType } from './file-signature';

/** Côté long maximal d'une photo enregistrée, en pixels. */
export const PHOTO_MAX_SIDE = 2560;
const JPEG_QUALITY = 85;

export interface PhotoProcessingOptions {
  /** Types MIME acceptés (réglage allowedPhotoTypes). */
  allowedTypes: readonly string[];
}

export interface ProcessedPhoto {
  path: string;
  mimeType: 'image/jpeg';
  sizeBytes: number;
  width: number;
  height: number;
}

async function readHead(path: string): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(64);
    const { bytesRead } = await handle.read(buffer, 0, 64, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * Normalise une photo (research R3) : type réel vérifié, orientation EXIF appliquée,
 * toutes les métadonnées supprimées (dont la position GPS — principe IV, minimisation),
 * ré-encodage JPEG qualité 85, côté long ≤ 2560 px. Le fichier d'origine est toujours supprimé.
 */
export async function processPhoto(inputPath: string, options: PhotoProcessingOptions): Promise<ProcessedPhoto> {
  const outputPath = `${inputPath}.jpg`;
  try {
    const detected = detectFileType(await readHead(inputPath));
    if (detected === 'image/heic') {
      throw new AppException(
        'FILE_TYPE_NOT_ALLOWED',
        { detected },
        'Le format HEIC n’est pas accepté. Sur iPhone, choisissez la photo depuis le bouton « Choisir dans la galerie » ' +
          'ou réglez l’appareil photo sur « Le plus compatible ».',
      );
    }
    if (!detected || !options.allowedTypes.includes(detected)) {
      throw new AppException('FILE_TYPE_NOT_ALLOWED', { allowed: options.allowedTypes });
    }

    let info: sharp.OutputInfo;
    try {
      // Lecture en mémoire : sous Windows, libvips garderait sinon le fichier source verrouillé.
      // Sans withMetadata()/keepExif(), sharp n'écrit aucune métadonnée dans le fichier produit.
      info = await sharp(await readFile(inputPath))
        .rotate()
        .resize({ width: PHOTO_MAX_SIDE, height: PHOTO_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toFile(outputPath);
    } catch {
      throw new AppException('FILE_TYPE_NOT_ALLOWED');
    }

    const { size } = await stat(outputPath);
    return { path: outputPath, mimeType: 'image/jpeg', sizeBytes: size, width: info.width, height: info.height };
  } catch (error) {
    await rm(outputPath, { force: true });
    throw error;
  } finally {
    await rm(inputPath, { force: true });
  }
}
