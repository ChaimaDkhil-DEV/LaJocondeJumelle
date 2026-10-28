/**
 * Design tokens : source unique des couleurs, typographies, espacements, rayons, ombre et durées.
 * Le thème MUI (app/theme.ts) et les composants partagés lisent ces valeurs ; aucun écran ne doit
 * coder une couleur ou une taille en dur.
 *
 * Contrastes vérifiés (WCAG AA) : texte principal et secondaire ≥ 7:1, texte discret ≥ 4.5:1 sur
 * fond et sur carte ; les couleurs « text » des tons sémantiques ≥ 4.5:1 sur leur fond « soft ».
 */

export type ColorMode = 'light' | 'dark';

/** Ton d'un badge ou d'un message : neutre, accent, ou l'une des 4 couleurs sémantiques réservées. */
export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info';

export interface ToneColors {
  /** Couleur pleine (bouton, icône, bordure active). */
  main: string;
  /** Fond très léger (badge, bandeau). */
  soft: string;
  /** Texte et icône posés sur `soft`. */
  text: string;
  /** Bordure discrète posée sur `soft`. */
  border: string;
}

/** Accents décoratifs : tuiles d'indicateurs, séries de graphiques, pastilles. */
export type AccentName = 'indigo' | 'cyan' | 'orange' | 'green';

export interface ColorTokens {
  /** Fond de page (gris lavande : les cartes blanches s'en détachent). */
  background: string;
  /** Cartes, barre latérale, champs. */
  surface: string;
  /** Survol, zones secondaires, squelettes. */
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  /** Bordure des champs et cases à cocher : contraste ≥ 3:1 (WCAG 1.4.11). */
  control: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  /** Une seule couleur d'accent : indigo sobre. */
  accent: ToneColors & { hover: string; contrastText: string };
  success: ToneColors;
  warning: ToneColors;
  error: ToneColors;
  info: ToneColors;
  /** Anneau de focus clavier. */
  focus: string;
  /** Fond de l'infobulle. */
  tooltip: string;
  /**
   * Séries des graphiques : contraste ≥ 3:1 sur la carte (WCAG 1.4.11), distinguables par les
   * daltoniens (indigo / sarcelle) ; « terminées » est en plus tiretée.
   */
  chart: {
    created: string;
    completed: string;
    /** Séries supplémentaires (camembert, mini-graphiques), dans l'ordre d'usage : ≥ 3:1 sur la carte. */
    series: readonly string[];
  };
  /**
   * Accents des tuiles d'indicateurs : `main` (icône, ≥ 4.5:1 sur `soft`) et `soft` (fond de tuile),
   * pour varier les cartes sans changer le sens des couleurs sémantiques.
   */
  accents: Record<AccentName, { main: string; soft: string }>;
}

export const colors: Record<ColorMode, ColorTokens> = {
  light: {
    background: '#eef0f8',
    surface: '#ffffff',
    surfaceMuted: '#f4f5fb',
    border: '#e3e6f0',
    borderStrong: '#cfd3e3',
    control: '#8b8b9c',
    text: '#18181b',
    textSecondary: '#52525b',
    // ≥ 4.5:1 sur la carte blanche et sur le fond lavande.
    textMuted: '#62626e',
    accent: {
      main: '#4f46e5',
      hover: '#4338ca',
      soft: '#eef2ff',
      text: '#3730a3',
      border: '#c7d2fe',
      contrastText: '#ffffff',
    },
    success: { main: '#15803d', soft: '#f0fdf4', text: '#166534', border: '#bbf7d0' },
    warning: { main: '#b45309', soft: '#fffbeb', text: '#92400e', border: '#fde68a' },
    error: { main: '#dc2626', soft: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
    info: { main: '#0369a1', soft: '#f0f9ff', text: '#075985', border: '#bae6fd' },
    focus: '#4f46e5',
    tooltip: '#27272a',
    chart: { created: '#4f46e5', completed: '#0d9488', series: ['#4f46e5', '#0891b2', '#ea580c', '#16a34a', '#9333ea', '#64748b'] },
    accents: {
      indigo: { main: '#4f46e5', soft: '#e8eafd' },
      cyan: { main: '#0e7490', soft: '#dff4f8' },
      orange: { main: '#c2410c', soft: '#fdeee4' },
      green: { main: '#15803d', soft: '#e3f5ea' },
    },
  },
  // Prêt pour un mode sombre : il suffit de passer « dark » à createAppTheme (app/theme.ts).
  dark: {
    background: '#0f0f11',
    surface: '#18181b',
    surfaceMuted: '#232327',
    border: '#2e2e33',
    borderStrong: '#3f3f46',
    control: '#71717a',
    text: '#fafafa',
    textSecondary: '#c4c4cc',
    textMuted: '#a1a1aa',
    accent: {
      main: '#818cf8',
      hover: '#a5b4fc',
      soft: '#1e1b4b',
      text: '#c7d2fe',
      border: '#3730a3',
      contrastText: '#0f0f11',
    },
    success: { main: '#4ade80', soft: '#052e16', text: '#bbf7d0', border: '#14532d' },
    warning: { main: '#fbbf24', soft: '#2a1a03', text: '#fde68a', border: '#78350f' },
    error: { main: '#f87171', soft: '#2a0a0a', text: '#fecaca', border: '#7f1d1d' },
    info: { main: '#38bdf8', soft: '#04212f', text: '#bae6fd', border: '#0c4a6e' },
    focus: '#a5b4fc',
    tooltip: '#3f3f46',
    chart: { created: '#6366f1', completed: '#0d9488', series: ['#818cf8', '#22d3ee', '#fb923c', '#4ade80', '#c084fc', '#94a3b8'] },
    accents: {
      indigo: { main: '#a5b4fc', soft: '#1e1b4b' },
      cyan: { main: '#67e8f9', soft: '#083344' },
      orange: { main: '#fdba74', soft: '#431407' },
      green: { main: '#86efac', soft: '#052e16' },
    },
  },
};

/**
 * Tokens de couleur du thème courant. Repli sur le mode clair quand un composant est rendu hors du
 * ThemeProvider de l'application (tests de composants isolés) : aucune couleur n'est alors perdue.
 */
export function tokensOf(theme: { tokens?: ColorTokens; palette: { mode: ColorMode } }): ColorTokens {
  return theme.tokens ?? colors[theme.palette.mode];
}

/** Une seule police, trois graisses : 600 réservé aux titres de page et aux chiffres clés. */
export const font = {
  family: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  regular: 400,
  medium: 500,
  semibold: 600,
} as const;

/**
 * Six tailles seulement. 16 px pour le texte courant et les champs (évite le zoom automatique
 * d'iOS sur les champs de saisie), 14 px pour les métadonnées et les boutons, 28 px pour les
 * titres de page et les chiffres des alertes.
 */
export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 28,
} as const;

/** Échelle d'espacement en px (4/8/12/16/24/32). Dans `sx`, l'unité MUI vaut 8 px : 0.5, 1, 1.5, 2, 3, 4. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = {
  /** Contrôles : boutons, champs, menus. */
  control: 10,
  /** Cartes et fenêtres. */
  card: 16,
  /** Avatars et pastilles. */
  round: 999,
} as const;

/** Ombre des éléments flottants (menus, fenêtres, toasts). */
export const shadow = '0 4px 16px rgba(16, 24, 40, 0.08)';

/** Ombre très douce de toutes les cartes, en plus de leur bordure discrète. */
export const cardShadow = '0 1px 2px rgba(35, 42, 89, 0.04), 0 6px 20px rgba(35, 42, 89, 0.06)';

/** Micro-interactions : 150 à 200 ms, désactivées si l'utilisateur réduit les animations. */
export const motion = { fast: 150, base: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' } as const;

/** Icônes Lucide (style outline) : une seule taille par contexte, trait constant. */
export const icon = { sm: 16, md: 18, lg: 20, stroke: 1.75 } as const;

/** Largeurs de mise en page. */
export const layout = { sidebar: 256, content: 1200, readable: 720 } as const;

/** Couleurs douces des avatars (fond, texte) : contraste ≥ 4.5:1. */
export const avatarColors: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: '#e0e7ff', fg: '#3730a3' },
  { bg: '#dcfce7', fg: '#166534' },
  { bg: '#fef3c7', fg: '#92400e' },
  { bg: '#fce7f3', fg: '#9d174d' },
  { bg: '#e0f2fe', fg: '#075985' },
  { bg: '#ede9fe', fg: '#5b21b6' },
  { bg: '#f1f5f9', fg: '#334155' },
];
