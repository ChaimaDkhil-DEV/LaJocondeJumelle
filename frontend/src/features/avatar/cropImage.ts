/**
 * Recadrage carré d'une photo de profil, sans bibliothèque : géométrie pure (testable) et rendu
 * sur un canvas. L'image couvre toujours toute la zone de recadrage (aucun bord vide).
 */

/** Côté de l'image envoyée, en pixels (le serveur la ré-encode aussi en 256 × 256). */
export const OUTPUT_SIZE = 256;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

/** Formats et poids acceptés, identiques au serveur. */
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_BYTES = 2 * 1024 * 1024;

export interface Crop {
  /** Position du coin haut gauche de l'image dans la zone, en px (≤ 0). */
  x: number;
  y: number;
  zoom: number;
}

/** Message d'erreur d'un fichier refusé avant tout envoi ; null s'il est acceptable. */
export function validateFile(file: { type: string; size: number }): string | null {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return 'Formats acceptés : JPG, PNG ou WebP.';
  if (file.size > MAX_BYTES) return 'La photo ne doit pas dépasser 2 Mo.';
  return null;
}

/** Échelle (px affichés par px d'image) pour une zone de côté `view` et un zoom donné. */
export function scaleOf(width: number, height: number, view: number, zoom: number): number {
  return (view / Math.min(width, height)) * zoom;
}

/** Garde l'image sur toute la zone : aucun bord vide visible. */
export function clampCrop(crop: Crop, width: number, height: number, view: number): Crop {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, crop.zoom));
  const scale = scaleOf(width, height, view, zoom);
  const clamp = (value: number, size: number) => Math.min(0, Math.max(view - size * scale, value));
  return { zoom, x: clamp(crop.x, width), y: clamp(crop.y, height) };
}

/** Recadrage initial : image centrée, sans zoom. */
export function centeredCrop(width: number, height: number, view: number): Crop {
  const scale = scaleOf(width, height, view, 1);
  return { zoom: 1, x: (view - width * scale) / 2, y: (view - height * scale) / 2 };
}

/** Nouveau zoom autour du centre de la zone (le sujet centré reste centré). */
export function zoomCrop(crop: Crop, zoom: number, width: number, height: number, view: number): Crop {
  const before = scaleOf(width, height, view, crop.zoom);
  const after = scaleOf(width, height, view, zoom);
  const cx = (view / 2 - crop.x) / before;
  const cy = (view / 2 - crop.y) / before;
  return clampCrop({ zoom, x: view / 2 - cx * after, y: view / 2 - cy * after }, width, height, view);
}

/** Zone de l'image d'origine (px) correspondant au cadre visible. */
export function sourceRect(crop: Crop, width: number, height: number, view: number) {
  const scale = scaleOf(width, height, view, crop.zoom);
  return { sx: -crop.x / scale, sy: -crop.y / scale, size: view / scale };
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Image non produite'))), 'image/png'),
  );
}

function canvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const element = document.createElement('canvas');
  element.width = OUTPUT_SIZE;
  element.height = OUTPUT_SIZE;
  const ctx = element.getContext('2d');
  if (!ctx) throw new Error('Votre navigateur ne permet pas de préparer l’image.');
  ctx.imageSmoothingQuality = 'high';
  return { canvas: element, ctx };
}

/** Image recadrée, carrée, 256 × 256 (PNG : format lu partout, le serveur la convertit). */
export async function renderCrop(image: HTMLImageElement, crop: Crop, view: number): Promise<Blob> {
  const { canvas: element, ctx } = canvas();
  const { sx, sy, size } = sourceRect(crop, image.naturalWidth, image.naturalHeight, view);
  ctx.drawImage(image, sx, sy, size, size, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  return toBlob(element);
}

/** Image d'une adresse (avatar prédéfini SVG) convertie en PNG 256 × 256. */
export async function renderUri(uri: string): Promise<Blob> {
  const image = new Image();
  image.src = uri;
  await image.decode();
  const { canvas: element, ctx } = canvas();
  ctx.drawImage(image, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  return toBlob(element);
}
