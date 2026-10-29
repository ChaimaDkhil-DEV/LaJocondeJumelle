/**
 * Onglet « Délais » : seuils de présentation (aucun calcul d'indicateur ici, ils viennent de
 * l'API). À ajuster si l'établissement fixe d'autres objectifs.
 */

/** En dessous de ce nombre de demandes mesurées, une moyenne est signalée « échantillon faible ». */
export const LOW_SAMPLE_THRESHOLD = 5;

/** Objectif de respect des délais (part des demandes terminées sans retard). */
export const COMPLIANCE_TARGET = 0.8;

/** Écart sous l'objectif encore considéré « proche » (en points de taux, 0.1 = 10 points). */
export const COMPLIANCE_NEAR_MARGIN = 0.1;

export type ComplianceLevel = 'met' | 'near' | 'below';

/** Tolérance des comparaisons de taux (0.8 - 0.1 vaut 0.7000000000000001 en virgule flottante). */
const EPSILON = 1e-9;

/** Niveau d'un taux de respect des délais ; null sans demande évaluée. */
export function complianceLevel(rate: number | null): ComplianceLevel | null {
  if (rate === null) return null;
  if (rate >= COMPLIANCE_TARGET - EPSILON) return 'met';
  if (rate >= COMPLIANCE_TARGET - COMPLIANCE_NEAR_MARGIN - EPSILON) return 'near';
  return 'below';
}

/** Échantillon faible : au moins une mesure, mais moins que le seuil. */
export function isLowSample(count: number): boolean {
  return count > 0 && count < LOW_SAMPLE_THRESHOLD;
}

/** « 80 % » : taux entier, pour les libellés d'objectif. */
export function percent(rate: number): string {
  return `${Math.round(rate * 100)} %`;
}
