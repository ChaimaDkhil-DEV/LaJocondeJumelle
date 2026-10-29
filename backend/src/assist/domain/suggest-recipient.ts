/**
 * Destinataire proposé (création vocale assistée) : choisi uniquement parmi les destinataires que
 * les règles d'affectation autorisent pour la catégorie retenue (RequestPolicyLoader.recipients),
 * jamais d'après un nom seul. Deux cas fiables : un seul destinataire autorisé, ou un seul
 * destinataire autorisé dont le nom complet figure dans le texte. Sinon : à confirmer.
 */
export interface RecipientCandidate {
  id: string;
  displayName: string;
}

export interface RecipientSuggestion {
  recipientId: string;
  recipientName: string;
  recipientReason: string;
}

function normalize(text: string): string {
  return ` ${text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;
}

export function suggestRecipient(text: string, candidates: readonly RecipientCandidate[]): RecipientSuggestion | null {
  if (candidates.length === 1) {
    const [only] = candidates;
    return { recipientId: only.id, recipientName: only.displayName, recipientReason: 'Seul destinataire prévu pour cette catégorie.' };
  }
  const spoken = normalize(text);
  const named = candidates.filter((c) => {
    const name = normalize(c.displayName);
    // Nom trop court pour être reconnu sans ambiguïté (initiales, sigle de deux lettres).
    return name.trim().length >= 4 && spoken.includes(name);
  });
  if (named.length !== 1) return null;
  return {
    recipientId: named[0].id,
    recipientName: named[0].displayName,
    recipientReason: `« ${named[0].displayName} » est cité et fait partie des destinataires autorisés.`,
  };
}
