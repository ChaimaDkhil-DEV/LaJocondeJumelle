import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Jeton du QR code d'une classe : `c1.<classId>.<qrVersion>.<signature>`, signature HMAC-SHA256
 * (clé serveur) non devinable. Incrémenter `qrVersion` révoque tous les QR déjà imprimés.
 * Le jeton n'autorise rien à lui seul : il prouve seulement que l'employé est devant la classe,
 * et la présence n'est validée que par un POST explicite du preneur de la garde.
 */

const PREFIX = 'c1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Clé dédiée, dérivée du secret serveur (une rotation du secret invalide les QR imprimés). */
export function qrKeyFrom(serverSecret: string): Buffer {
  return createHmac('sha256', serverSecret).update('coverage-qr-key/v1').digest();
}

function signature(key: Buffer, classId: string, version: number): string {
  return createHmac('sha256', key).update(`${PREFIX}:${classId.toLowerCase()}:${version}`).digest('base64url');
}

export function signQrToken(key: Buffer, classId: string, version: number): string {
  return `${PREFIX}.${classId.toLowerCase()}.${version}.${signature(key, classId, version)}`;
}

/** Classe et version du jeton si la signature est valide, sinon null (version non vérifiée ici). */
export function verifyQrToken(key: Buffer, token: unknown): { classId: string; version: number } | null {
  if (typeof token !== 'string' || token.length > 200) return null;
  const parts = token.trim().split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  const [, classId, versionText, sig] = parts;
  if (!UUID.test(classId) || !/^\d{1,9}$/.test(versionText)) return null;
  const version = Number(versionText);
  const expected = Buffer.from(signature(key, classId, version));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { classId: classId.toLowerCase(), version };
}
