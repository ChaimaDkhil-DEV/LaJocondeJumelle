/**
 * Jeton d'un QR de classe lu par le scanneur de l'application : le QR imprimé encode un lien
 * `…/gardes/presence?c=<jeton>`, mais on accepte aussi le jeton seul (`c1.…`), collé à la main.
 * Retourne null si le texte n'a pas la forme d'un jeton ; sa validité (signature, version) est
 * toujours vérifiée par le serveur.
 */
export function tokenFromScan(text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  try {
    const fromLink = new URL(value).searchParams.get('c');
    if (fromLink && fromLink.startsWith('c1.')) return fromLink;
  } catch {
    // Pas un lien : on essaie le jeton seul.
  }
  return /^c1\.[0-9a-f-]{36}\.\d{1,9}\.[\w-]+$/i.test(value) ? value : null;
}
