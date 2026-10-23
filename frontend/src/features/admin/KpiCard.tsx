import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import type { Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { CircleCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { toneColors } from '../../components/Badge';
import { font, fontSize, icon as iconSize, radius, tokensOf, type Tone } from '../../design/tokens';

interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: LucideIcon;
  /** Teinte de la pastille d'icône (et de la tuile d'alerte active). */
  tone?: Tone;
  /**
   * Tuile d'alerte (« À traiter maintenant ») : fond teinté quand elle est active, chiffre plus
   * grand, et mention écrite « À traiter » ou « Rien à signaler » (jamais la couleur seule).
   */
  alert?: { active: boolean };
}

/**
 * Indicateur chiffré du tableau de bord. Structure stable pour les tests : le libellé est dans une
 * div, la valeur est le seul paragraphe de la carte (.MuiPaper-root).
 */
export function KpiCard({ label, value, hint, icon: Icon, tone = 'accent', alert }: KpiCardProps) {
  const active = alert?.active ?? false;
  const colorsOf = (theme: Theme) => toneColors(theme, tone);
  return (
    <Paper
      variant="elevated"
      sx={(theme) => ({
        p: 2,
        minWidth: 0,
        display: 'grid',
        gap: 1,
        alignContent: 'start',
        ...(active && { bgcolor: colorsOf(theme).soft, borderColor: colorsOf(theme).border }),
      })}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          minWidth: 0,
          fontSize: fontSize.sm,
          fontWeight: font.medium,
          lineHeight: 1.35,
          color: 'text.secondary',
        }}
      >
        <Box
          component="span"
          aria-hidden="true"
          sx={(theme) => ({
            flex: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: alert ? 36 : 28,
            height: alert ? 36 : 28,
            borderRadius: `${radius.control}px`,
            // Sur une tuile active (fond teinté), la pastille repasse en blanc pour rester visible.
            bgcolor: active ? tokensOf(theme).surface : colorsOf(theme).soft,
            color: colorsOf(theme).main,
          })}
        >
          <Icon size={alert ? iconSize.lg : iconSize.sm} strokeWidth={iconSize.stroke} />
        </Box>
        {label}
      </Box>
      <Typography
        component="p"
        sx={{
          fontSize: alert ? fontSize.xxl : fontSize.xl,
          fontWeight: font.semibold,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums',
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </Typography>
      {alert && (
        <Box
          component="span"
          sx={(theme) => ({
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            fontSize: fontSize.xs,
            fontWeight: font.medium,
            color: active ? colorsOf(theme).text : tokensOf(theme).textSecondary,
            '& svg': { flex: 'none' },
          })}
        >
          {active ? <TriangleAlert size={iconSize.sm - 2} strokeWidth={2} aria-hidden="true" /> : <CircleCheck size={iconSize.sm - 2} strokeWidth={2} aria-hidden="true" />}
          {active ? 'À traiter' : 'Rien à signaler'}
        </Box>
      )}
      {hint && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {hint}
        </Typography>
      )}
    </Paper>
  );
}
