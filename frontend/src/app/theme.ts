import { createTheme } from '@mui/material/styles';
import { frFR } from '@mui/material/locale';

/**
 * Thème MUI : contrastes AA (couleurs MUI par défaut sur fond blanc, texte ≥ 4.5:1),
 * focus clavier toujours visible, cibles tactiles d'au moins 44 px (WCAG 2.2 — 2.5.8).
 */
export const theme = createTheme(
  {
    palette: {
      primary: { main: '#1d4f91' },
      secondary: { main: '#6b3fa0' },
      error: { main: '#b3261e' },
      warning: { main: '#8a4b00' },
      success: { main: '#2e6b30' },
      background: { default: '#f6f7f9' },
    },
    typography: {
      fontSize: 15,
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiButtonBase: {
        defaultProps: { disableRipple: false },
        styleOverrides: {
          root: {
            '&.Mui-focusVisible': { outline: '3px solid #1d4f91', outlineOffset: 2 },
          },
        },
      },
      MuiButton: { styleOverrides: { root: { minHeight: 44 } } },
      MuiIconButton: { styleOverrides: { root: { minWidth: 44, minHeight: 44 } } },
      MuiListItemButton: { styleOverrides: { root: { minHeight: 44 } } },
      MuiTextField: { defaultProps: { fullWidth: true } },
    },
  },
  frFR,
);
