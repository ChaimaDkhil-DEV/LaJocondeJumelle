import type { Request } from 'express';

/** Adresse IP cliente (X-Forwarded-For pris en compte selon TRUST_PROXY). */
export function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

/** Chemin de la requête, sans la chaîne de requête (jamais journalisée). */
export function requestPath(req: Request): string {
  return (req.originalUrl ?? req.url).split('?')[0];
}
