/** Constantes de la pile de démo (ports propres, mot de passe commun des comptes fictifs). */
export const DEMO_PASSWORD = 'MotDePasse-Demo-2026!';
export const PORTS = { db: 55435, api: 3200, web: 5175 } as const;
export const BASE_URL = `http://localhost:${PORTS.web}`;

/**
 * Demande prononcée dans le micro simulé (série « parcours ») : synthèse vocale française, puis
 * transcription réelle par Whisper si son serveur répond ; sinon le fournisseur local de
 * démonstration renvoie ce même texte (et les sous-titres le signalent).
 */
export const VOICE_SENTENCE =
  'Bonjour. L’étagère de la salle de sciences s’est décrochée ce matin et penche au-dessus des tables des élèves, c’est dangereux. Merci d’intervenir rapidement.';

/** Assistance de la création vocale pendant l'enregistrement : Whisper réel, local de démonstration, ou aucune. */
export type AssistMode = 'whisper' | 'demo' | 'disabled';

export function assistMode(): AssistMode {
  const mode = process.env.DEMO_ASSIST_MODE;
  return mode === 'whisper' || mode === 'demo' ? mode : 'disabled';
}
