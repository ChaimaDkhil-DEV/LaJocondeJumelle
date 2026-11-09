import jsQR from 'jsqr';

/**
 * Lecture des QR codes visibles dans une image (image de la caméra ou photo). Le lecteur natif du
 * navigateur (BarcodeDetector, Chrome sur Android) est plus rapide et plus tolérant ; ailleurs (Safari,
 * Firefox), jsQR, qui essaie aussi les QR codes aux couleurs inversées.
 */
export interface QrReader {
  /** Textes des QR codes trouvés dans l'image ; liste vide s'il n'y en a pas. */
  read(source: CanvasImageSource, width: number, height: number): Promise<string[]>;
}

/** Côté le plus long de l'image lue par jsQR : une photo de 12 Mpx prendrait plusieurs secondes. */
const MAX_SIDE = 1600;

/** BarcodeDetector n'est pas encore décrit par TypeScript (lib.dom). */
interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
  getSupportedFormats(): Promise<string[]>;
}

async function nativeReader(): Promise<QrReader | null> {
  const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (!Detector) return null;
  try {
    if (!(await Detector.getSupportedFormats()).includes('qr_code')) return null;
    const detector = new Detector({ formats: ['qr_code'] });
    return { read: async (source) => (await detector.detect(source)).map((code) => code.rawValue) };
  } catch {
    return null;
  }
}

function jsQrReader(): QrReader {
  const canvas = document.createElement('canvas');
  return {
    read: async (source, width, height) => {
      const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context || !canvas.width || !canvas.height) return [];
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
      return code ? [code.data] : [];
    },
  };
}

export async function createQrReader(): Promise<QrReader> {
  return (await nativeReader()) ?? jsQrReader();
}

/** Lit les QR codes d'une photo choisie ou prise avec l'appareil photo du téléphone. */
export async function readQrPhoto(file: Blob, reader: QrReader): Promise<string[]> {
  const bitmap = await createImageBitmap(file);
  try {
    return await reader.read(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
