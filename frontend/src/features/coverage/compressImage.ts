/** Côté long maximal envoyé au serveur (qui ré-encode de toute façon et retire l'EXIF). */
const MAX_SIDE = 1600;
const QUALITY = 0.8;

/**
 * Compression côté client avant l'envoi (réseau mobile) : redimensionne et ré-encode en JPEG.
 * En cas d'échec (format non décodable par le navigateur), le fichier d'origine est envoyé tel quel :
 * le serveur reste seul juge du format et de la taille.
 */
export async function compressImage(file: File): Promise<{ blob: Blob; name: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas');
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob || blob.size >= file.size) return { blob: file, name: file.name };
    return { blob, name: file.name.replace(/\.[^.]*$/, '') + '.jpg' };
  } catch {
    return { blob: file, name: file.name };
  }
}
