import type { Request } from 'express';

/** Adresse IP cliente (X-Forwarded-For pris en compte selon TRUST_PROXY). */
export function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

/**
 * Même règle que req.ip, pour une connexion temps réel (Socket.IO ignore TRUST_PROXY) : on remonte X-Forwarded-For de
 * droite à gauche tant que l'adresse est celle d'un proxy de confiance.
 */
export function forwardedAddress(
  peer: string,
  forwardedFor: string | undefined,
  trust: (address: string, hop: number) => boolean,
): string | null {
  const forwarded = (forwardedFor ?? '').split(',').map((address) => address.trim()).filter(Boolean);
  const chain = [peer, ...forwarded.reverse()];
  let hop = 0;
  while (hop < chain.length - 1 && trust(chain[hop], hop)) hop += 1;
  return chain[hop] || null;
}

/** Chemin de la requête, sans la chaîne de requête (jamais journalisée). */
export function requestPath(req: Request): string {
  return (req.originalUrl ?? req.url).split('?')[0];
}
