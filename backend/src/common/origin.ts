/** Origine (schéma, hôte, port) d'une URL, ou null si la valeur est absente ou invalide. */
function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Règle d'origine unique (FR-006), pour les requêtes HTTP modifiantes et les connexions temps
 * réel : l'en-tête Origin doit valoir une origine autorisée (celle de l'application, voir
 * AppConfig.allowedOrigins). Le Referer ne sert, à défaut d'Origin valide, que si l'appelant
 * l'autorise (requêtes HTTP).
 */
export function isAllowedOrigin(
  headers: { origin?: string; referer?: string },
  allowed: string | readonly string[],
  options: { allowReferer?: boolean } = {},
): boolean {
  const origin = originOf(headers.origin) ?? (options.allowReferer ? originOf(headers.referer) : null);
  if (origin === null) return false;
  return typeof allowed === 'string' ? origin === allowed : allowed.includes(origin);
}
