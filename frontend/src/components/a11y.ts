/**
 * Masque visuellement un contenu tout en le laissant aux lecteurs d'écran (annonces, libellés).
 * Valeurs en px explicites : dans `sx`, `width: 1` signifierait 100 %.
 */
export const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;
