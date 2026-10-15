/**
 * Clés dont la valeur n'est jamais journalisée, ni dans les journaux applicatifs (masquée) ni
 * dans le journal d'audit (retirée) : secrets, et contenu des messages (vie privée). FR-005.
 */
export const SENSITIVE_KEY = /pass(word)?|hash|token|secret|cookie|authorization|^sid$|^text$|^message$|^content$/i;
