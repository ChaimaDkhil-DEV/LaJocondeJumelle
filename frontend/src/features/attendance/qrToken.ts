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

/**
 * Classe d'un jeton de QR de classe (`c1.<classId>.<version>.<signature>`, 013). Simple commodité pour
 * envoyer la déclaration sans requête préalable : le serveur revérifie la signature, la version en cours
 * et la classe (backend/src/coverage/domain/qr-token.ts). Prend un jeton, jamais un lien : passer d'abord
 * par tokenFromScan.
 */
export function classIdFromToken(token: string): string | null {
  const match = /^c1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.\d{1,9}\.[\w-]+$/i.exec(token.trim());
  return match ? match[1].toLowerCase() : null;
}
