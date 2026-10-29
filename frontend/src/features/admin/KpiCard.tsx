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
  /** À droite du libellé : aide (« i ») de l'indicateur. */
  labelExtra?: ReactNode;
  /** Sous la valeur : badges (taille d'échantillon…). */
  meta?: ReactNode;
  /**
   * Évolution par rapport à la période précédente (↑/↓), sous la valeur. Emplacement prévu :
   * l'API ne fournit pas encore de période de comparaison.
   */
  delta?: ReactNode;
  /** Sous-texte limité à une ligne (texte complet au survol). */
  singleLineHint?: boolean;
  /** Valeur absente (« Aucune donnée ») : plus petite et grise, distincte d'un zéro. */
  muted?: boolean;
}

/**
 * Indicateur chiffré du tableau de bord : libellé, tuile d'icône colorée, valeur et mini-graphique.
 * Structure stable pour les tests : le libellé est dans une div, la valeur est le seul paragraphe
 * de la carte (.MuiPaper-root).
 */
export function KpiCard({ label, value, hint, icon: Icon, tone = 'accent', accent, trend, labelExtra, meta, delta, singleLineHint = false, muted = false }: KpiCardProps) {
  const tile = (theme: Theme) => (accent ? tokensOf(theme).accents[accent] : toneColors(theme, tone));
  return (
    <Paper variant="elevated" sx={{ p: { xs: 2, sm: 2.5 }, minWidth: 0, display: 'grid', gap: 1.5, alignContent: 'start' }}>
      {labelExtra ? (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, minWidth: 0 }}>
          <Box sx={{ fontSize: fontSize.sm, fontWeight: font.semibold, lineHeight: 1.35, color: 'text.primary', minWidth: 0 }}>{label}</Box>
          {labelExtra}
        </Box>
      ) : (
        <Box sx={{ fontSize: fontSize.sm, fontWeight: font.semibold, lineHeight: 1.35, color: 'text.primary', minWidth: 0 }}>{label}</Box>
      )}
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
            fontSize: muted ? fontSize.md : fontSize.xl,
            fontWeight: muted ? font.regular : font.semibold,
            color: muted ? 'text.secondary' : 'text.primary',
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
      {delta}
      {meta && <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75 }}>{meta}</Box>}
      {hint && (
        <Typography
          variant="caption"
          color="text.secondary"
          title={singleLineHint ? hint : undefined}
          sx={{ display: 'block', ...(singleLineHint && { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }) }}
        >
          {hint}
        </Typography>
      )}
    </Paper>
  );
}
