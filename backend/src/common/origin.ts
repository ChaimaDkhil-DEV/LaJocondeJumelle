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
 * réel : l'en-tête Origin doit valoir l'origine de l'application. Le Referer ne sert, à défaut
 * d'Origin valide, que si l'appelant l'autorise (requêtes HTTP).
 */
export function isAllowedOrigin(
  headers: { origin?: string; referer?: string },
  appOrigin: string,
  options: { allowReferer?: boolean } = {},
): boolean {
  const origin = originOf(headers.origin) ?? (options.allowReferer ? originOf(headers.referer) : null);
  return origin === appOrigin;
}
