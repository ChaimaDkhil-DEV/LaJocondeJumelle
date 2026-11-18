import sharp from 'sharp';
import { AppException } from '../common/errors';

/**
 * Plafond de pixels d'une image reçue (audit R14, bombes de décompression) : 60 millions, au-dessus des photos
 * des téléphones actuels (48 à 50 Mpx), bien en dessous du défaut de sharp (268 Mpx, environ 1 Go décodé).
 */
export const IMAGE_MAX_PIXELS = 60_000_000;
/** Décodages d'images simultanés dans le processus : borne la mémoire quand plusieurs envois arrivent ensemble. */
const IMAGE_SLOTS = 2;

let active = 0;
const waiting: Array<() => void> = [];

/** Exécute un traitement d'image dès qu'une place se libère (ordre d'arrivée), puis rend sa place. */
export async function withImageSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= IMAGE_SLOTS) await new Promise<void>((resolve) => waiting.push(resolve));
  else active += 1;
  try {
    return await task();
  } finally {
    const next = waiting.shift();
    // La place passe directement au suivant ; sinon elle se libère.
    if (next) next();
    else active -= 1;
  }
}

/**
 * Ouvre une image avec le plafond de pixels : les dimensions de l'en-tête sont lues d'abord (aucun décodage), une
 * image trop grande est refusée en 413 ; `limitInputPixels` reste une seconde barrière pour un en-tête trompeur.
 */
export async function openImage(input: Buffer): Promise<sharp.Sharp> {
  let width = 0;
  let height = 0;
  try {
    ({ width = 0, height = 0 } = await sharp(input, { limitInputPixels: false }).metadata());
  } catch {
    // En-tête illisible : le décodage qui suit le signalera comme image endommagée.
  }
  if (width * height > IMAGE_MAX_PIXELS) {
    throw new AppException(
      'FILE_TOO_LARGE',
      { maxPixels: IMAGE_MAX_PIXELS },
      'Cette image est trop grande (plus de 60 millions de pixels). Réduisez-la avant de l’envoyer.',
    );
  }
  return sharp(input, { limitInputPixels: IMAGE_MAX_PIXELS });
}
