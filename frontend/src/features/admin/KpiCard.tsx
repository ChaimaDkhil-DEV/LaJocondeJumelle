import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import type { Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { toneColors } from '../../components/Badge';
import { font, fontSize, icon as iconSize, radius, tokensOf, type AccentName, type Tone } from '../../design/tokens';

interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: LucideIcon;
  /** Teinte sémantique de la pastille d'icône (et de la tuile d'alerte active). */
  tone?: Tone;
  /** Accent décoratif de la tuile d'icône (cartes sans sens d'alerte) ; prioritaire sur `tone`. */
  accent?: AccentName;
  /** Mini-graphique décoratif, à droite de la valeur. */
  trend?: ReactNode;
}

/**
 * Indicateur chiffré du tableau de bord : libellé, tuile d'icône colorée, valeur et mini-graphique.
 * Structure stable pour les tests : le libellé est dans une div, la valeur est le seul paragraphe
 * de la carte (.MuiPaper-root).
 */
export function KpiCard({ label, value, hint, icon: Icon, tone = 'accent', accent, trend }: KpiCardProps) {
  const tile = (theme: Theme) => (accent ? tokensOf(theme).accents[accent] : toneColors(theme, tone));
  return (
    <Paper variant="elevated" sx={{ p: { xs: 2, sm: 2.5 }, minWidth: 0, display: 'grid', gap: 1.5, alignContent: 'start' }}>
      <Box sx={{ fontSize: fontSize.sm, fontWeight: font.semibold, lineHeight: 1.35, color: 'text.primary', minWidth: 0 }}>{label}</Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
        <Box
          component="span"
          aria-hidden="true"
          sx={(theme) => ({
            flex: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: `${radius.control + 2}px`,
            bgcolor: tile(theme).soft,
            color: tile(theme).main,
          })}
        >
          <Icon size={iconSize.lg + 2} strokeWidth={iconSize.stroke} />
        </Box>
        <Typography
          component="p"
          sx={{
            flex: 1,
            minWidth: 0,
            fontSize: fontSize.xl,
            fontWeight: font.semibold,
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
            overflowWrap: 'anywhere',
          }}
        >
          {value}
        </Typography>
        {trend}
      </Box>
      {hint && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {hint}
        </Typography>
      )}
    </Paper>
  );
}
