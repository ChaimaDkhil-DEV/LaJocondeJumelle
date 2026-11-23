import type { Theme } from '@mui/material/styles';
import { font, radius, tokensOf } from '../../design/tokens';

/** Commutateur de deux ou trois choix : piste lavande, choix actuel posé en blanc. */
export const segmented = (theme: Theme) => {
  const c = tokensOf(theme);
  return {
    bgcolor: c.surfaceMuted,
    p: 0.5,
    gap: 0.5,
    borderRadius: '12px',
    '& .MuiToggleButtonGroup-grouped': {
      border: 0,
      borderRadius: '9px !important',
      px: 1.75,
      py: 0.75,
      color: c.textSecondary,
      fontWeight: font.medium,
      textTransform: 'none',
      '&.Mui-selected': { bgcolor: c.surface, color: c.accent.text, fontWeight: font.semibold, boxShadow: '0 1px 2px rgba(35, 42, 89, 0.12)' },
      '&.Mui-selected:hover': { bgcolor: c.surface },
    },
  };
};

/** Flèche de navigation de semaine ou de jour. */
export const arrowButton = (theme: Theme) => ({
  width: 40,
  height: 40,
  border: `1px solid ${tokensOf(theme).borderStrong}`,
  borderRadius: `${radius.control}px`,
});
