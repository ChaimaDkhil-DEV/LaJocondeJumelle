import { frFR } from '@mui/material/locale';
import { alpha, createTheme, type Theme } from '@mui/material/styles';
import { ChevronDown, CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { cardShadow, colors, font, fontSize, icon, motion, radius, shadow, type ColorMode, type ColorTokens } from '../design/tokens';

declare module '@mui/material/styles' {
  interface Theme {
    /** Tokens de couleur du mode courant (design/tokens.ts), pour les composants partagés. */
    tokens: ColorTokens;
  }
  interface ThemeOptions {
    tokens?: ColorTokens;
  }
}

declare module '@mui/material/Paper' {
  interface PaperPropsVariantOverrides {
    /** Carte posée : bordure fine et ombre très légère (cartes et indicateurs du tableau de bord). */
    elevated: true;
  }
}

/** Contrôles tactiles : 44 px au doigt (WCAG 2.5.8 / bonnes pratiques mobiles), plus compacts à la souris. */
const COARSE = '@media (pointer: coarse)';

/** Icône d'erreur (Lucide « circle-alert ») utilisée en masque CSS devant les messages d'erreur des champs. */
const ERROR_ICON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='12' x2='12' y1='8' y2='12'/%3E%3Cline x1='12' x2='12.01' y1='16' y2='16'/%3E%3C/svg%3E\")";

const alertIcon = (Component: typeof Info) => <Component size={icon.lg} strokeWidth={icon.stroke} aria-hidden="true" />;

function SelectIcon(props: { className?: string }) {
  return <ChevronDown size={icon.md} strokeWidth={icon.stroke} aria-hidden="true" {...props} />;
}

/**
 * Thème de l'application, entièrement dérivé des design tokens (design/tokens.ts).
 * Les composants MUI y sont harmonisés une fois pour toutes : mêmes rayons, mêmes hauteurs,
 * même anneau de focus, une seule ombre. Le mode sombre n'est pas activé mais ses tokens existent.
 */
export function createAppTheme(mode: ColorMode = 'light'): Theme {
  const c = colors[mode];
  const focusRing = `0 0 0 3px ${alpha(c.accent.main, 0.2)}`;

  return createTheme(
    {
      tokens: c,
      palette: {
        mode,
        primary: { main: c.accent.main, dark: c.accent.hover, light: c.accent.soft, contrastText: c.accent.contrastText },
        secondary: { main: c.textSecondary, contrastText: c.surface },
        error: { main: c.error.main, dark: c.error.text, light: c.error.soft, contrastText: '#ffffff' },
        warning: { main: c.warning.main, dark: c.warning.text, light: c.warning.soft, contrastText: '#ffffff' },
        success: { main: c.success.main, dark: c.success.text, light: c.success.soft, contrastText: '#ffffff' },
        info: { main: c.info.main, dark: c.info.text, light: c.info.soft, contrastText: '#ffffff' },
        background: { default: c.background, paper: c.surface },
        text: { primary: c.text, secondary: c.textSecondary, disabled: c.textMuted },
        divider: c.border,
        action: { hover: c.surfaceMuted, selected: c.accent.soft, focus: c.surfaceMuted },
      },
      shape: { borderRadius: radius.control },
      typography: {
        fontFamily: font.family,
        fontSize: fontSize.sm,
        fontWeightLight: font.regular,
        fontWeightRegular: font.regular,
        fontWeightMedium: font.medium,
        fontWeightBold: font.semibold,
        // Titre de page (h1), puis un cran par niveau ; la graisse 600 distingue h4 de h5 à taille égale.
        h1: { fontSize: fontSize.xxl, fontWeight: font.semibold, lineHeight: 1.25, letterSpacing: '-0.02em' },
        h2: { fontSize: fontSize.xl, fontWeight: font.semibold, lineHeight: 1.3, letterSpacing: '-0.015em' },
        h3: { fontSize: fontSize.lg, fontWeight: font.semibold, lineHeight: 1.35, letterSpacing: '-0.01em' },
        h4: { fontSize: fontSize.lg, fontWeight: font.semibold, lineHeight: 1.4, letterSpacing: '-0.01em' },
        h5: { fontSize: fontSize.lg, fontWeight: font.medium, lineHeight: 1.4 },
        h6: { fontSize: fontSize.md, fontWeight: font.medium, lineHeight: 1.5 },
        subtitle1: { fontSize: fontSize.md, fontWeight: font.medium, lineHeight: 1.5 },
        subtitle2: { fontSize: fontSize.sm, fontWeight: font.medium, lineHeight: 1.45 },
        body1: { fontSize: fontSize.md, lineHeight: 1.5 },
        body2: { fontSize: fontSize.sm, lineHeight: 1.45 },
        button: { fontSize: fontSize.sm, fontWeight: font.medium, textTransform: 'none', letterSpacing: 0 },
        caption: { fontSize: fontSize.xs, lineHeight: 1.4 },
        overline: { fontSize: fontSize.xs, fontWeight: font.medium, textTransform: 'none', letterSpacing: 0, lineHeight: 1.4 },
      },
      shadows: ['none', ...Array<string>(24).fill(shadow)] as Theme['shadows'],
      transitions: {
        duration: {
          shortest: motion.fast,
          shorter: motion.fast,
          short: motion.base,
          standard: motion.base,
          complex: motion.base,
          enteringScreen: motion.base,
          leavingScreen: motion.fast,
        },
        easing: { easeInOut: motion.easing, easeOut: motion.easing, easeIn: motion.easing, sharp: motion.easing },
      },
      components: {
        MuiCssBaseline: {
          styleOverrides: {
            html: { WebkitTextSizeAdjust: '100%' },
            body: {
              backgroundColor: c.background,
              color: c.text,
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
              fontSynthesisWeight: 'none',
            },
            '::selection': { backgroundColor: alpha(c.accent.main, 0.18) },
            // Focus clavier toujours visible ; les champs ont leur propre anneau (OutlinedInput).
            ':focus-visible': { outline: `2px solid ${c.focus}`, outlineOffset: 2 },
            'input:focus-visible, textarea:focus-visible': { outline: 'none' },
            '@media (prefers-reduced-motion: reduce)': {
              '*, *::before, *::after': {
                animationDuration: '0.01ms !important',
                animationIterationCount: '1 !important',
                transitionDuration: '0.01ms !important',
                scrollBehavior: 'auto !important',
              },
            },
          },
        },
        MuiButtonBase: {
          defaultProps: { disableRipple: true },
          styleOverrides: {
            root: { '&.Mui-focusVisible': { outline: `2px solid ${c.focus}`, outlineOffset: 2 } },
          },
        },
        MuiButton: {
          defaultProps: { disableElevation: true },
          styleOverrides: {
            root: {
              minHeight: 36,
              padding: '6px 14px',
              borderRadius: radius.control,
              gap: 2,
              transition: `background-color ${motion.fast}ms, border-color ${motion.fast}ms, color ${motion.fast}ms`,
              [COARSE]: { minHeight: 44 },
              '& .MuiButton-startIcon': { marginLeft: -2, marginRight: 6 },
              '& .MuiButton-endIcon': { marginLeft: 6, marginRight: -2 },
              variants: [
                {
                  props: { variant: 'contained', color: 'primary' },
                  style: { backgroundColor: c.accent.main, '&:hover': { backgroundColor: c.accent.hover } },
                },
                {
                  props: { variant: 'outlined', color: 'primary' },
                  style: {
                    color: c.text,
                    backgroundColor: c.surface,
                    borderColor: c.borderStrong,
                    '&:hover': { backgroundColor: c.surfaceMuted, borderColor: c.borderStrong },
                  },
                },
                {
                  props: { variant: 'outlined', color: 'error' },
                  style: {
                    color: c.error.text,
                    borderColor: c.error.border,
                    '&:hover': { backgroundColor: c.error.soft, borderColor: c.error.border },
                  },
                },
                {
                  props: { variant: 'text', color: 'primary' },
                  style: { color: c.textSecondary, '&:hover': { backgroundColor: c.surfaceMuted, color: c.text } },
                },
                {
                  props: { variant: 'text', color: 'error' },
                  style: { color: c.error.text, '&:hover': { backgroundColor: c.error.soft } },
                },
                {
                  props: { size: 'large' },
                  style: { minHeight: 44, padding: '10px 18px', fontSize: fontSize.sm },
                },
                {
                  props: { size: 'small' },
                  style: { minHeight: 32, padding: '4px 10px', [COARSE]: { minHeight: 44 } },
                },
              ],
            },
          },
        },
        MuiIconButton: {
          styleOverrides: {
            root: {
              width: 36,
              height: 36,
              borderRadius: radius.control,
              color: c.textSecondary,
              transition: `background-color ${motion.fast}ms, color ${motion.fast}ms`,
              '&:hover': { backgroundColor: c.surfaceMuted, color: c.text },
              [COARSE]: { width: 44, height: 44 },
              variants: [{ props: { size: 'small' }, style: { width: 32, height: 32, [COARSE]: { width: 44, height: 44 } } }],
            },
          },
        },
        MuiTooltip: {
          defaultProps: { enterDelay: 300, arrow: false },
          styleOverrides: {
            tooltip: { backgroundColor: c.tooltip, fontSize: fontSize.xs, fontWeight: font.medium, borderRadius: 6, padding: '6px 8px' },
          },
        },
        MuiPaper: {
          styleOverrides: {
            root: { backgroundImage: 'none' },
            rounded: { borderRadius: radius.card },
            outlined: { borderColor: c.border },
          },
          variants: [
            {
              props: { variant: 'elevated' },
              style: { border: `1px solid ${c.border}`, boxShadow: cardShadow },
            },
          ],
        },
        MuiCard: { defaultProps: { variant: 'outlined' }, styleOverrides: { root: { borderRadius: radius.card } } },
        MuiDialog: {
          styleOverrides: {
            paper: { borderRadius: radius.card, border: `1px solid ${c.border}` },
            paperFullWidth: { '@media (max-width: 599.95px)': { margin: 16, width: 'calc(100% - 32px)', maxHeight: 'calc(100% - 32px)' } },
          },
        },
        MuiDialogTitle: {
          styleOverrides: { root: { fontSize: fontSize.lg, fontWeight: font.medium, lineHeight: 1.4, padding: '20px 24px 8px' } },
        },
        MuiDialogContent: { styleOverrides: { root: { padding: '8px 24px 16px' } } },
        MuiDialogContentText: { styleOverrides: { root: { color: c.textSecondary, fontSize: fontSize.md } } },
        MuiDialogActions: {
          styleOverrides: { root: { padding: '12px 24px 20px', gap: 8, flexWrap: 'wrap', '& > :not(style) ~ :not(style)': { marginLeft: 0 } } },
        },
        MuiBackdrop: { styleOverrides: { root: { '&:not(.MuiBackdrop-invisible)': { backgroundColor: alpha('#18181b', 0.4) } } } },
        MuiTextField: { defaultProps: { fullWidth: true } },
        // Libellés toujours au-dessus des champs (et non flottants dans la bordure).
        MuiInputLabel: {
          defaultProps: { shrink: true },
          styleOverrides: {
            root: {
              position: 'relative',
              transform: 'none',
              marginBottom: 6,
              fontSize: fontSize.sm,
              fontWeight: font.medium,
              lineHeight: 1.45,
              color: c.text,
              whiteSpace: 'normal',
              overflow: 'visible',
              maxWidth: '100%',
              '&.MuiInputLabel-shrink, &.MuiInputLabel-outlined, &.MuiInputLabel-outlined.MuiInputLabel-shrink': {
                transform: 'none',
                maxWidth: '100%',
              },
              '&.Mui-focused': { color: c.text },
              '&.Mui-error': { color: c.text },
              '&.Mui-disabled': { color: c.textSecondary },
            },
            asterisk: { color: c.error.text },
          },
        },
        MuiFormLabel: {
          styleOverrides: {
            root: {
              fontSize: fontSize.sm,
              fontWeight: font.medium,
              color: c.text,
              '&.Mui-focused': { color: c.text },
              '&.Mui-error': { color: c.text },
            },
          },
        },
        MuiOutlinedInput: {
          styleOverrides: {
            root: {
              borderRadius: radius.control,
              backgroundColor: c.surface,
              transition: `box-shadow ${motion.fast}ms`,
              '& .MuiOutlinedInput-notchedOutline': { top: 0, borderColor: c.control, transition: `border-color ${motion.fast}ms` },
              '& .MuiOutlinedInput-notchedOutline legend': { display: 'none' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: c.textSecondary },
              '&.Mui-focused': { boxShadow: focusRing },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: c.accent.main, borderWidth: 1 },
              '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: c.error.main },
              '&.Mui-error.Mui-focused': { boxShadow: `0 0 0 3px ${alpha(c.error.main, 0.18)}` },
              '&.Mui-disabled': { backgroundColor: c.surfaceMuted },
              '&.Mui-disabled .MuiOutlinedInput-notchedOutline': { borderColor: c.border },
              variants: [{ props: { size: 'small' }, style: { '& .MuiOutlinedInput-input': { padding: '6px 10px' } } }],
            },
            input: { padding: '10px 12px', height: 24, '&::placeholder': { color: c.textMuted, opacity: 1 } },
            multiline: { padding: '10px 12px' },
            adornedStart: {
              paddingLeft: 12,
              '& .MuiInputAdornment-root': { color: c.textMuted, marginRight: 0 },
              '& .MuiOutlinedInput-input': { paddingLeft: 8 },
            },
          },
        },
        MuiInputBase: { styleOverrides: { root: { fontSize: fontSize.md } } },
        MuiInputAdornment: { styleOverrides: { root: { color: c.textMuted } } },
        MuiSelect: {
          defaultProps: { IconComponent: SelectIcon },
          styleOverrides: { icon: { color: c.textSecondary, right: 10 } },
        },
        MuiFormHelperText: {
          styleOverrides: {
            root: {
              marginLeft: 0,
              marginRight: 0,
              marginTop: 6,
              fontSize: fontSize.sm,
              color: c.textSecondary,
              // Un texte d'aide reste lisible (contraste AA) même quand son champ est désactivé.
              '&.Mui-disabled': { color: c.textSecondary },
              '&.Mui-error': {
                color: c.error.text,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                '&::before': {
                  content: '""',
                  flex: 'none',
                  width: 16,
                  height: 16,
                  marginTop: 2,
                  backgroundColor: 'currentColor',
                  mask: `${ERROR_ICON} center / contain no-repeat`,
                  WebkitMask: `${ERROR_ICON} center / contain no-repeat`,
                },
              },
            },
          },
        },
        MuiFormControlLabel: {
          styleOverrides: { root: { marginLeft: -6 }, label: { fontSize: fontSize.md } },
        },
        MuiCheckbox: { styleOverrides: { root: { color: c.control, padding: 6, [COARSE]: { padding: 10 } } } },
        MuiRadio: { styleOverrides: { root: { color: c.control, padding: 6, [COARSE]: { padding: 10 } } } },
        MuiAutocomplete: {
          defaultProps: {
            popupIcon: <ChevronDown size={icon.md} strokeWidth={icon.stroke} aria-hidden="true" />,
            clearIcon: <X size={icon.sm} strokeWidth={icon.stroke} aria-hidden="true" />,
          },
          styleOverrides: {
            inputRoot: { paddingTop: 6, paddingBottom: 6 },
            paper: { border: `1px solid ${c.border}`, borderRadius: radius.control, boxShadow: shadow, marginTop: 4 },
            option: { fontSize: fontSize.sm, minHeight: 36, [COARSE]: { minHeight: 44 } },
            tag: { margin: 2 },
          },
        },
        MuiChip: {
          defaultProps: { deleteIcon: <X size={icon.sm} strokeWidth={icon.stroke} aria-hidden="true" /> },
          styleOverrides: {
            root: { borderRadius: 6, height: 26, fontSize: fontSize.xs, fontWeight: font.medium, backgroundColor: c.surfaceMuted, color: c.text },
            deleteIcon: { color: c.textSecondary, '&:hover': { color: c.text } },
          },
        },
        MuiAlert: {
          defaultProps: {
            iconMapping: {
              info: alertIcon(Info),
              success: alertIcon(CircleCheck),
              warning: alertIcon(TriangleAlert),
              error: alertIcon(CircleAlert),
            },
          },
          styleOverrides: {
            root: { borderRadius: radius.control, fontSize: fontSize.sm, alignItems: 'flex-start', padding: '8px 12px' },
            icon: { paddingTop: 9, paddingBottom: 0, marginRight: 10, opacity: 1 },
            message: { paddingTop: 9, paddingBottom: 9, minWidth: 0, overflowWrap: 'anywhere' },
            action: { paddingTop: 2, marginRight: -4 },
            standard: {
              variants: (['info', 'success', 'warning', 'error'] as const).map((severity) => ({
                props: { severity },
                style: {
                  backgroundColor: c[severity].soft,
                  color: c[severity].text,
                  border: `1px solid ${c[severity].border}`,
                  '& .MuiAlert-icon': { color: c[severity].main },
                },
              })),
            },
            filled: { variants: [{ props: { severity: 'error' }, style: { backgroundColor: c.error.text } }] },
          },
        },
        MuiAlertTitle: { styleOverrides: { root: { fontSize: fontSize.sm, fontWeight: font.medium, marginBottom: 4 } } },
        MuiTabs: {
          styleOverrides: {
            root: { minHeight: 44, borderBottom: `1px solid ${c.border}` },
            indicator: { height: 2, backgroundColor: c.accent.main },
          },
        },
        MuiTab: {
          styleOverrides: {
            root: {
              minHeight: 44,
              minWidth: 0,
              padding: '10px 12px',
              fontSize: fontSize.sm,
              fontWeight: font.medium,
              color: c.textSecondary,
              transition: `color ${motion.fast}ms`,
              '&:hover': { color: c.text },
              '&.Mui-selected': { color: c.text },
            },
          },
        },
        MuiMenu: {
          styleOverrides: {
            paper: { border: `1px solid ${c.border}`, borderRadius: radius.control, marginTop: 4 },
            list: { padding: 4 },
          },
        },
        MuiPopover: { styleOverrides: { paper: { borderRadius: radius.control } } },
        MuiMenuItem: {
          styleOverrides: {
            root: {
              fontSize: fontSize.sm,
              minHeight: 36,
              borderRadius: 6,
              [COARSE]: { minHeight: 44 },
              '&:hover': { backgroundColor: c.surfaceMuted },
              '&.Mui-selected': { backgroundColor: c.accent.soft },
              '&.Mui-selected:hover': { backgroundColor: c.accent.soft },
              '&.Mui-focusVisible': { backgroundColor: c.surfaceMuted, outlineOffset: -2 },
            },
          },
        },
        MuiListItemButton: {
          styleOverrides: { root: { minHeight: 40, borderRadius: radius.control, [COARSE]: { minHeight: 44 } } },
        },
        // Tableaux : en-tête sur fond discret (aussi en mode collant), chiffres à chasse fixe, pas
        // de filet sous la dernière ligne (le tableau est posé dans une carte bordée).
        MuiTableCell: {
          styleOverrides: {
            root: { borderBottom: `1px solid ${c.border}`, fontSize: fontSize.sm, lineHeight: 1.45, fontVariantNumeric: 'tabular-nums' },
            head: { backgroundColor: c.surfaceMuted, color: c.textSecondary, fontWeight: font.medium, whiteSpace: 'nowrap' },
            stickyHeader: { backgroundColor: c.surfaceMuted },
            sizeSmall: { padding: '10px 12px', '&:first-of-type': { paddingLeft: 16 }, '&:last-of-type': { paddingRight: 16 } },
          },
        },
        MuiTableRow: {
          styleOverrides: {
            root: {
              '.MuiTableBody-root > &:last-of-type > .MuiTableCell-root': { borderBottom: 0 },
              '&.MuiTableRow-hover:hover': { backgroundColor: c.surfaceMuted },
            },
          },
        },
        MuiDivider: { styleOverrides: { root: { borderColor: c.border } } },
        MuiSkeleton: {
          defaultProps: { animation: 'pulse' },
          styleOverrides: { root: { backgroundColor: c.surfaceMuted }, rounded: { borderRadius: 6 }, text: { borderRadius: 4 } },
        },
        MuiSlider: {
          styleOverrides: {
            root: { height: 4, padding: '13px 0' },
            rail: { backgroundColor: c.borderStrong, opacity: 1 },
            thumb: { width: 14, height: 14, boxShadow: 'none', '&:hover, &.Mui-focusVisible': { boxShadow: focusRing } },
          },
        },
        MuiBadge: { styleOverrides: { badge: { fontSize: fontSize.xs, fontWeight: font.medium, height: 18, minWidth: 18, padding: '0 5px' } } },
        MuiLink: {
          defaultProps: { underline: 'hover' },
          styleOverrides: { root: { fontWeight: font.medium, color: c.accent.main } },
        },
        MuiLinearProgress: {
          styleOverrides: { root: { height: 4, borderRadius: 2, backgroundColor: c.accent.soft }, bar: { borderRadius: 2 } },
        },
        MuiDrawer: { styleOverrides: { paper: { borderRight: `1px solid ${c.border}` } } },
        MuiSnackbar: { defaultProps: { anchorOrigin: { vertical: 'bottom', horizontal: 'center' } } },
      },
    },
    frFR,
  );
}

export const theme = createAppTheme('light');
