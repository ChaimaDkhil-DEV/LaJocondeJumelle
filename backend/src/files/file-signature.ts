/**
 * Détection du type réel d'un fichier par ses octets magiques (research R3).
 * Liste volontairement limitée aux formats que l'application accepte ou refuse explicitement.
 */
export type DetectedMime =
  | 'audio/webm'
  | 'audio/ogg'
  | 'audio/mp4'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/heic'
  | 'application/pdf';

/** Conteneurs audio acceptés pour un vocal (le contenu est ensuite vérifié par ffprobe). */
export const VOICE_CONTAINERS: readonly DetectedMime[] = ['audio/webm', 'audio/ogg', 'audio/mp4'];

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

function startsWith(buffer: Buffer, bytes: readonly number[], offset = 0): boolean {
  return buffer.length >= offset + bytes.length && bytes.every((b, i) => buffer[offset + i] === b);
}

function ascii(buffer: Buffer, start: number, end: number): string {
  return buffer.length >= end ? buffer.toString('latin1', start, end) : '';
}

export function detectFileType(buffer: Buffer): DetectedMime | null {
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return 'audio/webm'; // EBML (WebM/Matroska)
  if (ascii(buffer, 0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(buffer, 4, 8) === 'ftyp') {
    return HEIC_BRANDS.has(ascii(buffer, 8, 12)) ? 'image/heic' : 'audio/mp4';
  }
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WEBP') return 'image/webp';
  if (ascii(buffer, 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}
