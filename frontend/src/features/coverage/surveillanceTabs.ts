/**
 * Onglets de la section « Surveillance » (012, research R4) : clés gardées dans l'adresse (`?onglet=`,
 * `?filtre=`) et traduction des anciennes clés de l'administration (favoris, liens internes). Les adresses
 * `/gardes/...` ne changent pas : les QR codes imprimés pointent vers `/gardes/presence`.
 */

export const ADMIN_TAB_KEYS = ['absences-retards', 'affectation', 'suivi'] as const;
export type AdminTabKey = (typeof ADMIN_TAB_KEYS)[number];

export const TRACKING_FILTERS = ['en-attente', 'prise-en-charge', 'terminee'] as const;
export type TrackingFilter = (typeof TRACKING_FILTERS)[number];

/** Ce qui est en cours est ce qu'on suit ; l'attente se traite dans « Affectation des surveillants ». */
export const DEFAULT_TRACKING_FILTER: TrackingFilter = 'prise-en-charge';

/** Chaque filtre reprend exactement la liste d'un ancien onglet (`ManagedCoverageTab`). */
export const TRACKING_SCOPE: Record<TrackingFilter, 'pending' | 'active' | 'finished'> = {
  'en-attente': 'pending',
  'prise-en-charge': 'active',
  terminee: 'finished',
};

export function trackingFilterOf(value: string | null): TrackingFilter {
  return (TRACKING_FILTERS as readonly string[]).includes(value ?? '') ? (value as TrackingFilter) : DEFAULT_TRACKING_FILTER;
}

export interface TabLocation {
  onglet: AdminTabKey;
  filtre: TrackingFilter | null;
  /** Titre de la partie à afficher dans « Affectation des surveillants ». */
  hash: string | null;
}

const LEGACY: Record<string, TabLocation> = {
  presences: { onglet: 'absences-retards', filtre: null, hash: null },
  'en-attente': { onglet: 'affectation', filtre: null, hash: null },
  doublons: { onglet: 'affectation', filtre: null, hash: 'doublons' },
  equipe: { onglet: 'affectation', filtre: null, hash: 'equipe' },
  'en-cours': { onglet: 'suivi', filtre: 'prise-en-charge', hash: null },
  terminees: { onglet: 'suivi', filtre: 'terminee', hash: null },
};

/** Nouvelle place d'une ancienne clé d'onglet de l'administration ; `null` si rien n'est à traduire. */
export function resolveLegacyTab(onglet: string | null): TabLocation | null {
  return onglet && Object.hasOwn(LEGACY, onglet) ? { ...LEGACY[onglet] } : null;
}
