import Box from '@mui/material/Box';
import type { Theme } from '@mui/material/styles';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { font, fontSize, icon as iconSize, tokensOf, type Tone } from '../design/tokens';

export function toneColors(theme: Theme, tone: Tone) {
  const t = tokensOf(theme);
  if (tone === 'neutral') return { soft: t.surfaceMuted, text: t.textSecondary, border: t.border, main: t.textSecondary };
  return t[tone];
}

interface BadgeProps {
  tone?: Tone;
  icon?: LucideIcon;
  /** Identifiant de test de l'icône (vérifie qu'un sens n'est pas porté par la seule couleur). */
  iconTestId?: string;
  children: ReactNode;
}

/**
 * Pastille de statut, de priorité ou d'état : toujours une icône et un libellé, la couleur n'est
 * qu'un complément. Le libellé est dans son propre élément (recherche exacte par le texte).
 */
export function Badge({ tone = 'neutral', icon: Icon, iconTestId, children }: BadgeProps) {
  return (
    <Box
      component="span"
      sx={(theme) => {
        const c = toneColors(theme, tone);
        return {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          height: 24,
          px: 1,
          borderRadius: '6px',
          border: `1px solid ${c.border}`,
          bgcolor: c.soft,
          color: c.text,
          fontSize: fontSize.xs,
          fontWeight: font.medium,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          maxWidth: '100%',
          transition: 'background-color 150ms, color 150ms, border-color 150ms',
          '& svg': { flex: 'none' },
        };
      }}
    >
      {Icon && <Icon size={iconSize.sm - 2} strokeWidth={2} aria-hidden="true" data-testid={iconTestId} />}
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {children}
      </Box>
    </Box>
  );
}
